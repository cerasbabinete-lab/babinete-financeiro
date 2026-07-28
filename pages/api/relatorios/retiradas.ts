// ============================================================
// pages/api/relatorios/retiradas.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Exportação PDF/Excel do relatório "Retiradas e
//         benefícios por beneficiário" (2.3)
// Conecta com: lib/relatorios/retiradas.ts
// Referência: Especificacao_Modulo_Relatorios.md, Seção 2.3
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

import { gerarRelatorioRetiradas } from '@/lib/relatorios/retiradas'
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
import { SUBTIPO_RETIRADA_LABELS, type SubtipoRetirada } from '@/types/relatorios'

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
  const beneficiarioFiltro = req.query.beneficiarioFiltro ? String(req.query.beneficiarioFiltro) : undefined

  if (!dataInicial || !dataFinal) return res.status(400).json({ erro: 'dataInicial e dataFinal são obrigatórios' })
  if (formato !== 'pdf' && formato !== 'xlsx') {
    return res.status(400).json({ erro: 'formato deve ser "pdf" ou "xlsx" — leitura de tela não passa por esta rota' })
  }

  try {
    const relatorio = await gerarRelatorioRetiradas({ dataInicial, dataFinal, beneficiarioFiltro }, supabaseAdmin)
    const periodoDescricao = formatarPeriodoDescricao(dataInicial, dataFinal)

    // "Achata" os grupos em linhas de tabela — uma linha por
    // lançamento, com o nome do beneficiário repetido (mais simples
    // de ler num PDF/Excel do que sub-tabelas aninhadas por grupo)
    const linhasTabela = relatorio.grupos.flatMap(g =>
      g.lancamentos.map(l => ({
        beneficiario: g.beneficiarioNome,
        data: formatarDataBR(l.data),
        tipo: SUBTIPO_RETIRADA_LABELS[l.subtipo as SubtipoRetirada] ?? l.subtipo,
        valor: formatarMoeda(l.valor),
        status: l.statusPagamento,
      })),
    )

    const cartoes: CartaoResumo[] = [
      { rotulo: 'Total geral do período', valor: formatarMoeda(relatorio.totalGeral) },
      { rotulo: 'Beneficiários', valor: String(relatorio.grupos.length) },
    ]

    if (formato === 'pdf') {
      const doc = criarDocumentoRelatorio({ tituloRelatorio: 'Retiradas e benefícios por beneficiário', periodoDescricao })
      desenharCartoesResumo(doc, cartoes)
      doc.y = desenharGrafico(doc, relatorio.grafico, { x: 40, y: doc.y, largura: 515, altura: 200 })

      const colunas: ColunaTabela[] = [
        { chave: 'beneficiario', rotulo: 'Beneficiário', larguraProporcional: 1.6 },
        { chave: 'data', rotulo: 'Data', larguraProporcional: 0.9 },
        { chave: 'tipo', rotulo: 'Tipo', larguraProporcional: 1.2 },
        { chave: 'valor', rotulo: 'Valor', larguraProporcional: 1, alinhamento: 'right' },
        { chave: 'status', rotulo: 'Status', larguraProporcional: 0.9 },
      ]
      desenharTabela(doc, colunas, linhasTabela)
      finalizarComRodape(doc)

      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="retiradas_${dataInicial}_a_${dataFinal}.pdf"`)
      doc.pipe(res)
      doc.end()
      doc.on('error', (err: Error) => {
        console.error('[relatorios/retiradas][pdf] stream error:', err)
        if (!res.headersSent) res.status(500).json({ erro: 'Erro ao gerar PDF' })
      })
      return
    }

    const colunasExcel: ColunaExcel[] = [
      { chave: 'beneficiario', rotulo: 'Beneficiário', larguraCaracteres: 24 },
      { chave: 'data', rotulo: 'Data', larguraCaracteres: 12 },
      { chave: 'tipo', rotulo: 'Tipo', larguraCaracteres: 18 },
      { chave: 'valor', rotulo: 'Valor', larguraCaracteres: 16 },
      { chave: 'status', rotulo: 'Status', larguraCaracteres: 14 },
    ]
    const buffer = gerarBufferExcel({
      nomeAba: 'Retiradas',
      tituloRelatorio: 'Retiradas e benefícios por beneficiário',
      periodoDescricao,
      colunas: colunasExcel,
      linhas: linhasTabela,
    })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="retiradas_${dataInicial}_a_${dataFinal}.xlsx"`)
    return res.status(200).send(buffer)

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[relatorios/retiradas] handler error:', msg)
    if (!res.headersSent) res.status(500).json({ erro: msg })
  }
}
