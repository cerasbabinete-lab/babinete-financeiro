// ============================================================
// lib/relatorios/curvaAbc.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Calcula o relatório "Curva ABC" (2.5) — 3 dimensões
//         (clientes, fornecedores, produtos), classificação pelo
//         princípio de Pareto, prazo médio de pagamento exclusivo
//         de fornecedores, drill-down mensal exclusivo de produtos.
// Conecta com: types/relatorios.ts (RelatorioCurvaAbc,
//              DrillDownProdutoAbc), pages/api/relatorios/curva-abc.ts,
//              lib/relatorios/paginacao.ts (paginarConsulta)
// Referência: Especificacao_Modulo_Relatorios.md, Seção 2.5
//
// Decisões confirmadas por Maycon nesta sessão:
//   - Dimensão Clientes usa `receitas` (NF-e emitida), não
//     contas_receber (título cobrado)
// Decisões de engenharia não detalhadas na spec:
//   - Dimensão Fornecedores (contas_a_pagar) filtrada por
//     data_vencimento — mesmo raciocínio do Faturamento/receitas:
//     mede "quanto foi comprado/gerado" no período, não "quanto foi
//     pago" (isso já é o relatório de Fluxo de Caixa)
//   - Dimensão Produtos agrupada por `descricao` (não codigo_produto)
//     — mais legível, e nem toda NF-e tem código de produto
//     preenchido de forma consistente
//
// CORREÇÃO Critical §2.2 (Handoff_Modulo_Relatorios_Audit_para_QA.md)
// — nenhuma das 4 consultas deste arquivo paginava; PostgREST corta
// silenciosamente em 1000 linhas. Todas as 4 agora usam
// paginarConsulta(). Consultas com limite superior de data
// (agregarClientes, agregarProdutos, buscarDrillDownProduto) também
// passam a usar limiteSuperiorIntervalo() (fuso explícito, Finding
// §6.4) em vez de concatenar 'T23:59:59' sem offset.
// ============================================================

import { supabase } from '@/lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  RelatorioCurvaAbc,
  DrillDownProdutoAbc,
  ItemCurvaAbc,
  ClasseAbc,
  DimensaoAbc,
  FiltroIntervaloDatas,
} from '@/types/relatorios'
import { limiteSuperiorIntervalo } from '@/lib/relatorios/formatadores'
import { paginarConsulta } from '@/lib/relatorios/paginacao'

interface LinhaReceitaAbc {
  valor_nf: number
  cliente_id: number | null
  cliente_cpf_cnpj: string | null
  cliente_nome: string | null
}

interface LinhaContaPagarAbc {
  valor: number
  fornecedor_id: number | null
  favorecido_nome: string
  status: string
  data_vencimento: string
  data_baixa: string | null
}

interface LinhaReceitaItemAbc {
  valor_total: number
  descricao: string | null
  receitas: { data_emissao: string }
}

// ============================================================
// classificarAbc()
// Lógica comum aos 3 dimensões — princípio de Pareto (Seção 2.5)
// ============================================================
function classificarAbc(itens: { nome: string; valor: number; prazoMedioPagamentoDias?: number }[]): { itensClassificados: ItemCurvaAbc[]; total: number } {
  const ordenados = [...itens].sort((a, b) => b.valor - a.valor)
  const total = ordenados.reduce((s, i) => s + i.valor, 0)

  let acumulado = 0
  const itensClassificados: ItemCurvaAbc[] = ordenados.map(item => {
    acumulado += item.valor
    const percentualAcumulado = total > 0 ? (acumulado / total) * 100 : 0
    const classe: ClasseAbc = percentualAcumulado <= 80 ? 'A' : percentualAcumulado <= 95 ? 'B' : 'C'
    return {
      nome: item.nome,
      valor: item.valor,
      percentualIndividual: total > 0 ? (item.valor / total) * 100 : 0,
      percentualAcumulado,
      classe,
      prazoMedioPagamentoDias: item.prazoMedioPagamentoDias,
    }
  })

  return { itensClassificados, total }
}

