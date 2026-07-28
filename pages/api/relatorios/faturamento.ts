// ============================================================
// pages/api/relatorios/faturamento.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Exportação do relatório "Faturamento por período" (2.1)
//         em PDF ou Excel. NÃO atende leitura de tela — a página
//         (app/relatorios/faturamento/page.tsx) busca os dados
//         chamando gerarRelatorioFaturamento() direto com o client
//         do browser, mesma convenção usada em todos os outros
//         módulos do sistema (leitura simples não passa por rota
//         de API). Esta rota existe só porque PDF/Excel precisam
//         ser montados no servidor (mesmo motivo de pages/api/danfe.ts).
// Conecta com: lib/relatorios/faturamento.ts, lib/relatorios/
//              pdfBuilder.ts, lib/relatorios/pdfGrafico.ts,
//              lib/relatorios/excelBuilder.ts
// Referência: Especificacao_Modulo_Relatorios.md, Seção 1.2
//             (exportação PDF e Excel obrigatória)
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

import { gerarRelatorioFaturamento } from '@/lib/relatorios/faturamento'
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
import { formatarMoeda, formatarPeriodoDescricao, formatarMesBR } from '@/lib/relatorios/formatadores'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ erro: 'Método não permitido' })
  }

  const token = (req.headers.authorization ?? '').replace('Bearer ', '').trim() || null
  if (!token) return res.status(401).json({ erro: 'Não autorizado' })

  const supabaseAdmin = getSupabaseAdmin()
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ erro: 'Não autorizado' })

  const dataInicial = String(req.query.dataInicial ?? '')
  const dataFinal = String(req.query.dataFinal ?? '')
  const formato = String(req.query.formato ?? '')

  if (!dataInicial || !dataFinal) {
    return res.status(400).json({ erro: 'dataInicial e dataFinal são obrigatórios' })
  }
  if (formato !== 'pdf' && formato !== 'xlsx') {
    return res.status(400).json({ erro: 'formato deve ser "pdf" ou "xlsx" — leitura de tela não passa por esta rota' })
  }

  try {
    const relatorio = await gerarRelatorioFaturamento({ dataInicial, dataFinal }, supabaseAdmin)
    const periodoDescricao = formatarPeriodoDescricao(dataInicial, dataFinal)

    const linhasTabela = relatorio.meses.map(m => ({
      mes: formatarMesBR(m.mes),
      receitaBruta: formatarMoeda(m.receitaBruta),
      quantidadeNotas: String(m.quantidadeNotas),
      ticketMedio: formatarMoeda(m.ticketMedio),
      clientesNovos: String(m.clientesNovos),
      clientesRecorrentes: String(m.clientesRecorrentes),
    }))

    const cartoes: CartaoResumo[] = [
      { rotulo: 'Receita bruta', valor: formatarMoeda(relatorio.totalizador.receitaBruta) },
      { rotulo: 'Ticket médio', valor: formatarMoeda(relatorio.totalizador.ticketMedio) },
      { rotulo: 'Clientes novos', valor: String(relatorio.totalizador.clientesNovosTotal) },
      { rotulo: 'Clientes recorrentes', valor: String(relatorio.totalizador.clientesRecorrentesTotal) },
    ]

    if (formato === 'pdf') {
      const doc = criarDocumentoRelatorio({
        tituloRelatorio: 'Faturamento por período',
        periodoDescricao,
      })

      desenharCartoesResumo(doc, cartoes)

      doc.y = desenharGrafico(doc, relatorio.grafico, { x: 40, y: doc.y, largura: 515, altura: 200 })

      const colunas: ColunaTabela[] = [
        { chave: 'mes', rotulo: 'Mês', larguraProporcional: 1.4 },
        { chave: 'receitaBruta', rotulo: 'Receita bruta', larguraProporcional: 1.6, alinhamento: 'right' },
        { chave: 'quantidadeNotas', rotulo: 'Notas', larguraProporcional: 0.8, alinhamento: 'right' },
        { chave: 'ticketMedio', rotulo: 'Ticket médio', larguraProporcional: 1.4, alinhamento: 'right' },
        { chave: 'clientesNovos', rotulo: 'Novos', larguraProporcional: 0.9, alinhamento: 'right' },
        { chave: 'clientesRecorrentes', rotulo: 'Recorrentes', larguraProporcional: 1.1, alinhamento: 'right' },
      ]
      desenharTabela(doc, colunas, linhasTabela)

      finalizarComRodape(doc)

      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="faturamento_${dataInicial}_a_${dataFinal}.pdf"`)
      doc.pipe(res)
      doc.end()

      doc.on('error', (err: Error) => {
        console.error('[relatorios/faturamento][pdf] stream error:', err)
        if (!res.headersSent) res.status(500).json({ erro: 'Erro ao gerar PDF' })
      })
      return
    }

    // formato === 'xlsx'
    const colunasExcel: ColunaExcel[] = [
      { chave: 'mes', rotulo: 'Mês', larguraCaracteres: 12 },
      { chave: 'receitaBruta', rotulo: 'Receita bruta', larguraCaracteres: 18 },
      { chave: 'quantidadeNotas', rotulo: 'Notas', larguraCaracteres: 10 },
      { chave: 'ticketMedio', rotulo: 'Ticket médio', larguraCaracteres: 16 },
      { chave: 'clientesNovos', rotulo: 'Clientes novos', larguraCaracteres: 16 },
      { chave: 'clientesRecorrentes', rotulo: 'Clientes recorrentes', larguraCaracteres: 20 },
    ]
    const buffer = gerarBufferExcel({
      nomeAba: 'Faturamento',
      tituloRelatorio: 'Faturamento por período',
      periodoDescricao,
      colunas: colunasExcel,
      linhas: linhasTabela,
    })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="faturamento_${dataInicial}_a_${dataFinal}.xlsx"`)
    return res.status(200).send(buffer)

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[relatorios/faturamento] handler error:', msg)
    if (!res.headersSent) res.status(500).json({ erro: msg })
  }
}
