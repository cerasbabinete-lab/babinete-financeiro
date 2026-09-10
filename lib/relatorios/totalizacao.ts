// ============================================================
// lib/relatorios/totalizacao.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Calcula o relatório "Totalização" (2.8) — listagem nota a
//         nota de NF-e emitidas no período, com CFOP, cliente e
//         totais. Diferente dos outros 7 relatórios, não é agregado
//         por mês — 1 linha por nota. Também expõe o dado do gráfico
//         "Mês a mês" (ano vigente) e do modo "Comparar períodos",
//         ambos com escopo de data INDEPENDENTE do filtro da tabela
//         (decisão explícita da sessão de brainstorm).
// Conecta com: types/relatorios.ts (RelatorioTotalizacao,
//              ItemTotalizacao, ComparacaoPeriodosResultado),
//              pages/api/relatorios/totalizacao.ts,
//              lib/relatorios/paginacao.ts (paginarConsulta,
//              dividirEmLotes), lib/relatorios/formatadores.ts
//              (limiteSuperiorIntervalo)
// Referência: decisões registradas em chat (sessão de brainstorm
//             abreviada, sem documento formal de especificação
//             gerado — Passo 2 da entrevista pulado a pedido do
//             Maycon: "1, manda bala")
//
// Decisões confirmadas por Maycon nesta sessão:
//   - Fonte: receitas (não contas_receber) — mesmo raciocínio já
//     usado em Faturamento/Curva ABC: "quanto foi emitido", não
//     "quanto foi cobrado"
//   - CFOP vem de receitas_itens.cfop — sempre o mesmo CFOP em
//     todos os itens de uma nota, confirmado por Maycon (não há
//     necessidade de tratar variação por item)
//   - Desconto = receitas.fatura_valor_desconto (bloco <fat> do
//     XML da NF-e) — já populado hoje pelo parser, sem trabalho
//     novo. Este relatório mostra o VALOR do desconto, não a causa
//     (pode ser desconto de condição de pagamento OU benefício
//     comercial do cliente — Maycon confirmou que as duas causas
//     existem e se misturam no mesmo campo; distinguir a causa
//     exigiria dado novo, fora de escopo desta versão)
//   - status_nf: exclui tudo diferente de 100 (autorizada, código
//     cStat da SEFAZ) E diferente de NULL (nota antiga, importada
//     antes deste campo existir, não deve sumir do relatório)
//   - Ordenação: crescente por número de NF-e e data de emissão
//   - Sem paginação/limite de linhas na tabela — lista tudo,
//     rolagem simples, mesmo padrão dos outros 7 relatórios
//   - ICMS: fora de escopo desta versão (não existe no schema hoje
//     — schema+parser é frente separada, não empacotada aqui)
// ============================================================

import { supabase } from '@/lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  RelatorioTotalizacao,
  ItemTotalizacao,
  FiltrosTotalizacao,
  ClienteOpcaoFiltro,
  ComparacaoPeriodosResultado,
  DadosGrafico,
  FiltroIntervaloDatas,
} from '@/types/relatorios'
import { limiteSuperiorIntervalo, formatarMesBR } from '@/lib/relatorios/formatadores'
import { paginarConsulta, dividirEmLotes } from '@/lib/relatorios/paginacao'

interface LinhaReceitaTotalizacao {
  id: string
  numero_nf: number
  data_emissao: string
  cliente_id: number | null
  cliente_nome: string | null
  valor_nf: number
  fatura_valor_desconto: number | null
  valor_frete: number | null
  status_nf: number | null
}

// ============================================================
// classificarCfop() — 1º dígito do CFOP decide dentro/fora do
// estado (Seção do tipo CfopFiltroTotalizacao em types/relatorios.ts)
// ============================================================
function classificarCfop(cfop: string | null): 'dentro_estado' | 'fora_estado' | 'outro' {
  if (!cfop) return 'outro'
  if (cfop.startsWith('5')) return 'dentro_estado'
  if (cfop.startsWith('6')) return 'fora_estado'
  return 'outro'
}

