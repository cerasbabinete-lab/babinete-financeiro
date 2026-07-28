// ============================================================
// pages/api/relatorios/extrato-consolidado.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Exportação PDF/Excel do relatório "Extrato consolidado" (2.4)
// Conecta com: lib/relatorios/extratoConsolidado.ts
// Referência: Especificacao_Modulo_Relatorios.md, Seção 2.4
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

import { gerarRelatorioExtratoConsolidado } from '@/lib/relatorios/extratoConsolidado'
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
import { FAIXA_AGING_LABELS, type LadoExtrato, type StatusFiltroExtrato, type NivelDetalheExtrato, type FaixaAging } from '@/types/relatorios'

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
  const lado = String(req.query.lado ?? 'ambos') as LadoExtrato | 'ambos'
  const status = String(req.query.status ?? 'tudo') as StatusFiltroExtrato
  const nivelDetalhe = String(req.query.nivelDetalhe ?? 'detalhado') as NivelDetalheExtrato

  if (!dataInicial || !dataFinal) return res.status(400).json({ erro: 'dataInicial e dataFinal são obrigatórios' })
  if (formato !== 'pdf' && formato !== 'xlsx') {
    return res.status(400).json({ erro: 'formato deve ser "pdf" ou "xlsx" — leitura de tela não passa por esta rota' })
  }

  try {
    const relatorio = await gerarRelatorioExtratoConsolidado({ dataInicial, dataFinal, lado, status, nivelDetalhe }, supabaseAdmin)
    const periodoDescricao = formatarPeriodoDescricao(dataInicial, dataFinal)

    const linhasTabela = (relatorio.itens ?? []).map(i => ({
      dataVencimento: formatarDataBR(i.dataVencimento),
      favorecidoOuCliente: i.favorecidoOuCliente,
      lado: i.lado === 'a_pagar' ? 'A pagar' : 'A receber',
      valor: formatarMoeda(i.valor),
      faixa: i.faixa ? FAIXA_AGING_LABELS[i.faixa] : '—',
      status: i.status,
    }))

    const cartoes: CartaoResumo[] = relatorio.totaisPorFaixa.map(f => ({
      rotulo: FAIXA_AGING_LABELS[f.faixa as FaixaAging],
      valor: formatarMoeda(f.total),
    }))

    if (formato === 'pdf') {
      const doc = criarDocumentoRelatorio({ tituloRelatorio: 'Extrato consolidado', periodoDescricao })
      if (cartoes.length > 0) desenharCartoesResumo(doc, cartoes)
      doc.y = desenharGrafico(doc, relatorio.grafico, { x: 40, y: doc.y, largura: 515, altura: 200 })

      if (relatorio.itens) {
        const colunas: ColunaTabela[] = [
          { chave: 'dataVencimento', rotulo: 'Vencimento', larguraProporcional: 1 },
          { chave: 'favorecidoOuCliente', rotulo: 'Favorecido/Cliente', larguraProporcional: 2 },
          { chave: 'lado', rotulo: 'Lado', larguraProporcional: 0.9 },
          { chave: 'valor', rotulo: 'Valor', larguraProporcional: 1, alinhamento: 'right' },
          { chave: 'faixa', rotulo: 'Faixa', larguraProporcional: 0.9 },
          { chave: 'status', rotulo: 'Status', larguraProporcional: 0.9 },
        ]
        desenharTabela(doc, colunas, linhasTabela)
      }
      finalizarComRodape(doc)

      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="extrato_consolidado_${dataInicial}_a_${dataFinal}.pdf"`)
      doc.pipe(res)
      doc.end()
      doc.on('error', (err: Error) => {
        console.error('[relatorios/extrato-consolidado][pdf] stream error:', err)
        if (!res.headersSent) res.status(500).json({ erro: 'Erro ao gerar PDF' })
      })
      return
    }

    const colunasExcel: ColunaExcel[] = [
      { chave: 'dataVencimento', rotulo: 'Vencimento', larguraCaracteres: 14 },
      { chave: 'favorecidoOuCliente', rotulo: 'Favorecido/Cliente', larguraCaracteres: 28 },
      { chave: 'lado', rotulo: 'Lado', larguraCaracteres: 12 },
      { chave: 'valor', rotulo: 'Valor', larguraCaracteres: 16 },
      { chave: 'faixa', rotulo: 'Faixa', larguraCaracteres: 14 },
      { chave: 'status', rotulo: 'Status', larguraCaracteres: 14 },
    ]
    const buffer = gerarBufferExcel({
      nomeAba: 'Extrato Consolidado',
      tituloRelatorio: 'Extrato consolidado',
      periodoDescricao,
      colunas: colunasExcel,
      linhas: linhasTabela,
    })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="extrato_consolidado_${dataInicial}_a_${dataFinal}.xlsx"`)
    return res.status(200).send(buffer)

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[relatorios/extrato-consolidado] handler error:', msg)
    if (!res.headersSent) res.status(500).json({ erro: msg })
  }
}
