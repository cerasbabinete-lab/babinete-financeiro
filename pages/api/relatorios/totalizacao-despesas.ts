// ============================================================
// pages/api/relatorios/totalizacao-despesas.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Exportação PDF/Excel do relatório "Totalização de
//         Despesas" (2.9) — relatório irmão do 2.8.
// Conecta com: lib/relatorios/totalizacaoDespesas.ts
// Referência: mockup aprovado por Maycon — ver cabeçalho de
//             lib/relatorios/totalizacaoDespesas.ts
//
// O PDF/Excel leva só o gráfico "Mês a mês" (DadosGrafico tipo
// 'barras' padrão) quando incluirGrafico=true — o modo "Comparar
// períodos" é só de tela, mesma decisão do 2.8 (ver nota em
// types/relatorios.ts, ComparacaoPeriodosResultadoDespesas).
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

import { gerarRelatorioTotalizacaoDespesas, gerarGraficoMesAMesTotalizacaoDespesas } from '@/lib/relatorios/totalizacaoDespesas'
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
import type { TipoFornecedorOuNaoClassificado } from '@/types/relatorios'

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// Mesma conversão do <select> usada na tela (string bruta →
// TipoFornecedorOuNaoClassificado | undefined) — aqui a query
// string chega como string sempre, então a mesma lógica se aplica
function tipoFornecedorFiltroDaQuery(valor: string | undefined): TipoFornecedorOuNaoClassificado | undefined {
  if (!valor) return undefined
  if (valor === 'nao_classificado') return 'nao_classificado'
  return Number(valor)
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
  const tipoFornecedorFiltro = tipoFornecedorFiltroDaQuery(req.query.tipoFornecedorFiltro ? String(req.query.tipoFornecedorFiltro) : undefined)
  const fornecedorId = req.query.fornecedorId ? Number(req.query.fornecedorId) : undefined

  if (!dataInicial || !dataFinal) return res.status(400).json({ erro: 'dataInicial e dataFinal são obrigatórios' })
  if (formato !== 'pdf' && formato !== 'xlsx') {
    return res.status(400).json({ erro: 'formato deve ser "pdf" ou "xlsx" — leitura de tela não passa por esta rota' })
  }

  try {
    const relatorio = await gerarRelatorioTotalizacaoDespesas({ dataInicial, dataFinal, tipoFornecedorFiltro, fornecedorId }, supabaseAdmin)
    const periodoDescricao = formatarPeriodoDescricao(dataInicial, dataFinal)

    const linhasTabela = relatorio.itens.map(item => ({
      documento: item.documentoNumero ?? '—',
      emissao: formatarDataBR(item.dataEmissao),
      vencimento: item.vencimento ? formatarDataBR(item.vencimento) : '—',
      tipoFornecedor: item.tipoFornecedorRotulo,
      codigo: String(item.fornecedorId),
      favorecido: item.favorecidoNome,
      valor: formatarMoeda(item.valor),
    }))

    const cartoes: CartaoResumo[] = [
      { rotulo: 'Total de despesas', valor: String(relatorio.totalDespesas) },
      { rotulo: 'Valor total', valor: formatarMoeda(relatorio.valorTotal) },
    ]

    if (formato === 'pdf') {
      const doc = criarDocumentoRelatorio({ tituloRelatorio: 'Relatório Totalização de Despesas', periodoDescricao })
      desenharCartoesResumo(doc, cartoes)

      if (incluirGrafico) {
        const grafico = await gerarGraficoMesAMesTotalizacaoDespesas(anoGrafico, supabaseAdmin)
        doc.y = desenharGrafico(doc, grafico, { x: 40, y: doc.y, largura: 515, altura: 200 })
      }

      const colunas: ColunaTabela[] = [
        { chave: 'documento', rotulo: 'Documento', larguraProporcional: 0.8 },
        { chave: 'emissao', rotulo: 'Emissão', larguraProporcional: 0.7 },
        { chave: 'vencimento', rotulo: 'Vencimento', larguraProporcional: 0.75 },
        { chave: 'tipoFornecedor', rotulo: 'Tipo de Fornecedor', larguraProporcional: 1.2 },
        { chave: 'codigo', rotulo: 'Cód.', larguraProporcional: 0.45 },
        { chave: 'favorecido', rotulo: 'Favorecido', larguraProporcional: 1.6 },
        { chave: 'valor', rotulo: 'Valor', larguraProporcional: 0.8, alinhamento: 'right' },
      ]
      desenharTabela(doc, colunas, linhasTabela)
      finalizarComRodape(doc)

      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="totalizacao_despesas_${dataInicial}_a_${dataFinal}.pdf"`)
      doc.pipe(res)
      doc.end()
      doc.on('error', (err: Error) => {
        console.error('[relatorios/totalizacao-despesas][pdf] stream error:', err)
        if (!res.headersSent) res.status(500).json({ erro: 'Erro ao gerar PDF' })
      })
      return
    }

    const colunasExcel: ColunaExcel[] = [
      { chave: 'documento', rotulo: 'Documento', larguraCaracteres: 16 },
      { chave: 'emissao', rotulo: 'Emissão', larguraCaracteres: 12 },
      { chave: 'vencimento', rotulo: 'Vencimento', larguraCaracteres: 12 },
      { chave: 'tipoFornecedor', rotulo: 'Tipo de Fornecedor', larguraCaracteres: 28 },
      { chave: 'codigo', rotulo: 'Cód.', larguraCaracteres: 10 },
      { chave: 'favorecido', rotulo: 'Favorecido', larguraCaracteres: 40 },
      { chave: 'valor', rotulo: 'Valor', larguraCaracteres: 16 },
    ]
    const buffer = gerarBufferExcel({
      nomeAba: 'Totalização Despesas',
      tituloRelatorio: 'Relatório Totalização de Despesas',
      periodoDescricao,
      colunas: colunasExcel,
      linhas: linhasTabela,
    })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="totalizacao_despesas_${dataInicial}_a_${dataFinal}.xlsx"`)
    return res.status(200).send(buffer)

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[relatorios/totalizacao-despesas] handler error:', msg)
    if (!res.headersSent) res.status(500).json({ erro: msg })
  }
}