// ============================================================
// gerarRelatorioCurvaAbc()
// ============================================================
export async function gerarRelatorioCurvaAbc(
  dimensao: DimensaoAbc,
  filtros: FiltroIntervaloDatas,
  client: SupabaseClient = supabase,
): Promise<RelatorioCurvaAbc> {
  let brutos: { nome: string; valor: number; prazoMedioPagamentoDias?: number }[] = []

  if (dimensao === 'clientes') {
    brutos = await agregarClientes(filtros, client)
  } else if (dimensao === 'fornecedores') {
    brutos = await agregarFornecedores(filtros, client)
  } else {
    brutos = await agregarProdutos(filtros, client)
  }

  const { itensClassificados, total } = classificarAbc(brutos)

  return {
    dimensao,
    periodo: filtros,
    itens: itensClassificados,
    totalPeriodo: total,
    grafico: {
      tipo: 'pareto',
      pontos: itensClassificados.map(i => ({ rotulo: i.nome, valor: i.valor, percentualAcumulado: i.percentualAcumulado })),
    },
  }
}

// ============================================================
// agregarClientes() — dimensão Clientes, fonte `receitas`
// ============================================================
async function agregarClientes(filtros: FiltroIntervaloDatas, client: SupabaseClient) {
  const linhas = await paginarConsulta<LinhaReceitaAbc>((inicio, fim) =>
    client
      .from('receitas')
      .select('valor_nf, cliente_id, cliente_cpf_cnpj, cliente_nome')
      .gte('data_emissao', filtros.dataInicial)
      .lte('data_emissao', limiteSuperiorIntervalo(filtros.dataFinal))
      .range(inicio, fim),
  )

  const somaPorChave = new Map<string, { nome: string; valor: number }>()
  for (const r of linhas) {
    const chave = r.cliente_id !== null ? `id:${r.cliente_id}` : `doc:${r.cliente_cpf_cnpj ?? r.cliente_nome ?? 'desconhecido'}`
    if (!somaPorChave.has(chave)) somaPorChave.set(chave, { nome: r.cliente_nome ?? '—', valor: 0 })
    somaPorChave.get(chave)!.valor += Number(r.valor_nf) || 0
  }
  return Array.from(somaPorChave.values())
}

// ============================================================
// agregarFornecedores() — dimensão Fornecedores, fonte `contas_a_pagar`
// + prazo médio de pagamento (só títulos status='pago' com data_baixa)
// ============================================================
async function agregarFornecedores(filtros: FiltroIntervaloDatas, client: SupabaseClient) {
  const linhas = await paginarConsulta<LinhaContaPagarAbc>((inicio, fim) =>
    client
      .from('contas_a_pagar')
      .select('valor, fornecedor_id, favorecido_nome, status, data_vencimento, data_baixa')
      .gte('data_vencimento', filtros.dataInicial)
      .lte('data_vencimento', filtros.dataFinal)
      .neq('status', 'cancelado')
      .range(inicio, fim),
  )

  const somaPorChave = new Map<string, { nome: string; valor: number; somaPrazos: number; qtdPrazos: number }>()
  for (const t of linhas) {
    const chave = t.fornecedor_id !== null ? `id:${t.fornecedor_id}` : `nome:${t.favorecido_nome}`
    if (!somaPorChave.has(chave)) somaPorChave.set(chave, { nome: t.favorecido_nome, valor: 0, somaPrazos: 0, qtdPrazos: 0 })
    const g = somaPorChave.get(chave)!
    g.valor += Number(t.valor) || 0

    if (t.status === 'pago' && t.data_baixa) {
      const dias = Math.round((Date.parse(t.data_baixa) - Date.parse(t.data_vencimento)) / 86_400_000)
      g.somaPrazos += dias
      g.qtdPrazos += 1
    }
  }

  return Array.from(somaPorChave.values()).map(g => ({
    nome: g.nome,
    valor: g.valor,
    prazoMedioPagamentoDias: g.qtdPrazos > 0 ? Math.round(g.somaPrazos / g.qtdPrazos) : undefined,
  }))
}

