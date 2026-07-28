// ============================================================
// pages/api/relatorios/fluxo-caixa.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Exportação PDF/Excel do relatório "Fluxo de caixa
//         realizado" (2.2) — mesmo padrão de pages/api/relatorios/
//         faturamento.ts
// Conecta com: lib/relatorios/fluxoCaixa.ts
// Referência: Especificacao_Modulo_Relatorios.md, Seção 2.2
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

import { gerarRelatorioFluxoCaixa } from '@/lib/relatorios/fluxoCaixa'
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

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
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

  if (!dataInicial || !dataFinal) return res.status(400).json({ erro: 'dataInicial e dataFinal são obrigatórios' })
  if (formato !== 'pdf' && formato !== 'xlsx') {
    return res.status(400).json({ erro: 'formato deve ser "pdf" ou "xlsx" — leitura de tela não passa por esta rota' })
  }

  try {
    const relatorio = await gerarRelatorioFluxoCaixa({ dataInicial, dataFinal }, supabaseAdmin)
    const periodoDescricao = formatarPeriodoDescricao(dataInicial, dataFinal)

    const linhasTabela = relatorio.lancamentos.map(l => ({
      data: formatarDataBR(l.data),
      descricao: l.descricao,
      entrada: l.entrada > 0 ? formatarMoeda(l.entrada) : '—',
      saida: l.saida > 0 ? formatarMoeda(l.saida) : '—',
    }))

    const cartoes: CartaoResumo[] = [
      { rotulo: 'Entradas', valor: formatarMoeda(relatorio.entradas) },
      { rotulo: 'Saídas', valor: formatarMoeda(relatorio.saidas) },
      { rotulo: 'Saldo do período', valor: formatarMoeda(relatorio.saldoPeriodo) },
    ]

    if (formato === 'pdf') {
      const doc = criarDocumentoRelatorio({ tituloRelatorio: 'Fluxo de caixa realizado', periodoDescricao })
      desenharCartoesResumo(doc, cartoes)
      doc.y = desenharGrafico(doc, relatorio.grafico, { x: 40, y: doc.y, largura: 515, altura: 200 })

      const colunas: ColunaTabela[] = [
        { chave: 'data', rotulo: 'Data', larguraProporcional: 1 },
        { chave: 'descricao', rotulo: 'Descrição', larguraProporcional: 2.4 },
        { chave: 'entrada', rotulo: 'Entrada', larguraProporcional: 1.1, alinhamento: 'right' },
        { chave: 'saida', rotulo: 'Saída', larguraProporcional: 1.1, alinhamento: 'right' },
      ]
      desenharTabela(doc, colunas, linhasTabela)
      finalizarComRodape(doc)

      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="fluxo_caixa_${dataInicial}_a_${dataFinal}.pdf"`)
      doc.pipe(res)
      doc.end()
      doc.on('error', (err: Error) => {
        console.error('[relatorios/fluxo-caixa][pdf] stream error:', err)
        if (!res.headersSent) res.status(500).json({ erro: 'Erro ao gerar PDF' })
      })
      return
    }

    const colunasExcel: ColunaExcel[] = [
      { chave: 'data', rotulo: 'Data', larguraCaracteres: 12 },
      { chave: 'descricao', rotulo: 'Descrição', larguraCaracteres: 34 },
      { chave: 'entrada', rotulo: 'Entrada', larguraCaracteres: 16 },
      { chave: 'saida', rotulo: 'Saída', larguraCaracteres: 16 },
    ]
    const buffer = gerarBufferExcel({
      nomeAba: 'Fluxo de Caixa',
      tituloRelatorio: 'Fluxo de caixa realizado',
      periodoDescricao,
      colunas: colunasExcel,
      linhas: linhasTabela,
    })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="fluxo_caixa_${dataInicial}_a_${dataFinal}.xlsx"`)
    return res.status(200).send(buffer)

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[relatorios/fluxo-caixa] handler error:', msg)
    if (!res.headersSent) res.status(500).json({ erro: msg })
  }
}
