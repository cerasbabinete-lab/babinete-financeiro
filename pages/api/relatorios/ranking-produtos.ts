// ============================================================
// pages/api/relatorios/ranking-produtos.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Exportação PDF/Excel do relatório "Ranking de Produtos"
//         (2.10). 1 rota só pras 2 seções — parâmetro `secao`
//         (ranking|drilldown) decide o que desenha, em vez de 2
//         arquivos de rota separados (decisão confirmada por
//         Maycon na sessão de brainstorm: menos arquivo pra manter,
//         mesmo raciocínio de reaproveitamento já usado no resto do
//         módulo). Cada seção exporta só ela mesma — nunca as duas
//         juntas no mesmo PDF/Excel.
// Conecta com: lib/relatorios/rankingProdutos.ts
// Referência: mockup aprovado por Maycon — ver cabeçalho de
//             lib/relatorios/rankingProdutos.ts
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

import {
  gerarRankingGeralProdutos,
  gerarDrillDownProdutoRanking,
  gerarGraficoMesAMesRankingGeral,
  gerarGraficoMesAMesProduto,
} from '@/lib/relatorios/rankingProdutos'
import {
  criarDocumentoRelatorio,
  desenharCartoesResumo,
  desenharTabela,
  finalizarComRodape,
  type ColunaTabela,
  type CartaoResumo,
} from '@/lib/relatorios/pdfBuilder'
import { desenharGrafico } from '@/lib/relatorios/pdfGrafico'
import { gerarBufferExcel, type ColunaExcel } from '@/lib/relatorios/excelBuilder'
import { formatarMoeda, formatarPeriodoDescricao } from '@/lib/relatorios/formatadores'

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ erro: 'Método não permitido' })

  const token = (req.headers.authorization ?? '').replace('Bearer ', '').trim() || null
  if (!token) return res.status(401).json({ erro: 'Não autorizado' })

  const supabaseAdmin = getSupabaseAdmin()
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ erro: 'Não autorizado' })

  const secao = String(req.query.secao ?? '')
  const dataInicial = String(req.query.dataInicial ?? '')
  const dataFinal = String(req.query.dataFinal ?? '')
  const formato = String(req.query.formato ?? '')
  const incluirGrafico = String(req.query.incluirGrafico ?? 'true') === 'true'
  const anoGrafico = Number(req.query.anoGrafico ?? new Date().getFullYear())
  const metricaGrafico = req.query.metricaGrafico === 'valor' ? 'valor' : 'quantidade'

  if (secao !== 'ranking' && secao !== 'drilldown') return res.status(400).json({ erro: 'secao deve ser "ranking" ou "drilldown"' })
  if (!dataInicial || !dataFinal) return res.status(400).json({ erro: 'dataInicial e dataFinal são obrigatórios' })
  if (formato !== 'pdf' && formato !== 'xlsx') {
    return res.status(400).json({ erro: 'formato deve ser "pdf" ou "xlsx" — leitura de tela não passa por esta rota' })
  }

  try {
    if (secao === 'ranking') {
      await exportarRanking(res, supabaseAdmin, { dataInicial, dataFinal, formato, incluirGrafico, anoGrafico, metricaGrafico })
    } else {
      const descricaoProduto = String(req.query.descricaoProduto ?? '')
      if (!descricaoProduto) return res.status(400).json({ erro: 'descricaoProduto é obrigatório pra secao=drilldown' })
      await exportarDrillDown(res, supabaseAdmin, { dataInicial, dataFinal, formato, incluirGrafico, anoGrafico, metricaGrafico, descricaoProduto })
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[relatorios/ranking-produtos] handler error:', msg)
    if (!res.headersSent) res.status(500).json({ erro: msg })
  }
}