// ============================================================
// agregarProdutos() — dimensão Produtos, fonte `receitas_itens`
// (join com receitas pra filtrar por período)
// ============================================================
async function agregarProdutos(filtros: FiltroIntervaloDatas, client: SupabaseClient) {
  // Cast necessário: sem generic de Database no client (client é
  // untyped/generic — ver Handoff do Builder, Seção 5.3), o TS infere
  // o embedded resource `receitas!inner(...)` como ARRAY por padrão,
  // já que não há como o compilador saber a cardinalidade real da FK
  // sem o schema tipado. Em runtime é sempre 1 objeto — a FK
  // receitas_itens.receita_id -> receitas.id é N:1, nunca 1:N.
  const linhas = await paginarConsulta<LinhaReceitaItemAbc>((inicio, fim) =>
    client
      .from('receitas_itens')
      .select('valor_total, descricao, receitas!inner(data_emissao)')
      .gte('receitas.data_emissao', filtros.dataInicial)
      .lte('receitas.data_emissao', limiteSuperiorIntervalo(filtros.dataFinal))
      .range(inicio, fim) as unknown as PromiseLike<{ data: LinhaReceitaItemAbc[] | null; error: { message: string } | null }>,
  )

  const somaPorDescricao = new Map<string, number>()
  for (const item of linhas) {
    const nome = item.descricao ?? '—'
    somaPorDescricao.set(nome, (somaPorDescricao.get(nome) ?? 0) + (Number(item.valor_total) || 0))
  }
  return Array.from(somaPorDescricao.entries()).map(([nome, valor]) => ({ nome, valor }))
}

// ============================================================
// buscarDrillDownProduto()
// Evolução mensal (quantidade, valor) de um produto específico,
// dentro do MESMO intervalo já selecionado no filtro principal —
// não é um relatório separado (Seção 2.5)
// ============================================================
export async function buscarDrillDownProduto(
  nomeProduto: string,
  filtros: FiltroIntervaloDatas,
  client: SupabaseClient = supabase,
): Promise<DrillDownProdutoAbc> {
  // Mesmo motivo do cast em agregarProdutos() acima — embedded
  // resource inferido como array sem generic de Database, mas em
  // runtime é sempre 1 objeto (FK N:1)
  const linhas = await paginarConsulta<{ quantidade: number; valor_total: number; descricao: string | null; receitas: { data_emissao: string } }>(
    (inicio, fim) =>
      client
        .from('receitas_itens')
        .select('quantidade, valor_total, descricao, receitas!inner(data_emissao)')
        .eq('descricao', nomeProduto)
        .gte('receitas.data_emissao', filtros.dataInicial)
        .lte('receitas.data_emissao', limiteSuperiorIntervalo(filtros.dataFinal))
        .range(inicio, fim) as unknown as PromiseLike<{
          data: { quantidade: number; valor_total: number; descricao: string | null; receitas: { data_emissao: string } }[] | null
          error: { message: string } | null
        }>,
  )

  const porMes = new Map<string, { quantidade: number; valor: number }>()
  for (const item of linhas) {
    const mes = item.receitas.data_emissao.slice(0, 7)
    if (!porMes.has(mes)) porMes.set(mes, { quantidade: 0, valor: 0 })
    const g = porMes.get(mes)!
    g.quantidade += Number(item.quantidade) || 0
    g.valor += Number(item.valor_total) || 0
  }

  return {
    nomeProduto,
    evolucao: Array.from(porMes.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, g]) => ({ mes, quantidade: g.quantidade, valor: g.valor })),
  }
}
