// ============================================================
// lib/relatorios/totalizacaoDespesas.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Calcula o relatório "Totalização de Despesas" (2.9).
//         Também expõe o dado do gráfico "Mês a mês" e do modo
//         "Comparar períodos", ambos com escopo de data
//         INDEPENDENTE do filtro da tabela (mesma decisão do 2.8).
// Conecta com: types/relatorios.ts, pages/api/relatorios/totalizacao-despesas.ts,
//              lib/relatorios/paginacao.ts, lib/relatorios/formatadores.ts
//
// CORREÇÃO DEFINITIVA (pedido direto de Maycon, sem mais tentativa de
// achar critério "certo" por conta própria): o relatório deve mostrar
// EXATAMENTE o que a tela de Despesas (app/despesas/page.tsx +
// components/despesas/DespesasTabela.tsx) mostra. Isso NÃO é mais
// interpretação minha — é tradução literal da função real de lá,
// lib/despesasService.ts::buscarDespesas():
//   - Fonte: despesas, deleted_at IS NULL. SEM exclusão de
//     origem_tipo='pessoal_socio' — a tela de Despesas não exclui
//     (confirmado: despesa Pessoal (Sócio) aparece no Total do mês)
//   - Filtro de período é por VENCIMENTO, aplicado sobre as parcelas
//     em JS (não em SQL): uma despesa "sobrevive" se ALGUMA parcela
//     ativa (deleted_at IS NULL) tem data_vencimento >= dataInicial
//     E (separadamente) ALGUMA parcela ativa tem data_vencimento <=
//     dataFinal — são 2 checagens independentes, não precisa ser A
//     MESMA parcela satisfazendo as duas pontas. Replicado aqui
//     exatamente assim, por mais "solto" que pareça — mudar essa
//     regra é que faria o relatório voltar a divergir da tela
//   - Grão: 1 linha por DESPESA (documento), não por parcela
//   - Valor somado: despesas.valor_total (não valor_original) —
//     confirmado em DespesasTabela.tsx, rodapé "Total do mês"
//   - Vencimento exibido: menor data_vencimento entre as parcelas
//     ATIVAS da despesa (mesma regra de DespesasTabela.tsx,
//     "primeiraParcela") — não é restrito ao período filtrado
//
// Histórico de tentativas anteriores que NÃO devem ser repetidas:
// já foi tentado (1) despesas_parcelas com grão de parcela, e (2)
// contas_a_pagar — nenhuma bateu com a tela de Despesas porque
// nenhuma delas é a fonte que a tela de Despesas usa de fato. A
// fonte é despesas + despesas_parcelas, com a lógica exata acima.
// ============================================================

import { supabase } from '@/lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  RelatorioTotalizacaoDespesas,
  ItemTotalizacaoDespesas,
  FiltrosTotalizacaoDespesas,
  FornecedorOpcaoFiltro,
  ComparacaoPeriodosResultadoDespesas,
  DadosGrafico,
  FiltroIntervaloDatas,
  TipoFornecedorOuNaoClassificado,
} from '@/types/relatorios'
import { formatarMesBR } from '@/lib/relatorios/formatadores'
import { paginarConsulta, dividirEmLotes } from '@/lib/relatorios/paginacao'

const NAO_CLASSIFICADO = 'nao_classificado' as const
const ROTULO_NAO_CLASSIFICADO = 'Não classificado'

interface LinhaDespesaBase {
  id: string
  documento_numero: string | null
  documento_data_emissao: string | null
  created_at: string
  fornecedor_id: number
  favorecido_nome: string
  valor_total: number
}

interface LinhaParcela {
  despesa_id: string
  data_vencimento: string
  deleted_at: string | null
}

// ============================================================
// buscarDespesasComParcelas() — busca TODAS as despesas ativas (sem
// filtro de data em SQL, mesmo padrão de lib/despesasService.ts —
// o filtro de vencimento é aplicado depois, em JS, sobre as
// parcelas) e as parcelas de cada uma, pra replicar exatamente a
// lógica de buscarDespesas() do módulo Despesas
// ============================================================
async function buscarDespesasComParcelas(client: SupabaseClient): Promise<{ despesas: LinhaDespesaBase[]; parcelasPorDespesa: Map<string, LinhaParcela[]> }> {
  const despesas = await paginarConsulta<LinhaDespesaBase>((inicio, fim) =>
    client
      .from('despesas')
      .select('id, documento_numero, documento_data_emissao, created_at, fornecedor_id, favorecido_nome, valor_total')
      .is('deleted_at', null)
      .range(inicio, fim),
  )

  const idsDespesas = despesas.map(d => d.id)
  const parcelasPorDespesa = new Map<string, LinhaParcela[]>()
  for (const lote of dividirEmLotes(idsDespesas)) {
    if (lote.length === 0) continue
    const parcelasDoLote = await paginarConsulta<LinhaParcela>((inicio, fim) =>
      client
        .from('despesas_parcelas')
        .select('despesa_id, data_vencimento, deleted_at')
        .in('despesa_id', lote)
        .range(inicio, fim),
    )
    for (const p of parcelasDoLote) {
      if (!parcelasPorDespesa.has(p.despesa_id)) parcelasPorDespesa.set(p.despesa_id, [])
      parcelasPorDespesa.get(p.despesa_id)!.push(p)
    }
  }

  return { despesas, parcelasPorDespesa }
}