// ============================================================
// exportarRanking() — Seção 1
// ============================================================
async function exportarRanking(
  res: NextApiResponse,
  client: ReturnType<typeof getSupabaseAdmin>,
  p: { dataInicial: string; dataFinal: string; formato: string; incluirGrafico: boolean; anoGrafico: number; metricaGrafico: 'quantidade' | 'valor' },
) {
  const relatorio = await gerarRankingGeralProdutos({ dataInicial: p.dataInicial, dataFinal: p.dataFinal }, client)
  const periodoDescricao = formatarPeriodoDescricao(p.dataInicial, p.dataFinal)

  const linhasTabela = relatorio.itens.map((item, i) => ({
    posicao: `${i + 1}º`,
    codigo: item.codigoProduto ?? '—',
    produto: item.descricao,
    quantidade: `${item.quantidade.toLocaleString('pt-BR')} un`,
    valor: formatarMoeda(item.valor),
  }))

  const cartoes: CartaoResumo[] = [
    { rotulo: 'Produtos distintos', valor: String(relatorio.itens.length) },
    { rotulo: 'Quantidade total', valor: `${relatorio.itens.reduce((s, i) => s + i.quantidade, 0).toLocaleString('pt-BR')} un` },
    { rotulo: 'Valor total', valor: formatarMoeda(relatorio.itens.reduce((s, i) => s + i.valor, 0)) },
  ]

  if (p.formato === 'pdf') {
    const doc = criarDocumentoRelatorio({ tituloRelatorio: 'Relatório Ranking de Produtos — Ranking geral', periodoDescricao })
    desenharCartoesResumo(doc, cartoes)

    if (p.incluirGrafico) {
      const grafico = await gerarGraficoMesAMesRankingGeral(p.anoGrafico, p.metricaGrafico, client)
      doc.y = desenharGrafico(doc, grafico, { x: 40, y: doc.y, largura: 515, altura: 200 })
    }

    const colunas: ColunaTabela[] = [
      { chave: 'posicao', rotulo: '#', larguraProporcional: 0.35 },
      { chave: 'codigo', rotulo: 'Código', larguraProporcional: 0.6 },
      { chave: 'produto', rotulo: 'Produto', larguraProporcional: 2 },
      { chave: 'quantidade', rotulo: 'Quantidade', larguraProporcional: 0.9, alinhamento: 'right' },
      { chave: 'valor', rotulo: 'Valor', larguraProporcional: 0.9, alinhamento: 'right' },
    ]
    desenharTabela(doc, colunas, linhasTabela)
    finalizarComRodape(doc)

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="ranking_produtos_geral_${p.dataInicial}_a_${p.dataFinal}.pdf"`)
    doc.pipe(res)
    doc.end()
    doc.on('error', (err: Error) => {
      console.error('[relatorios/ranking-produtos][pdf][ranking] stream error:', err)
      if (!res.headersSent) res.status(500).json({ erro: 'Erro ao gerar PDF' })
    })
    return
  }

  const colunasExcel: ColunaExcel[] = [
    { chave: 'posicao', rotulo: '#', larguraCaracteres: 6 },
    { chave: 'codigo', rotulo: 'Código', larguraCaracteres: 12 },
    { chave: 'produto', rotulo: 'Produto', larguraCaracteres: 40 },
    { chave: 'quantidade', rotulo: 'Quantidade', larguraCaracteres: 16 },
    { chave: 'valor', rotulo: 'Valor', larguraCaracteres: 16 },
  ]
  const buffer = gerarBufferExcel({ nomeAba: 'Ranking Geral', tituloRelatorio: 'Relatório Ranking de Produtos — Ranking geral', periodoDescricao, colunas: colunasExcel, linhas: linhasTabela })

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="ranking_produtos_geral_${p.dataInicial}_a_${p.dataFinal}.xlsx"`)
  res.status(200).send(buffer)
}

