// ============================================================
// lib/relatorios/totalizacaoDespesas.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Calcula o relatório "Totalização de Despesas" (2.9) —
//         relatório irmão do 2.8 (Totalização, Receitas), listagem
//         documento a documento de despesas lançadas no período,
//         com Tipo de Fornecedor, favorecido e valor. Também expõe
//         o dado do gráfico "Mês a mês" e do modo "Comparar
//         períodos", ambos com escopo de data INDEPENDENTE do
//         filtro da tabela (mesma decisão do 2.8).
// Conecta com: types/relatorios.ts (RelatorioTotalizacaoDespesas,
//              ItemTotalizacaoDespesas, ComparacaoPeriodosResultadoDespesas,
//              TipoFornecedorOuNaoClassificado — este último definido
//              pro relatório 2.6, reaproveitado aqui sem alteração),
//              pages/api/relatorios/totalizacao-despesas.ts,
//              lib/relatorios/paginacao.ts (paginarConsulta,
//              dividirEmLotes), lib/relatorios/formatadores.ts
//              (limiteSuperiorIntervalo, formatarMesBR)
// Referência: mockup aprovado por Maycon (Artifact publicado na
//             conversa) — sem documento formal de especificação
//             gerado, mesmo tratamento dado ao 2.8
//
// Decisões confirmadas por Maycon nesta sessão:
//   - Substitui CFOP (não existe em despesas) por Tipo de
//     Fornecedor — mesmo campo dinâmico do relatório 2.6
//     (fornecedores.tipo_fornecedor_id → fornecedor_categorias)
//   - Sem coluna/card Frete — não existe esse campo em despesas
//   - Sem coluna/card Desconto nem Juros/Multa — despesas tem os
//     dois campos (valor_desconto, valor_juros_multa), mas ficam
//     de fora desta versão por pedido explícito
// Decisões de engenharia herdadas do relatório 2.6 (já em produção,
// mesma tabela `despesas`), aplicadas aqui sem re-perguntar:
//   - origem_tipo ≠ 'pessoal_socio' — retirada pessoal de sócio já
//     tem relatório próprio (2.3), não deve se misturar aqui
//   - deleted_at IS NULL — despesas não tem um campo separado tipo
//     receitas.status_nf; "cancelado" em despesas JÁ É soft-delete,
//     então este filtro sozinho cobre o equivalente ao problema do
//     §4.2 que existiu em Receitas (Faturamento/Curva ABC)
//   - Filtro de data em 2 consultas complementares (documento_data_
//     emissao preenchida vs. NULL com fallback created_at) — evita
//     tanto filtrar em JS sobre a tabela inteira quanto excluir
//     silenciosamente linhas com data NULL
// Decisão de engenharia nova desta sessão:
//   - Ordenação: crescente por data de emissão, com número de
//     documento como critério de desempate (diferente do 2.8, que
//     ordena por número de NF-e primeiro — documento_numero de
//     despesa é TEXT livre, não sequencial como número de NF-e,
//     então data é o critério primário mais estável aqui)
//   - Vencimento: não existe em despesas, vive em despesas_parcelas
//     (1 despesa pode ter N parcelas). Segue a MESMA regra já em
//     produção em DespesasTabela.tsx: menor data_vencimento entre
//     as parcelas ATIVAS (deleted_at IS NULL) de cada despesa —
//     não inventei critério novo pra este relatório
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
import { limiteSuperiorIntervalo, formatarMesBR } from '@/lib/relatorios/formatadores'
import { paginarConsulta, dividirEmLotes } from '@/lib/relatorios/paginacao'

// Grupo virtual "Não classificado" — mesmo valor/mesma justificativa
// de tipagem do relatório 2.6 (ver gastosPorTipoFornecedor.ts):
// literal, não o tipo largo, pra permitir estreitar `tipo` pra
// `number` no branch de lookup de nome logo abaixo
const NAO_CLASSIFICADO = 'nao_classificado' as const
const ROTULO_NAO_CLASSIFICADO = 'Não classificado'

interface LinhaDespesaTotalizacao {
  id: string
  documento_numero: string | null
  documento_data_emissao: string | null
  created_at: string
  fornecedor_id: number
  favorecido_nome: string
  valor_original: number
}

