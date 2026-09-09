// ============================================================
// lib/relatorios/rankingProdutos.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Lógica de dados do relatório "Ranking de Produtos"
//         (2.10) — 2 seções INDEPENDENTES (período/gráfico/export
//         próprios de cada uma, decisão explícita e repetida de
//         Maycon na sessão de brainstorm):
//           - Seção 1 (ranking geral): todos os produtos vendidos
//             no período, quantidade e valor, sem limite
//           - Seção 2 (drill-down): 1 produto buscado manualmente,
//             quebrado por cliente
// Conecta com: types/relatorios.ts (seção 2.10),
//              pages/api/relatorios/ranking-produtos.ts,
//              lib/relatorios/curvaAbc.ts (buscarDrillDownProduto,
//              REAPROVEITADA aqui pro gráfico Mês a mês da Seção 2
//              — mesmo cálculo de evolução mensal de 1 produto que
//              o Curva ABC já faz, só que agora também vira gráfico
//              e fica disponível fora do Curva ABC)
// Referência: mockup aprovado por Maycon (Artifact publicado na
//             conversa) — sem documento formal de especificação
//             gerado, mesmo tratamento dado ao 2.8/2.9
//
// Decisões confirmadas por Maycon nesta sessão de brainstorm:
//   - Ranking mostra Quantidade E Valor juntos (não uma dimensão
//     por vez) — reordenável por clique no cabeçalho, na tela
//   - Sem limite de linhas no ranking — lista completa, com rolagem
//   - Drill-down é por BUSCA manual, não por clique num produto do
//     ranking (as 2 seções não se comunicam)
//   - Drill-down: Cliente, Quantidade, Valor total, Nº de notas —
//     ordenado por Quantidade (fixo, sem reordenação)
//   - Infográfico (Mês a mês / Comparar períodos) nas DUAS seções,
//     mesmo módulo/padrão dos relatórios anteriores, escopo (Ano)
//     independente de cada seção
//   - Coluna Código nas 2 seções — como coluna no ranking, como
//     selo (não coluna repetida) no drill-down, decisão minha
//     registrada na conversa
//   - Exportação: 1 rota de API, 1 botão por seção, cada botão
//     exporta só a seção dele — nunca as duas juntas
// Decisões de engenharia herdadas do relatório 2.5 (Curva ABC, já
// em produção, mesma tabela `receitas_itens`), aplicadas aqui sem
// re-perguntar:
//   - Fonte: receitas_itens + receitas!inner(...) — NF-e emitida,
//     não contas_receber (mede "quanto foi vendido", não "quanto
//     foi recebido" — isso é Fluxo de Caixa)
//   - Filtro status_nf = 100 OU NULL (Correção Critical/Medium §2.2
//     e §4.2, já espalhada por todo o módulo) — aplicado em JS após
//     a consulta, nunca via .or() sobre coluna de embedded resource
//     (sintaxe não comprovada neste código, mesmo raciocínio do 2.5)
//   - Agrupamento por `descricao`, não `codigo_produto` — código não
//     é preenchido de forma consistente em toda NF-e
//   - Cast `as unknown as PromiseLike<...>` nas consultas com
//     embedded resource — sem generic de Database no client, TS
//     infere `receitas!inner(...)` como array por padrão; em
//     runtime é sempre 1 objeto (FK receitas_itens.receita_id ->
//     receitas.id é N:1)
// Decisão de engenharia nova desta sessão:
//   - Código "mais frequente": como um mesmo `descricao` pode ter
//     mais de um `codigo_produto` ao longo do tempo (inconsistência
//     de cadastro, mesmo motivo de não usar código como chave de
//     agrupamento), o código exibido é o de MAIOR contagem de
//     ocorrência dentro do conjunto agregado — não o primeiro
//     encontrado (arbitrário) nem uma lista de todos (poluição
//     visual). Empate: mantém o primeiro visto, ordem de chegada
//     da consulta — não há critério de desempate de negócio
//     definido, e forçar um seria inventar regra não pedida
//   - Lista de produtos pro autocomplete (buscarProdutosParaBusca):
//     varre TODAS as descrições distintas já vendidas, sem filtro
//     de período (mesmo raciocínio de buscarFornecedoresParaFiltro
//     do 2.9: dropdown/busca lista o cadastro/histórico inteiro,
//     não só o que aparece no período filtrado no momento). Se o
//     catálogo de produtos crescer MUITO ao longo dos anos, a
//     varredura completa de receitas_itens pra extrair descrições
//     distintas fica cara — registrado aqui como possível ponto de
//     revisão futura (ex: RPC de SELECT DISTINCT no Postgres), não
//     implementado agora por não haver sinal de que seja necessário
//
// CORREÇÃO pós-entrega (uso real, reportado por Maycon) — a busca da
// Seção 2 só casava contra `descricao`; buscar pelo código de barras
// (ex: "7898280390545", visível na tela de produção) não achava
// nada. Corrigido: buscarItensNoIntervalo() agora casa descricao OU
// codigo_produto (.or(), sobre colunas da própria receitas_itens —
// seguro, diferente da ressalva sobre status_nf que é coluna
// embutida). Reaproveita escaparParaFiltroOr() de
// lib/despesas/fornecedorAutoCreate.ts (exportada nesta sessão) em
// vez de duplicar a lógica de escape — necessária porque descrição
// real já vista em produção contém vírgula ("CAIXA SPRAY AMARELO
// 3,5MM 500G"), que quebraria a sintaxe do .or() sem escape.
// buscarProdutosParaBusca() e o resultado do drill-down também
// ganharam campo de código, pra tela poder oferecer os dois como
// opção de busca e nunca exibir um código bruto como nome de produto
// (ver descricaoResolvida em RelatorioDrillDownProdutoRanking)
// ============================================================