// ============================================================
// exportarDrillDown() — Seção 2
// ============================================================
async function exportarDrillDown(
  res: NextApiResponse,
  client: ReturnType<typeof getSupabaseAdmin>,
  p: { dataInicial: string; dataFinal: string; formato: string; incluirGrafico: boolean; anoGrafico: number; metricaGrafico: 'quantidade' | 'valor'; descricaoProduto: string },
) {
  const relatorio = await gerarDrillDownProdutoRanking({ dataInicial: p.dataInicial, dataFinal: p.dataFinal, descricaoProduto: p.descricaoProduto }, client)
  const periodoDescricao = formatarPeriodoDescricao(p.dataInicial, p.dataFinal)
  const tituloRelatorio = `Relatório Ranking de Produtos — ${relatorio.descricaoResolvida}`

  const linhasTabela = relatorio.itens.map(item => ({
    cliente: item.clienteNome,
    quantidade: `${item.quantidade.toLocaleString('pt-BR')} un`,
    valor: formatarMoeda(item.valor),
    notas: String(item.numeroNotas),
  }))

  const cartoes: CartaoResumo[] = [
    { rotulo: 'Código', valor: relatorio.codigoProduto ?? '—' },
    { rotulo: 'Quantidade total', valor: `${relatorio.quantidadeTotal.toLocaleString('pt-BR')} un` },
    { rotulo: 'Valor total', valor: formatarMoeda(relatorio.valorTotal) },
    { rotulo: 'Clientes distintos', valor: String(relatorio.clientesDistintos) },
  ]

  if (p.formato === 'pdf') {
    const doc = criarDocumentoRelatorio({ tituloRelatorio, periodoDescricao })
    desenharCartoesResumo(doc, cartoes)

    if (p.incluirGrafico) {
      // descricaoResolvida, não p.descricaoProduto — gerarGraficoMesAMesProduto
      // reaproveita buscarDrillDownProduto() do Curva ABC, que só casa
      // descricao exata (não código). Se p.descricaoProduto era um código
      // digitado, passar ele aqui faria o gráfico voltar vazio mesmo com
      // a tabela funcionando corretamente
      const grafico = await gerarGraficoMesAMesProduto(relatorio.descricaoResolvida, p.anoGrafico, p.metricaGrafico, client)
      doc.y = desenharGrafico(doc, grafico, { x: 40, y: doc.y, largura: 515, altura: 200 })
    }

    const colunas: ColunaTabela[] = [
      { chave: 'cliente', rotulo: 'Cliente', larguraProporcional: 2 },
      { chave: 'quantidade', rotulo: 'Quantidade', larguraProporcional: 0.9, alinhamento: 'right' },
      { chave: 'valor', rotulo: 'Valor total', larguraProporcional: 0.9, alinhamento: 'right' },
      { chave: 'notas', rotulo: 'Nº notas', larguraProporcional: 0.6, alinhamento: 'right' },
    ]
    desenharTabela(doc, colunas, linhasTabela)
    finalizarComRodape(doc)

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="ranking_produtos_drilldown_${p.dataInicial}_a_${p.dataFinal}.pdf"`)
    doc.pipe(res)
    doc.end()
    doc.on('error', (err: Error) => {
      console.error('[relatorios/ranking-produtos][pdf][drilldown] stream error:', err)
      if (!res.headersSent) res.status(500).json({ erro: 'Erro ao gerar PDF' })
    })
    return
  }

  const colunasExcel: ColunaExcel[] = [
    { chave: 'cliente', rotulo: 'Cliente', larguraCaracteres: 40 },
    { chave: 'quantidade', rotulo: 'Quantidade', larguraCaracteres: 16 },
    { chave: 'valor', rotulo: 'Valor total', larguraCaracteres: 16 },
    { chave: 'notas', rotulo: 'Nº notas', larguraCaracteres: 10 },
  ]
  const buffer = gerarBufferExcel({ nomeAba: 'Drill-down Produto', tituloRelatorio, periodoDescricao, colunas: colunasExcel, linhas: linhasTabela })

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="ranking_produtos_drilldown_${p.dataInicial}_a_${p.dataFinal}.xlsx"`)
  res.status(200).send(buffer)
}