// ============================================================
// gerarRelatorioTotalizacao()
// ============================================================
export async function gerarRelatorioTotalizacao(
  filtros: FiltrosTotalizacao,
  client: SupabaseClient = supabase,
): Promise<RelatorioTotalizacao> {
  // ── 1. Notas no período, já com status_nf válido filtrado no
  // banco (100 = autorizada, ou NULL = nota antiga sem este campo) ──
  const linhasReceitas = await paginarConsulta<LinhaReceitaTotalizacao>((inicio, fim) => {
    let query = client
      .from('receitas')
      .select('id, numero_nf, data_emissao, cliente_id, cliente_nome, valor_nf, fatura_valor_desconto, valor_frete, status_nf')
      .gte('data_emissao', filtros.dataInicial)
      .lte('data_emissao', limiteSuperiorIntervalo(filtros.dataFinal))
      .or('status_nf.eq.100,status_nf.is.null')
      .order('numero_nf', { ascending: true })

    if (filtros.clienteId) query = query.eq('cliente_id', filtros.clienteId)

    return query.range(inicio, fim)
  })

  // ── 2. CFOP de cada nota — vem de receitas_itens, buscado em
  // lotes pelos ids de receita encontrados no passo 1 (Maycon
  // confirmou: sempre o mesmo CFOP em todos os itens de uma nota,
  // então basta o primeiro item encontrado por nota) ─────────────
  const idsReceitas = linhasReceitas.map(r => r.id)
  const mapaCfop = new Map<string, string>()

  for (const lote of dividirEmLotes(idsReceitas)) {
    if (lote.length === 0) continue
    const itensDoLote = await paginarConsulta<{ receita_id: string; cfop: string | null }>((inicio, fim) =>
      client
        .from('receitas_itens')
        .select('receita_id, cfop')
        .in('receita_id', lote)
        .range(inicio, fim),
    )
    for (const item of itensDoLote) {
      if (item.cfop && !mapaCfop.has(item.receita_id)) {
        mapaCfop.set(item.receita_id, item.cfop)
      }
    }
  }

  // ── 3. Monta os itens, aplica filtro de CFOP (não dá pra
  // expressar isso na consulta de receitas — o cfop só existe
  // depois do join manual do passo 2) e ordena (Maycon: crescente
  // por número de NF-e e data de emissão) ────────────────────────
  let itens: ItemTotalizacao[] = linhasReceitas.map(r => {
    const valorOriginal = Number(r.valor_nf) || 0
    const desconto = Number(r.fatura_valor_desconto) || 0
    const frete = Number(r.valor_frete) || 0
    return {
      numeroNf: r.numero_nf,
      dataEmissao: r.data_emissao.slice(0, 10),
      cfop: mapaCfop.get(r.id) ?? null,
      clienteId: r.cliente_id,
      clienteNome: r.cliente_nome ?? '—',
      valorOriginal, // receitas.valor_nf = vNF (valor final da nota, já com desconto/frete aplicados pela própria NF-e)
      valor: valorOriginal + desconto - frete, // = vProd (valor dos produtos, "valor original" no sentido que o Maycon usa) — verificado contra XML real da nota 5478: vNF(665,73) + desconto(33,45) - frete(30,00) = vProd(669,18). Fórmula com o sinal certo, confirmada contra o documento fiscal, não contra relato de tela.
      desconto,
      frete,
      valorLiquido: (valorOriginal + desconto - frete) - desconto - frete, // = valor(vProd) - desconto - frete, igual à instrução original "Valor total - desconto - frete", agora com "Valor" correto (vProd) como base
    }
  })

  if (filtros.cfopFiltro) {
    itens = itens.filter(i => classificarCfop(i.cfop) === filtros.cfopFiltro)
  }

  itens.sort((a, b) => a.numeroNf - b.numeroNf || a.dataEmissao.localeCompare(b.dataEmissao))

  // Filtro incluirFreteNoValor ficou sem efeito aqui — a coluna
  // "valor" já embute frete incondicionalmente pela nova fórmula
  // (ver comentário em FiltrosTotalizacao, types/relatorios.ts)
  const freteTotal = itens.reduce((s, i) => s + i.frete, 0)
  const valorTotal = itens.reduce((s, i) => s + i.valor, 0)
  const descontoTotal = itens.reduce((s, i) => s + i.desconto, 0)

  return {
    filtros,
    itens,
    totalNotas: itens.length,
    valorTotal,
    descontoTotal,
    freteTotal,
    valorLiquido: valorTotal - descontoTotal - freteTotal, // usa valorTotal (soma da coluna Valor, já = vProd) — igual à instrução original "Valor total - desconto - frete"
  }
}