import { supabase } from '@/lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  RelatorioRankingGeralProdutos,
  ItemRankingProduto,
  ProdutoOpcaoFiltro,
  FiltrosDrillDownProdutoRanking,
  RelatorioDrillDownProdutoRanking,
  ItemClienteProduto,
  ComparacaoPeriodosResultadoProdutos,
  DadosGrafico,
  FiltroIntervaloDatas,
} from '@/types/relatorios'
import { limiteSuperiorIntervalo, formatarMesBR } from '@/lib/relatorios/formatadores'
import { paginarConsulta } from '@/lib/relatorios/paginacao'
import { buscarDrillDownProduto } from '@/lib/relatorios/curvaAbc'
import { escaparParaFiltroOr } from '@/lib/despesas/fornecedorAutoCreate'

// ============================================================
// codigoMaisFrequente() — mesmo critério usado nas 2 seções (ver
// decisão de engenharia no cabeçalho acima)
// ============================================================
function codigoMaisFrequente(codigos: (string | null)[]): string | null {
  const contagem = new Map<string, number>()
  for (const c of codigos) {
    if (!c) continue
    contagem.set(c, (contagem.get(c) ?? 0) + 1)
  }
  let melhor: string | null = null
  let melhorContagem = 0
  for (const [codigo, n] of contagem) {
    if (n > melhorContagem) { melhor = codigo; melhorContagem = n }
  }
  return melhor
}

interface LinhaItemComReceita {
  quantidade: number
  valor_total: number
  descricao: string | null
  codigo_produto: string | null
  receita_id: string
  receitas: { data_emissao: string; status_nf: number | null; cliente_id: number | null; cliente_nome: string | null }
}

// ============================================================
// buscarItensNoIntervalo() — consulta compartilhada pelas 2 seções
// e pelas 2 variantes de gráfico (ranking geral e produto
// específico). `filtroDescricao` opcional restringe a 1 produto
// (Seção 2) — undefined busca todos (Seção 1)
// ============================================================
async function buscarItensNoIntervalo(
  filtros: FiltroIntervaloDatas,
  client: SupabaseClient,
  filtroProduto?: string,
): Promise<LinhaItemComReceita[]> {
  const linhas = await paginarConsulta<LinhaItemComReceita>((inicio, fim) => {
    let query = client
      .from('receitas_itens')
      .select('quantidade, valor_total, descricao, codigo_produto, receita_id, receitas!inner(data_emissao, status_nf, cliente_id, cliente_nome)')
      .gte('receitas.data_emissao', filtros.dataInicial)
      .lte('receitas.data_emissao', limiteSuperiorIntervalo(filtros.dataFinal))
    if (filtroProduto) {
      // Casa descrição OU código de barras — corrige bug reportado
      // por Maycon: buscar por código (ex: "7898280390545") não
      // achava nada, porque só filtrava por descricao. .or() é
      // sobre colunas da PRÓPRIA receitas_itens (não embedded
      // resource), então é seguro aqui — diferente da ressalva sobre
      // status_nf (esse sim é coluna de receitas!inner embutido).
      // Escapa vírgula/parênteses — descrição real já vista em
      // produção contém vírgula (ex: "CAIXA SPRAY AMARELO 3,5MM
      // 500G"), quebraria a sintaxe do .or() sem isso
      const termoEscapado = escaparParaFiltroOr(filtroProduto)
      query = query.or(`descricao.eq.${termoEscapado},codigo_produto.eq.${termoEscapado}`)
    }
    return query.range(inicio, fim) as unknown as PromiseLike<{ data: LinhaItemComReceita[] | null; error: { message: string } | null }>
  })

  // Correção §2.2/§4.2 — status_nf filtrado em JS, mesmo raciocínio
  // do Curva ABC (não depender de .or() não comprovado sobre coluna
  // de embedded resource)
  return linhas.filter(l => l.receitas.status_nf === 100 || l.receitas.status_nf === null)
}