// ============================================================
// gerarRelatorioTotalizacaoDespesas()
// ============================================================
export async function gerarRelatorioTotalizacaoDespesas(
  filtros: FiltrosTotalizacaoDespesas,
  client: SupabaseClient = supabase,
): Promise<RelatorioTotalizacaoDespesas> {
  const { despesas, parcelasPorDespesa } = await buscarDespesasComParcelas(client)

  // Filtro de vencimento — EXATAMENTE a lógica de
  // lib/despesasService.ts::buscarDespesas(): 2 checagens
  // independentes de "alguma parcela ativa bate", não a mesma
  // parcela pras duas pontas
  const despesasNoIntervalo = despesas.filter(d => {
    const parcelasAtivas = (parcelasPorDespesa.get(d.id) ?? []).filter(p => !p.deleted_at)
    const bateInicio = parcelasAtivas.some(p => p.data_vencimento >= filtros.dataInicial)
    const bateFim = parcelasAtivas.some(p => p.data_vencimento <= filtros.dataFinal)
    return bateInicio && bateFim
  })

  const linhasFiltradasPorFornecedor = filtros.fornecedorId
    ? despesasNoIntervalo.filter(d => d.fornecedor_id === filtros.fornecedorId)
    : despesasNoIntervalo

  // ── tipo_fornecedor_id de cada fornecedor que aparece no conjunto
  // — em lotes, mesmo padrão do relatório 2.6 ─────────────────────
  const idsFornecedores = Array.from(new Set(linhasFiltradasPorFornecedor.map(d => d.fornecedor_id)))
  const mapaTipo = new Map<number, TipoFornecedorOuNaoClassificado>()
  for (const lote of dividirEmLotes(idsFornecedores)) {
    if (lote.length === 0) continue
    const fornecedoresDoLote = await paginarConsulta<{ id: number; tipo_fornecedor_id: number | null }>((inicio, fim) =>
      client.from('fornecedores').select('id, tipo_fornecedor_id').in('id', lote).range(inicio, fim),
    )
    for (const f of fornecedoresDoLote) mapaTipo.set(f.id, f.tipo_fornecedor_id ?? NAO_CLASSIFICADO)
  }

  let idsFiltrados = linhasFiltradasPorFornecedor
  if (filtros.tipoFornecedorFiltro !== undefined) {
    idsFiltrados = linhasFiltradasPorFornecedor.filter(d => (mapaTipo.get(d.fornecedor_id) ?? NAO_CLASSIFICADO) === filtros.tipoFornecedorFiltro)
  }

  // ── Lookup AO VIVO dos nomes das categorias — só as usadas no
  // conjunto final, nunca a tabela inteira (mesma exigência do 2.6) ──
  const idsCategoriasUsadas = Array.from(
    new Set(idsFiltrados.map(d => mapaTipo.get(d.fornecedor_id) ?? NAO_CLASSIFICADO).filter((t): t is number => t !== NAO_CLASSIFICADO)),
  )
  const mapaRotulo = new Map<number, string>()
  for (const lote of dividirEmLotes(idsCategoriasUsadas)) {
    if (lote.length === 0) continue
    const categoriasDoLote = await paginarConsulta<{ id: number; nome: string }>((inicio, fim) =>
      client.from('fornecedor_categorias').select('id, nome').in('id', lote).range(inicio, fim),
    )
    for (const c of categoriasDoLote) mapaRotulo.set(c.id, c.nome)
  }

  function rotuloDoTipo(tipo: TipoFornecedorOuNaoClassificado): string {
    if (tipo === NAO_CLASSIFICADO) return ROTULO_NAO_CLASSIFICADO
    return mapaRotulo.get(tipo) ?? ROTULO_NAO_CLASSIFICADO
  }

  const itens: ItemTotalizacaoDespesas[] = idsFiltrados.map(d => {
    const tipo = mapaTipo.get(d.fornecedor_id) ?? NAO_CLASSIFICADO
    // Vencimento exibido = menor data_vencimento entre as parcelas
    // ATIVAS — mesma regra de DespesasTabela.tsx ("primeiraParcela"),
    // não restrita ao período filtrado
    const parcelasAtivas = (parcelasPorDespesa.get(d.id) ?? []).filter(p => !p.deleted_at)
    const vencimento = parcelasAtivas.length > 0
      ? parcelasAtivas.reduce((menor, p) => (p.data_vencimento < menor ? p.data_vencimento : menor), parcelasAtivas[0].data_vencimento).slice(0, 10)
      : null
    return {
      id: d.id,
      documentoNumero: d.documento_numero,
      dataEmissao: (d.documento_data_emissao ?? d.created_at).slice(0, 10),
      vencimento,
      tipoFornecedor: tipo,
      tipoFornecedorRotulo: rotuloDoTipo(tipo),
      fornecedorId: d.fornecedor_id,
      favorecidoNome: d.favorecido_nome,
      valor: Number(d.valor_total) || 0,
    }
  })

  itens.sort((a, b) => (a.vencimento ?? '').localeCompare(b.vencimento ?? '') || (a.documentoNumero ?? '').localeCompare(b.documentoNumero ?? ''))

  return {
    filtros,
    itens,
    totalDespesas: itens.length,
    valorTotal: itens.reduce((s, i) => s + i.valor, 0),
  }
}

