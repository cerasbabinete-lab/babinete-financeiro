// ============================================================
// pages/api/relatorios/totalizacao.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Exportação PDF/Excel do relatório "Totalização" (2.8).
// Conecta com: lib/relatorios/totalizacao.ts
// Referência: decisões registradas em chat — ver cabeçalho de
//             lib/relatorios/totalizacao.ts
//
// O PDF/Excel leva só o gráfico "Mês a mês" (DadosGrafico tipo
// 'barras' padrão) quando incluirGrafico=true — o modo "Comparar
// períodos" é só de tela, não tem representação em
// desenharGrafico()/gerarBufferExcel() (ver nota em
// types/relatorios.ts, ComparacaoPeriodosResultado, sobre por que
// esse modo não é um DadosGrafico padrão).
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

import { gerarRelatorioTotalizacao, gerarGraficoMesAMesTotalizacao } from '@/lib/relatorios/totalizacao'
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
import { formatarMoeda, formatarPeriodoDescricao, formatarDataBR } from '@/lib/relatorios/formatadores'
import type { CfopFiltroTotalizacao } from '@/types/relatorios'

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

  const dataInicial = String(req.query.dataInicial ?? '')
  const dataFinal = String(req.query.dataFinal ?? '')
  const formato = String(req.query.formato ?? '')
  const incluirGrafico = String(req.query.incluirGrafico ?? 'true') === 'true'
  const anoGrafico = Number(req.query.anoGrafico ?? new Date().getFullYear())
  const incluirFreteNoValor = String(req.query.incluirFreteNoValor ?? 'false') === 'true'
  const cfopFiltro = (req.query.cfopFiltro ? String(req.query.cfopFiltro) : undefined) as CfopFiltroTotalizacao | undefined
  const clienteId = req.query.clienteId ? Number(req.query.clienteId) : undefined

  if (!dataInicial || !dataFinal) return res.status(400).json({ erro: 'dataInicial e dataFinal são obrigatórios' })
  if (formato !== 'pdf' && formato !== 'xlsx') {
    return res.status(400).json({ erro: 'formato deve ser "pdf" ou "xlsx" — leitura de tela não passa por esta rota' })
  }

  try {
    const relatorio = await gerarRelatorioTotalizacao({ dataInicial, dataFinal, cfopFiltro, clienteId, incluirFreteNoValor }, supabaseAdmin)
    const periodoDescricao = formatarPeriodoDescricao(dataInicial, dataFinal)

    const linhasTabela = relatorio.itens.map(item => ({
      nota: String(item.numeroNf),
      emissao: formatarDataBR(item.dataEmissao),
      cfop: item.cfop ?? '—',
      codigo: item.clienteId !== null ? String(item.clienteId) : '—',
      razao: item.clienteNome,
      valor: formatarMoeda(item.valor),
      desconto: formatarMoeda(item.desconto),
      frete: formatarMoeda(item.frete),
      valorLiquido: formatarMoeda(item.valorLiquido),
    }))

    const cartoes: CartaoResumo[] = [
      { rotulo: 'Total de notas', valor: String(relatorio.totalNotas) },
      { rotulo: 'Valor total', valor: formatarMoeda(relatorio.valorTotal) },
      { rotulo: 'Desconto total', valor: formatarMoeda(relatorio.descontoTotal) },
      { rotulo: 'Frete total', valor: formatarMoeda(relatorio.freteTotal) },
      { rotulo: 'Valor líquido', valor: formatarMoeda(relatorio.valorLiquido) },
    ]

    if (formato === 'pdf') {
      const doc = criarDocumentoRelatorio({ tituloRelatorio: 'Relatório Totalização', periodoDescricao })
      desenharCartoesResumo(doc, cartoes)

      if (incluirGrafico) {
        const grafico = await gerarGraficoMesAMesTotalizacao(anoGrafico, supabaseAdmin)
        doc.y = desenharGrafico(doc, grafico, { x: 40, y: doc.y, largura: 515, altura: 200 })
      }

      const colunas: ColunaTabela[] = [
        { chave: 'nota', rotulo: 'Nota', larguraProporcional: 0.55 },
        { chave: 'emissao', rotulo: 'Emissão', larguraProporcional: 0.75 },
        { chave: 'cfop', rotulo: 'Cfop', larguraProporcional: 0.55 },
        { chave: 'codigo', rotulo: 'Cód.', larguraProporcional: 0.55 },
        { chave: 'razao', rotulo: 'Razão Social', larguraProporcional: 2.1 },
        { chave: 'valor', rotulo: 'Valor', larguraProporcional: 0.85, alinhamento: 'right' },
        { chave: 'desconto', rotulo: 'Desconto', larguraProporcional: 0.85, alinhamento: 'right' },
        { chave: 'frete', rotulo: 'Frete', larguraProporcional: 0.75, alinhamento: 'right' },
        { chave: 'valorLiquido', rotulo: 'Valor Líquido', larguraProporcional: 0.95, alinhamento: 'right' },
      ]
      desenharTabela(doc, colunas, linhasTabela)
      finalizarComRodape(doc)

      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="totalizacao_${dataInicial}_a_${dataFinal}.pdf"`)
      doc.pipe(res)
      doc.end()
      doc.on('error', (err: Error) => {
        console.error('[relatorios/totalizacao][pdf] stream error:', err)
        if (!res.headersSent) res.status(500).json({ erro: 'Erro ao gerar PDF' })
      })
      return
    }

    const colunasExcel: ColunaExcel[] = [
      { chave: 'nota', rotulo: 'Nota', larguraCaracteres: 10 },
      { chave: 'emissao', rotulo: 'Emissão', larguraCaracteres: 12 },
      { chave: 'cfop', rotulo: 'Cfop', larguraCaracteres: 10 },
      { chave: 'codigo', rotulo: 'Cód.', larguraCaracteres: 10 },
      { chave: 'razao', rotulo: 'Razão Social', larguraCaracteres: 45 },
      { chave: 'valor', rotulo: 'Valor', larguraCaracteres: 16 },
      { chave: 'desconto', rotulo: 'Desconto', larguraCaracteres: 16 },
      { chave: 'frete', rotulo: 'Frete', larguraCaracteres: 16 },
      { chave: 'valorLiquido', rotulo: 'Valor Líquido', larguraCaracteres: 16 },
    ]
    const buffer = gerarBufferExcel({
      nomeAba: 'Totalização',
      tituloRelatorio: 'Relatório Totalização',
      periodoDescricao,
      colunas: colunasExcel,
      linhas: linhasTabela,
    })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="totalizacao_${dataInicial}_a_${dataFinal}.xlsx"`)
    return res.status(200).send(buffer)

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[relatorios/totalizacao] handler error:', msg)
    if (!res.headersSent) res.status(500).json({ erro: msg })
  }
}