// ============================================================
// gerarRankingGeralProdutos() — Seção 1
// ============================================================
export async function gerarRankingGeralProdutos(
  filtros: FiltroIntervaloDatas,
  client: SupabaseClient = supabase,
): Promise<RelatorioRankingGeralProdutos> {
  const linhas = await buscarItensNoIntervalo(filtros, client)

  const porDescricao = new Map<string, { quantidade: number; valor: number; codigos: (string | null)[] }>()
  for (const l of linhas) {
    const nome = l.descricao ?? '—' // defensivo — coluna é NOT NULL no schema, mas select() aqui não é tipado
    if (!porDescricao.has(nome)) porDescricao.set(nome, { quantidade: 0, valor: 0, codigos: [] })
    const g = porDescricao.get(nome)!
    g.quantidade += Number(l.quantidade) || 0
    g.valor += Number(l.valor_total) || 0
    g.codigos.push(l.codigo_produto)
  }

  const itens: ItemRankingProduto[] = Array.from(porDescricao.entries()).map(([descricao, g]) => ({
    codigoProduto: codigoMaisFrequente(g.codigos),
    descricao,
    quantidade: g.quantidade,
    valor: g.valor,
  }))

  itens.sort((a, b) => b.quantidade - a.quantidade) // padrão inicial — reordenação por Valor é local, na tela

  return { filtros, itens }
}

// ============================================================
// buscarProdutosParaBusca() — autocomplete da Seção 2 (ver nota de
// escala no cabeçalho do arquivo)
// ============================================================
export async function buscarProdutosParaBusca(client: SupabaseClient = supabase): Promise<ProdutoOpcaoFiltro[]> {
  const linhas = await paginarConsulta<{ descricao: string | null; codigo_produto: string | null }>((inicio, fim) =>
    client.from('receitas_itens').select('descricao, codigo_produto').range(inicio, fim),
  )
  const porDescricao = new Map<string, (string | null)[]>()
  for (const l of linhas) {
    if (!l.descricao) continue
    if (!porDescricao.has(l.descricao)) porDescricao.set(l.descricao, [])
    porDescricao.get(l.descricao)!.push(l.codigo_produto)
  }
  return Array.from(porDescricao.entries())
    .map(([descricao, codigos]) => ({ descricao, codigoProduto: codigoMaisFrequente(codigos) }))
    .sort((a, b) => a.descricao.localeCompare(b.descricao))
}

// ============================================================
// gerarDrillDownProdutoRanking() — Seção 2
// ============================================================
export async function gerarDrillDownProdutoRanking(
  filtros: FiltrosDrillDownProdutoRanking,
  client: SupabaseClient = supabase,
): Promise<RelatorioDrillDownProdutoRanking> {
  const linhas = await buscarItensNoIntervalo(filtros, client, filtros.descricaoProduto)

  const porCliente = new Map<string, { clienteId: number | null; clienteNome: string; quantidade: number; valor: number; notas: Set<string> }>()
  const codigos: (string | null)[] = []
  const descricoesEncontradas: string[] = []

  for (const l of linhas) {
    codigos.push(l.codigo_produto)
    descricoesEncontradas.push(l.descricao ?? '—')
    const nome = l.receitas.cliente_nome ?? 'Consumidor não identificado'
    // Chave de agrupamento: cliente_id quando existe (identidade
    // canônica); cai pro nome só quando cliente_id é NULL (venda
    // avulsa) — 2 clientes cadastrados nunca colidem por homônimo
    // porque sempre têm cliente_id preenchido e distinto
    const chave = l.receitas.cliente_id !== null ? `id:${l.receitas.cliente_id}` : `nome:${nome}`
    if (!porCliente.has(chave)) porCliente.set(chave, { clienteId: l.receitas.cliente_id, clienteNome: nome, quantidade: 0, valor: 0, notas: new Set() })
    const g = porCliente.get(chave)!
    g.quantidade += Number(l.quantidade) || 0
    g.valor += Number(l.valor_total) || 0
    g.notas.add(l.receita_id)
  }

  const itens: ItemClienteProduto[] = Array.from(porCliente.values())
    .map(g => ({ clienteId: g.clienteId, clienteNome: g.clienteNome, quantidade: g.quantidade, valor: g.valor, numeroNotas: g.notas.size }))
    .sort((a, b) => b.quantidade - a.quantidade)

  return {
    filtros,
    // A busca aceita descrição OU código — se Maycon digitou o
    // código, filtros.descricaoProduto é o código, não um nome
    // legível. descricaoResolvida mostra o nome de fato (mais
    // frequente entre as linhas encontradas) pra tela nunca exibir
    // um código de barras como se fosse nome de produto
    descricaoResolvida: codigoMaisFrequente(descricoesEncontradas) ?? filtros.descricaoProduto,
    codigoProduto: codigoMaisFrequente(codigos),
    itens,
    quantidadeTotal: itens.reduce((s, i) => s + i.quantidade, 0),
    valorTotal: itens.reduce((s, i) => s + i.valor, 0),
    clientesDistintos: itens.length,
  }
}