// ============================================================
// buscarDespesasNoIntervalo() — as mesmas 2 consultas complementares
// do relatório 2.6 (documento_data_emissao preenchida vs. NULL com
// fallback created_at), reaproveitadas aqui porque a fonte
// (despesas) e os filtros de negócio (origem_tipo, deleted_at) são
// idênticos. Mantida como função própria pra não duplicar a lógica
// entre gerarRelatorioTotalizacaoDespesas() e
// gerarGraficoMesAMesTotalizacaoDespesas()/compararPeriodosTotalizacaoDespesas()
// ============================================================
async function buscarDespesasNoIntervalo(
  filtros: FiltroIntervaloDatas,
  client: SupabaseClient,
  selectColunas: string,
): Promise<LinhaDespesaTotalizacao[]> {
  const comDataEmissao = await paginarConsulta<LinhaDespesaTotalizacao>((inicio, fim) =>
    client
      .from('despesas')
      .select(selectColunas)
      .is('deleted_at', null)
      .neq('origem_tipo', 'pessoal_socio')
      .gte('documento_data_emissao', filtros.dataInicial)
      .lte('documento_data_emissao', filtros.dataFinal)
      .range(inicio, fim) as unknown as PromiseLike<{ data: LinhaDespesaTotalizacao[] | null; error: { message: string } | null }>,
  )

  const semDataEmissao = await paginarConsulta<LinhaDespesaTotalizacao>((inicio, fim) =>
    client
      .from('despesas')
      .select(selectColunas)
      .is('deleted_at', null)
      .neq('origem_tipo', 'pessoal_socio')
      .is('documento_data_emissao', null)
      .gte('created_at', filtros.dataInicial)
      .lte('created_at', limiteSuperiorIntervalo(filtros.dataFinal))
      .range(inicio, fim) as unknown as PromiseLike<{ data: LinhaDespesaTotalizacao[] | null; error: { message: string } | null }>,
  )

  // Mutuamente exclusivas por construção (uma exige a coluna
  // preenchida, a outra exige NULL) — concatenar não duplica linha
  return [...comDataEmissao, ...semDataEmissao]
}

// ============================================================
// gerarRelatorioTotalizacaoDespesas()
// ============================================================
export async function gerarRelatorioTotalizacaoDespesas(
  filtros: FiltrosTotalizacaoDespesas,
  client: SupabaseClient = supabase,
): Promise<RelatorioTotalizacaoDespesas> {
  // ── 1. Despesas no período, já filtradas no banco ───────────
  const linhas = await buscarDespesasNoIntervalo(
    filtros,
    client,
    'id, documento_numero, documento_data_emissao, created_at, fornecedor_id, favorecido_nome, valor_original',
  )

  const linhasFiltradasPorFornecedor = filtros.fornecedorId
    ? linhas.filter(l => l.fornecedor_id === filtros.fornecedorId)
    : linhas

  // ── 2. tipo_fornecedor_id de cada fornecedor que aparece no
  // conjunto — em lotes, mesmo padrão do relatório 2.6 ───────────
  const idsFornecedores = Array.from(new Set(linhasFiltradasPorFornecedor.map(l => l.fornecedor_id)))
  const mapaTipo = new Map<number, TipoFornecedorOuNaoClassificado>()

  for (const lote of dividirEmLotes(idsFornecedores)) {
    if (lote.length === 0) continue
    const fornecedoresDoLote = await paginarConsulta<{ id: number; tipo_fornecedor_id: number | null }>((inicio, fim) =>
      client
        .from('fornecedores')
        .select('id, tipo_fornecedor_id')
        .in('id', lote)
        .range(inicio, fim),
    )
    for (const f of fornecedoresDoLote) {
      mapaTipo.set(f.id, f.tipo_fornecedor_id ?? NAO_CLASSIFICADO)
    }
  }

  // ── 3. Filtro de Tipo de Fornecedor — só dá pra aplicar depois
  // do passo 2 (o tipo não existe na linha de despesas, só depois
  // do lookup em fornecedores) ────────────────────────────────────
  let idsFiltrados = linhasFiltradasPorFornecedor
  if (filtros.tipoFornecedorFiltro !== undefined) {
    idsFiltrados = linhasFiltradasPorFornecedor.filter(
      l => (mapaTipo.get(l.fornecedor_id) ?? NAO_CLASSIFICADO) === filtros.tipoFornecedorFiltro,
    )
  }

  // ── 3b. Lookup AO VIVO dos nomes das categorias — só as que de
  // fato aparecem no conjunto final, nunca a tabela inteira (mesma
  // exigência do 2.6: nome nunca armazenado nem cacheado) ─────────
  const idsCategoriasUsadas = Array.from(
    new Set(
      idsFiltrados
        .map(l => mapaTipo.get(l.fornecedor_id) ?? NAO_CLASSIFICADO)
        .filter((t): t is number => t !== NAO_CLASSIFICADO),
    ),
  )
  const mapaRotulo = new Map<number, string>()
  for (const lote of dividirEmLotes(idsCategoriasUsadas)) {
    if (lote.length === 0) continue
    const categoriasDoLote = await paginarConsulta<{ id: number; nome: string }>((inicio, fim) =>
      client
        .from('fornecedor_categorias')
        .select('id, nome')
        .in('id', lote)
        .range(inicio, fim),
    )
    for (const c of categoriasDoLote) mapaRotulo.set(c.id, c.nome)
  }

  function rotuloDoTipo(tipo: TipoFornecedorOuNaoClassificado): string {
    if (tipo === NAO_CLASSIFICADO) return ROTULO_NAO_CLASSIFICADO
    return mapaRotulo.get(tipo) ?? ROTULO_NAO_CLASSIFICADO // categoria excluída/renomeada entre o lançamento e a geração — cai em Não classificado em vez de quebrar
  }

  // ── 3c. Vencimento — não existe em despesas, vive em
  // despesas_parcelas (1 despesa pode ter N parcelas). Mesma regra
  // já em produção em DespesasTabela.tsx: menor data_vencimento
  // entre as parcelas ATIVAS (deleted_at IS NULL) de cada despesa.
  // Busca em lotes, só das despesas que sobraram após os filtros
  // acima (mesmo princípio de "nunca a tabela inteira" já aplicado
  // a fornecedores/categorias) ─────────────────────────────────────
  const idsDespesas = idsFiltrados.map(l => l.id)
  const mapaVencimento = new Map<string, string>()
  for (const lote of dividirEmLotes(idsDespesas)) {
    if (lote.length === 0) continue
    const parcelasDoLote = await paginarConsulta<{ despesa_id: string; data_vencimento: string; deleted_at: string | null }>((inicio, fim) =>
      client
        .from('despesas_parcelas')
        .select('despesa_id, data_vencimento, deleted_at')
        .in('despesa_id', lote)
        .is('deleted_at', null)
        .range(inicio, fim),
    )
    for (const p of parcelasDoLote) {
      const atual = mapaVencimento.get(p.despesa_id)
      if (!atual || p.data_vencimento < atual) mapaVencimento.set(p.despesa_id, p.data_vencimento)
    }
  }

  // ── 4. Monta os itens finais e ordena — crescente por Emissão,
  // Documento como desempate (Maycon: documento_numero é texto
  // livre, não sequencial como número de NF-e) ────────────────────
  const itens: ItemTotalizacaoDespesas[] = idsFiltrados.map(l => {
    const tipo = mapaTipo.get(l.fornecedor_id) ?? NAO_CLASSIFICADO
    return {
      documentoNumero: l.documento_numero,
      dataEmissao: (l.documento_data_emissao ?? l.created_at).slice(0, 10),
      vencimento: mapaVencimento.get(l.id)?.slice(0, 10) ?? null, // null quando a despesa não tem nenhuma parcela ativa
      tipoFornecedor: tipo,
      tipoFornecedorRotulo: rotuloDoTipo(tipo),
      fornecedorId: l.fornecedor_id,
      favorecidoNome: l.favorecido_nome,
      valor: Number(l.valor_original) || 0,
    }
  })

  itens.sort((a, b) => a.dataEmissao.localeCompare(b.dataEmissao) || (a.documentoNumero ?? '').localeCompare(b.documentoNumero ?? ''))

  return {
    filtros,
    itens,
    totalDespesas: itens.length,
    valorTotal: itens.reduce((s, i) => s + i.valor, 0),
  }
}

