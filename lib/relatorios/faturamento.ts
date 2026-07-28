// ============================================================
// lib/relatorios/faturamento.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Calcula o relatório "Faturamento por período" (2.1) —
//         receita bruta, ticket médio e clientes novos x
//         recorrentes, agrupados por mês, a partir de `receitas`.
//         Somente leitura — não escreve em nenhuma tabela.
// Conecta com: types/relatorios.ts (RelatorioFaturamento),
//              pages/api/relatorios/faturamento.ts
// Referência: Especificacao_Modulo_Relatorios.md, Seção 2.1
// Nota de schema: a spec pede para "confirmar se receitas tem
// soft-delete antes de referenciar deleted_at" — conferido em
// sql/receitas_contas_receber.sql (Fase 0 deste build): a tabela
// `receitas` NÃO tem coluna deleted_at (só receitas_duplicatas e
// contas_receber têm). Por isso este arquivo não filtra por
// deleted_at — não porque foi ignorado, porque a coluna não existe.
// ============================================================

import { supabase } from '@/lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FaturamentoMes, RelatorioFaturamento, FiltroIntervaloDatas } from '@/types/relatorios'

const TABELA = 'receitas'

// Linha mínima que a consulta precisa trazer — evita puxar a NF-e
// inteira (itens, XML, endereço etc.) só para calcular agregados
interface LinhaReceitaAgregacao {
  id: string
  data_emissao: string
  valor_nf: number
  cliente_id: number | null
  cliente_cpf_cnpj: string | null
  cliente_nome: string | null
}

// ============================================================
// chaveCliente()
// Identidade do cliente para fins de "novo x recorrente". Usa
// cliente_id quando presente (é uma FK real); cai para cpf/cnpj, e
// por último para o nome, só nos casos em que a NF-e foi importada
// sem vínculo de cliente_id (campo é opcional em receitas — ver
// sql/receitas_contas_receber.sql). Documentado aqui porque é uma
// decisão de robustez, não uma regra vinda da spec.
// ============================================================
function chaveCliente(r: LinhaReceitaAgregacao): string {
  if (r.cliente_id !== null) return `id:${r.cliente_id}`
  if (r.cliente_cpf_cnpj) return `doc:${r.cliente_cpf_cnpj}`
  return `nome:${r.cliente_nome ?? 'desconhecido'}`
}

function mesDaData(dataIso: string): string {
  return dataIso.slice(0, 7) // 'YYYY-MM-DDTHH...' -> 'YYYY-MM'
}