// ============================================================
// Gráficos "Mês a mês" — DadosGrafico tipo 'barras', 12 meses
// sempre preenchidos (mesmo com 0), toggle Quantidade/Valor
// decidido no CHAMADOR (cada seção pede a métrica que está com o
// botão ativo no momento — sem refazer a consulta pra trocar)
// ============================================================
function pontosDoAno(ano: number, valores: Map<string, number>): DadosGrafico {
  const pontos = []
  for (let m = 1; m <= 12; m++) {
    const mes = `${ano}-${String(m).padStart(2, '0')}`
    pontos.push({ rotulo: formatarMesBR(mes), valor: valores.get(mes) ?? 0 })
  }
  return { tipo: 'barras', pontos }
}

export async function gerarGraficoMesAMesRankingGeral(
  ano: number,
  metrica: 'quantidade' | 'valor',
  client: SupabaseClient = supabase,
): Promise<DadosGrafico> {
  const linhas = await buscarItensNoIntervalo({ dataInicial: `${ano}-01-01`, dataFinal: `${ano}-12-31` }, client)
  const porMes = new Map<string, number>()
  for (const l of linhas) {
    const mes = l.receitas.data_emissao.slice(0, 7)
    const v = metrica === 'quantidade' ? Number(l.quantidade) || 0 : Number(l.valor_total) || 0
    porMes.set(mes, (porMes.get(mes) ?? 0) + v)
  }
  return pontosDoAno(ano, porMes)
}

// Reaproveita buscarDrillDownProduto() do Curva ABC (2.5) — MESMO
// cálculo de evolução mensal de 1 produto, só convertido pro
// formato DadosGrafico em vez do formato de tabela do drill-down
// do Curva ABC. Não duplica a consulta nem o filtro de status_nf
export async function gerarGraficoMesAMesProduto(
  descricaoProduto: string,
  ano: number,
  metrica: 'quantidade' | 'valor',
  client: SupabaseClient = supabase,
): Promise<DadosGrafico> {
  const resultado = await buscarDrillDownProduto(descricaoProduto, { dataInicial: `${ano}-01-01`, dataFinal: `${ano}-12-31` }, client)
  const porMes = new Map<string, number>()
  for (const ponto of resultado.evolucao) {
    porMes.set(ponto.mes, metrica === 'quantidade' ? ponto.quantidade : ponto.valor)
  }
  return pontosDoAno(ano, porMes)
}

// ============================================================
// Comparação entre 2 períodos — 100% manual, sem sugestão
// automática de Período B (mesma decisão já aplicada em todo o
// módulo desde o 2.8)
// ============================================================
export async function compararPeriodosRankingGeral(
  periodoA: FiltroIntervaloDatas,
  periodoB: FiltroIntervaloDatas,
  client: SupabaseClient = supabase,
): Promise<ComparacaoPeriodosResultadoProdutos> {
  async function totais(periodo: FiltroIntervaloDatas) {
    const linhas = await buscarItensNoIntervalo(periodo, client)
    return {
      quantidade: linhas.reduce((s, l) => s + (Number(l.quantidade) || 0), 0),
      valor: linhas.reduce((s, l) => s + (Number(l.valor_total) || 0), 0),
    }
  }
  const [a, b] = await Promise.all([totais(periodoA), totais(periodoB)])
  return { periodoA, periodoB, quantidadeA: a.quantidade, quantidadeB: b.quantidade, valorTotalA: a.valor, valorTotalB: b.valor }
}

export async function compararPeriodosProduto(
  descricaoProduto: string,
  periodoA: FiltroIntervaloDatas,
  periodoB: FiltroIntervaloDatas,
  client: SupabaseClient = supabase,
): Promise<ComparacaoPeriodosResultadoProdutos> {
  async function totais(periodo: FiltroIntervaloDatas) {
    const linhas = await buscarItensNoIntervalo(periodo, client, descricaoProduto)
    return {
      quantidade: linhas.reduce((s, l) => s + (Number(l.quantidade) || 0), 0),
      valor: linhas.reduce((s, l) => s + (Number(l.valor_total) || 0), 0),
    }
  }
  const [a, b] = await Promise.all([totais(periodoA), totais(periodoB)])
  return { periodoA, periodoB, quantidadeA: a.quantidade, quantidadeB: b.quantidade, valorTotalA: a.valor, valorTotalB: b.valor }
}