// ============================================================
// buscarFornecedoresParaFiltro()
// Popula o dropdown de fornecedor da tela (mesmo padrão do
// buscarClientesParaFiltro do 2.8: dropdown, não busca livre) —
// lista o cadastro inteiro, não só os que aparecem no período
// filtrado atual
// ============================================================
export async function buscarFornecedoresParaFiltro(client: SupabaseClient = supabase): Promise<FornecedorOpcaoFiltro[]> {
  const linhas = await paginarConsulta<{ id: number; razao: string }>((inicio, fim) =>
    client
      .from('fornecedores')
      .select('id, razao')
      .order('razao', { ascending: true })
      .range(inicio, fim),
  )
  return linhas.map(f => ({ id: f.id, nome: f.razao }))
}

// ============================================================
// gerarGraficoMesAMesTotalizacaoDespesas()
// Modo "Mês a mês" do gráfico — soma de valor_original por mês,
// escopo de um ANO INTEIRO, independente do filtro de período da
// tabela (mesma decisão explícita do 2.8)
// ============================================================
export async function gerarGraficoMesAMesTotalizacaoDespesas(
  ano: number,
  client: SupabaseClient = supabase,
): Promise<DadosGrafico> {
  const linhas = await buscarDespesasNoIntervalo(
    { dataInicial: `${ano}-01-01`, dataFinal: `${ano}-12-31` },
    client,
    'id, documento_numero, documento_data_emissao, created_at, fornecedor_id, favorecido_nome, valor_original',
  )

  const porMes = new Map<string, number>()
  for (let m = 1; m <= 12; m++) {
    porMes.set(`${ano}-${String(m).padStart(2, '0')}`, 0)
  }
  for (const l of linhas) {
    const mes = (l.documento_data_emissao ?? l.created_at).slice(0, 7)
    porMes.set(mes, (porMes.get(mes) ?? 0) + (Number(l.valor_original) || 0))
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
  async function totalDoPeriodo(periodo: FiltroIntervaloDatas) {
    const linhas = await buscarDespesasNoIntervalo(
      periodo,
      client,
      'id, documento_numero, documento_data_emissao, created_at, fornecedor_id, favorecido_nome, valor_original',
    )
    return {
      valorTotal: linhas.reduce((s, l) => s + (Number(l.valor_original) || 0), 0),
      despesas: linhas.length,
    }
  }

  const [resultadoA, resultadoB] = await Promise.all([totalDoPeriodo(periodoA), totalDoPeriodo(periodoB)])

  return {
    periodoA,
    periodoB,
    valorTotalA: resultadoA.valorTotal,
    valorTotalB: resultadoB.valorTotal,
    despesasA: resultadoA.despesas,
    despesasB: resultadoB.despesas,
  }
}