// ============================================================
// gerarRelatorioFaturamento()
// client tem default = supabase (browser) para permitir uso direto
// de uma tela, se algum dia precisar; API routes passam o client
// admin explicitamente — mesmo padrão de lib/contasAPagarService.ts
// ============================================================
export async function gerarRelatorioFaturamento(
  filtros: FiltroIntervaloDatas,
  client: SupabaseClient = supabase,
): Promise<RelatorioFaturamento> {
  // ── 1. Receitas dentro do período filtrado ──────────────────
  const { data: receitasPeriodo, error: erroPeriodo } = await client
    .from(TABELA)
    .select('id, data_emissao, valor_nf, cliente_id, cliente_cpf_cnpj, cliente_nome')
    .gte('data_emissao', filtros.dataInicial)
    .lte('data_emissao', filtros.dataFinal + 'T23:59:59')
    .order('data_emissao', { ascending: true })

  if (erroPeriodo) {
    console.error('[relatorios/faturamento] erro ao buscar receitas do período:', erroPeriodo)
    throw new Error(erroPeriodo.message)
  }

  const linhas = (receitasPeriodo ?? []) as LinhaReceitaAgregacao[]

  // ── 2. Primeira compra histórica de cada cliente que aparece no
  // período — precisa olhar TODO o histórico (Seção 2.1: "menor
  // data_emissao em todo o histórico, não só no período filtrado"),
  // por isso é uma consulta separada, sem filtro de data, restrita
  // aos clientes que já foram identificados acima (evita puxar o
  // histórico de clientes que nem aparecem no período) ──────────
  const idsClientesNoPeriodo = Array.from(
    new Set(linhas.map(r => r.cliente_id).filter((id): id is number => id !== null)),
  )

  const primeiraComprapPorChave = new Map<string, string>() // chaveCliente -> menor data_emissao (histórico completo)

  if (idsClientesNoPeriodo.length > 0) {
    const { data: historico, error: erroHistorico } = await client
      .from(TABELA)
      .select('data_emissao, cliente_id, cliente_cpf_cnpj, cliente_nome')
      .in('cliente_id', idsClientesNoPeriodo)
      .order('data_emissao', { ascending: true })

    if (erroHistorico) {
      console.error('[relatorios/faturamento] erro ao buscar histórico de clientes:', erroHistorico)
      throw new Error(erroHistorico.message)
    }

    // Como veio ordenado ascendente, o primeiro registro de cada
    // chave que encontramos já é o mais antigo — não precisa de Math.min
    for (const r of (historico ?? []) as LinhaReceitaAgregacao[]) {
      const chave = chaveCliente(r)
      if (!primeiraComprapPorChave.has(chave)) {
        primeiraComprapPorChave.set(chave, r.data_emissao)
      }
    }
  }

  // Clientes sem cliente_id (fallback por documento/nome) não estão
  // cobertos pela consulta acima (ela filtra por cliente_id IN (...)).
  // Preenche a primeira compra desses casos usando só o que já temos
  // em mãos no próprio período — é uma aproximação aceitável: se a
  // primeira compra real desse cliente foi ANTES do período filtrado
  // mas sempre sem cliente_id vinculado, o sistema vai classificá-lo
  // como "novo" mesmo sendo recorrente. Chamando atenção pra isso no
  // resumo de entrega — é uma limitação de dado (cliente_id ausente),
  // não de lógica.
  for (const r of linhas) {
    if (r.cliente_id !== null) continue
    const chave = chaveCliente(r)
    const atual = primeiraComprapPorChave.get(chave)
    if (!atual || r.data_emissao < atual) {
      primeiraComprapPorChave.set(chave, r.data_emissao)
    }
  }

  // ── 3. Agrupamento por mês ───────────────────────────────────
  const mesesMap = new Map<string, {
    receitaBruta: number
    quantidadeNotas: number
    clientesNovos: Set<string>
    clientesRecorrentes: Set<string>
  }>()

  for (const r of linhas) {
    const mes = mesDaData(r.data_emissao)
    if (!mesesMap.has(mes)) {
      mesesMap.set(mes, { receitaBruta: 0, quantidadeNotas: 0, clientesNovos: new Set(), clientesRecorrentes: new Set() })
    }
    const grupo = mesesMap.get(mes)!
    grupo.receitaBruta += Number(r.valor_nf) || 0
    grupo.quantidadeNotas += 1

    const chave = chaveCliente(r)
    const primeiraCompra = primeiraComprapPorChave.get(chave)
    const ehPrimeiraCompraNesteMes = primeiraCompra ? mesDaData(primeiraCompra) === mes : false

    if (ehPrimeiraCompraNesteMes) grupo.clientesNovos.add(chave)
    else grupo.clientesRecorrentes.add(chave)
  }

  const meses: FaturamentoMes[] = Array.from(mesesMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, g]) => ({
      mes,
      receitaBruta: g.receitaBruta,
      quantidadeNotas: g.quantidadeNotas,
      ticketMedio: g.quantidadeNotas > 0 ? g.receitaBruta / g.quantidadeNotas : 0,
      clientesNovos: g.clientesNovos.size,
      clientesRecorrentes: g.clientesRecorrentes.size,
    }))

  // ── 4. Totalizador do intervalo ──────────────────────────────
  const receitaBrutaTotal = meses.reduce((s, m) => s + m.receitaBruta, 0)
  const quantidadeNotasTotal = meses.reduce((s, m) => s + m.quantidadeNotas, 0)
  const clientesNovosTotal = meses.reduce((s, m) => s + m.clientesNovos, 0)
  const clientesRecorrentesTotal = meses.reduce((s, m) => s + m.clientesRecorrentes, 0)

  return {
    periodo: filtros,
    meses,
    totalizador: {
      receitaBruta: receitaBrutaTotal,
      ticketMedio: quantidadeNotasTotal > 0 ? receitaBrutaTotal / quantidadeNotasTotal : 0,
      clientesNovosTotal,
      clientesRecorrentesTotal,
    },
    grafico: {
      tipo: 'linha',
      pontos: meses.map(m => ({ rotulo: m.mes, valor: m.receitaBruta })),
    },
  }
}
