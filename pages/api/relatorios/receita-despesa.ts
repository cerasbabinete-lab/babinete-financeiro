// ============================================================
// pages/api/relatorios/receita-despesa.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Exportação PDF/Excel do relatório "Receita x Despesa
//         (Bruta e Líquida) por período" (2.7)
// Conecta com: lib/relatorios/receitaDespesa.ts
// Referência: Especificacao_Modulo_Relatorios.md, Seção 2.7
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

import { gerarRelatorioReceitaDespesa } from '@/lib/relatorios/receitaDespesa'
import {
  criarDocumentoRelatorio,
  desenharCartoesResumo,
  desenharAvisoDestacado,
  desenharTabela,
  finalizarComRodape,
  type ColunaTabela,
  type CartaoResumo,
} from '@/lib/relatorios/pdfBuilder'
import { desenharGrafico } from '@/lib/relatorios/pdfGrafico'
import { gerarBufferExcel, type ColunaExcel } from '@/lib/relatorios/excelBuilder'
import { formatarMoeda, formatarPeriodoDescricao, formatarMesBR } from '@/lib/relatorios/formatadores'
import { AVISO_RECEITA_DESPESA } from '@/types/relatorios'

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

  if (!dataInicial || !dataFinal) return res.status(400).json({ erro: 'dataInicial e dataFinal são obrigatórios' })
  if (formato !== 'pdf' && formato !== 'xlsx') {
    return res.status(400).json({ erro: 'formato deve ser "pdf" ou "xlsx" — leitura de tela não passa por esta rota' })
  }

  try {
    const relatorio = await gerarRelatorioReceitaDespesa({ dataInicial, dataFinal }, supabaseAdmin)
    const periodoDescricao = formatarPeriodoDescricao(dataInicial, dataFinal)

    // Tabela: uma linha por mês, todas as 6 colunas de valor —
    // visão mensal completa (o totalizador do intervalo fica nos
    // cartões de resumo, mesmo padrão dos demais relatórios)
    const linhasTabela = relatorio.meses.map(m => ({
      mes: formatarMesBR(m.mes),
      receitaBruta: formatarMoeda(m.receitaBruta),
      receitaLiquida: formatarMoeda(m.receitaLiquida),
      despesaBruta: formatarMoeda(m.despesaBruta),
      despesaLiquida: formatarMoeda(m.despesaLiquida),
      resultadoBruto: formatarMoeda(m.resultadoBruto),
      resultadoLiquido: formatarMoeda(m.resultadoLiquido),
    }))

    const cartoes: CartaoResumo[] = [
      { rotulo: 'Receita Bruta', valor: formatarMoeda(relatorio.totalizador.receitaBruta) },
      { rotulo: 'Receita Líquida', valor: formatarMoeda(relatorio.totalizador.receitaLiquida) },
      { rotulo: 'Despesa Bruta', valor: formatarMoeda(relatorio.totalizador.despesaBruta) },
      { rotulo: 'Despesa Líquida', valor: formatarMoeda(relatorio.totalizador.despesaLiquida) },
      { rotulo: 'Resultado Bruto', valor: formatarMoeda(relatorio.totalizador.resultadoBruto) },
      { rotulo: 'Resultado Líquido', valor: formatarMoeda(relatorio.totalizador.resultadoLiquido) },
    ]

    if (formato === 'pdf') {
      const doc = criarDocumentoRelatorio({ tituloRelatorio: 'Receita x Despesa (Bruta e Líquida) por período', periodoDescricao })
      desenharCartoesResumo(doc, cartoes)
      // Aviso obrigatório específico deste relatório (Seção 2.7) —
      // em destaque, logo após os cartões de "Resultado" e antes do
      // gráfico, não escondido no rodapé em fonte reduzida (esse é o
      // disclaimer padrão, desenhado à parte por finalizarComRodape)
      desenharAvisoDestacado(doc, AVISO_RECEITA_DESPESA)
      doc.y = desenharGrafico(doc, relatorio.grafico, { x: 40, y: doc.y, largura: 515, altura: 200 })

      const colunas: ColunaTabela[] = [
        { chave: 'mes', rotulo: 'Mês', larguraProporcional: 0.9 },
        { chave: 'receitaBruta', rotulo: 'Receita Bruta', larguraProporcional: 1.15, alinhamento: 'right' },
        { chave: 'receitaLiquida', rotulo: 'Receita Líquida', larguraProporcional: 1.15, alinhamento: 'right' },
        { chave: 'despesaBruta', rotulo: 'Despesa Bruta', larguraProporcional: 1.15, alinhamento: 'right' },
        { chave: 'despesaLiquida', rotulo: 'Despesa Líquida', larguraProporcional: 1.15, alinhamento: 'right' },
        { chave: 'resultadoBruto', rotulo: 'Resultado Bruto', larguraProporcional: 1.15, alinhamento: 'right' },
        { chave: 'resultadoLiquido', rotulo: 'Resultado Líquido', larguraProporcional: 1.15, alinhamento: 'right' },
      ]
      desenharTabela(doc, colunas, linhasTabela)
      finalizarComRodape(doc)

      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="receita_despesa_${dataInicial}_a_${dataFinal}.pdf"`)
      doc.pipe(res)
      doc.end()
      doc.on('error', (err: Error) => {
        console.error('[relatorios/receita-despesa][pdf] stream error:', err)
        if (!res.headersSent) res.status(500).json({ erro: 'Erro ao gerar PDF' })
      })
      return
    }

    const colunasExcel: ColunaExcel[] = [
      { chave: 'mes', rotulo: 'Mês', larguraCaracteres: 12 },
      { chave: 'receitaBruta', rotulo: 'Receita Bruta', larguraCaracteres: 16 },
      { chave: 'receitaLiquida', rotulo: 'Receita Líquida', larguraCaracteres: 16 },
      { chave: 'despesaBruta', rotulo: 'Despesa Bruta', larguraCaracteres: 16 },
      { chave: 'despesaLiquida', rotulo: 'Despesa Líquida', larguraCaracteres: 16 },
      { chave: 'resultadoBruto', rotulo: 'Resultado Bruto', larguraCaracteres: 16 },
      { chave: 'resultadoLiquido', rotulo: 'Resultado Líquido', larguraCaracteres: 18 },
    ]
    const buffer = gerarBufferExcel({
      nomeAba: 'Receita x Despesa',
      tituloRelatorio: 'Receita x Despesa (Bruta e Líquida) por período',
      periodoDescricao,
      colunas: colunasExcel,
      linhas: linhasTabela,
      avisoExtra: AVISO_RECEITA_DESPESA,
    })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="receita_despesa_${dataInicial}_a_${dataFinal}.xlsx"`)
    return res.status(200).send(buffer)

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[relatorios/receita-despesa] handler error:', msg)
    if (!res.headersSent) res.status(500).json({ erro: msg })
  }
}