// ============================================================
// buscarFornecedoresParaFiltro()
// ============================================================
export async function buscarFornecedoresParaFiltro(client: SupabaseClient = supabase): Promise<FornecedorOpcaoFiltro[]> {
  const linhas = await paginarConsulta<{ id: number; razao: string }>((inicio, fim) =>
    client.from('fornecedores').select('id, razao').order('razao', { ascending: true }).range(inicio, fim),
  )
  return linhas.map(f => ({ id: f.id, nome: f.razao }))
}

// ============================================================
// gerarGraficoMesAMesTotalizacaoDespesas()
// Modo "Mês a mês" — soma de valor_total por mês de VENCIMENTO
// (1º vencimento ativo de cada despesa), escopo de um ANO INTEIRO,
// independente do filtro de período da tabela
// ============================================================
export async function gerarGraficoMesAMesTotalizacaoDespesas(
  ano: number,
  client: SupabaseClient = supabase,
): Promise<DadosGrafico> {
  const { despesas, parcelasPorDespesa } = await buscarDespesasComParcelas(client)

  const porMes = new Map<string, number>()
  for (let m = 1; m <= 12; m++) porMes.set(`${ano}-${String(m).padStart(2, '0')}`, 0)

  for (const d of despesas) {
    const parcelasAtivas = (parcelasPorDespesa.get(d.id) ?? []).filter(p => !p.deleted_at)
    if (parcelasAtivas.length === 0) continue
    const primeiroVencimento = parcelasAtivas.reduce((menor, p) => (p.data_vencimento < menor ? p.data_vencimento : menor), parcelasAtivas[0].data_vencimento)
    const mes = primeiroVencimento.slice(0, 7)
    if (porMes.has(mes)) porMes.set(mes, (porMes.get(mes) ?? 0) + (Number(d.valor_total) || 0))
  }

  return {
    tipo: 'barras',
    pontos: Array.from(porMes.entries()).map(([mes, valor]) => ({ rotulo: formatarMesBR(mes), valor })),
  }
}

// ============================================================
// compararPeriodosTotalizacaoDespesas()
// Modo "Comparar períodos" — 100% manual, sem sugestão automática
// de Período B (mesma decisão explícita do 2.8)
// ============================================================
export async function compararPeriodosTotalizacaoDespesas(
  periodoA: FiltroIntervaloDatas,
  periodoB: FiltroIntervaloDatas,
  client: SupabaseClient = supabase,
): Promise<ComparacaoPeriodosResultadoDespesas> {
  const { despesas, parcelasPorDespesa } = await buscarDespesasComParcelas(client)

  function totalDoPeriodo(periodo: FiltroIntervaloDatas) {
    const filtradas = despesas.filter(d => {
      const parcelasAtivas = (parcelasPorDespesa.get(d.id) ?? []).filter(p => !p.deleted_at)
      const bateInicio = parcelasAtivas.some(p => p.data_vencimento >= periodo.dataInicial)
      const bateFim = parcelasAtivas.some(p => p.data_vencimento <= periodo.dataFinal)
      return bateInicio && bateFim
    })
    return {
      valorTotal: filtradas.reduce((s, d) => s + (Number(d.valor_total) || 0), 0),
      despesas: filtradas.length,
    }
  }

  const resultadoA = totalDoPeriodo(periodoA)
  const resultadoB = totalDoPeriodo(periodoB)

  return {
    periodoA,
    periodoB,
    valorTotalA: resultadoA.valorTotal,
    valorTotalB: resultadoB.valorTotal,
    despesasA: resultadoA.despesas,
    despesasB: resultadoB.despesas,
  }
}