// ============================================================
// buscarClientesParaFiltro()
// Popula o dropdown de cliente da tela (decidido: dropdown, não
// busca livre) — lista o cadastro de clientes inteiro, não só os
// que aparecem no período filtrado atual (senão o filtro nunca
// poderia "adicionar" um cliente à visão corrente — mesmo
// raciocínio já usado em retiradas.ts/buscarNomesBeneficiarios)
// ============================================================
export async function buscarClientesParaFiltro(client: SupabaseClient = supabase): Promise<ClienteOpcaoFiltro[]> {
  const linhas = await paginarConsulta<{ id: number; razao: string }>((inicio, fim) =>
    client
      .from('clientes')
      .select('id, razao')
      .order('razao', { ascending: true })
      .range(inicio, fim),
  )
  return linhas.map(c => ({ id: c.id, nome: c.razao }))
}

// ============================================================
// gerarGraficoMesAMesTotalizacao()
// Modo "Mês a mês" do gráfico — soma de valor_nf por mês, escopo
// de um ANO INTEIRO, independente do filtro de período da tabela
// (decisão explícita: abre no ano vigente — Passo 3 da entrevista)
// ============================================================
export async function gerarGraficoMesAMesTotalizacao(
  ano: number,
  client: SupabaseClient = supabase,
): Promise<DadosGrafico> {
  const dataInicial = `${ano}-01-01`
  const dataFinal = `${ano}-12-31`

  const linhas = await paginarConsulta<{ data_emissao: string; valor_nf: number; status_nf: number | null }>((inicio, fim) =>
    client
      .from('receitas')
      .select('data_emissao, valor_nf, status_nf')
      .gte('data_emissao', dataInicial)
      .lte('data_emissao', limiteSuperiorIntervalo(dataFinal))
      .or('status_nf.eq.100,status_nf.is.null')
      .range(inicio, fim),
  )

  const porMes = new Map<string, number>()
  for (let m = 1; m <= 12; m++) {
    porMes.set(`${ano}-${String(m).padStart(2, '0')}`, 0)
  }
  for (const r of linhas) {
    const mes = r.data_emissao.slice(0, 7)
    porMes.set(mes, (porMes.get(mes) ?? 0) + (Number(r.valor_nf) || 0))
  }

  return {
    tipo: 'barras',
    pontos: Array.from(porMes.entries()).map(([mes, valor]) => ({ rotulo: formatarMesBR(mes), valor })),
  }
}

// ============================================================
// compararPeriodosTotalizacao()
// Modo "Comparar períodos" — 100% manual, sem sugestão automática
// de Período B (decisão explícita). Não retorna DadosGrafico — ver
// nota em types/relatorios.ts sobre ComparacaoPeriodosResultado
// (por que este modo não usa o mesmo tipo dos outros gráficos)
// ============================================================
export async function compararPeriodosTotalizacao(
  periodoA: FiltroIntervaloDatas,
  periodoB: FiltroIntervaloDatas,
  client: SupabaseClient = supabase,
): Promise<ComparacaoPeriodosResultado> {
  async function totalDoPeriodo(periodo: FiltroIntervaloDatas) {
    const linhas = await paginarConsulta<{ valor_nf: number; status_nf: number | null }>((inicio, fim) =>
      client
        .from('receitas')
        .select('valor_nf, status_nf')
        .gte('data_emissao', periodo.dataInicial)
        .lte('data_emissao', limiteSuperiorIntervalo(periodo.dataFinal))
        .or('status_nf.eq.100,status_nf.is.null')
        .range(inicio, fim),
    )
    return { valorTotal: linhas.reduce((s, r) => s + (Number(r.valor_nf) || 0), 0), notas: linhas.length }
  }

  const [resultadoA, resultadoB] = await Promise.all([totalDoPeriodo(periodoA), totalDoPeriodo(periodoB)])

  return {
    periodoA,
    periodoB,
    valorTotalA: resultadoA.valorTotal,
    valorTotalB: resultadoB.valorTotal,
    notasA: resultadoA.notas,
    notasB: resultadoB.notas,
  }
}
