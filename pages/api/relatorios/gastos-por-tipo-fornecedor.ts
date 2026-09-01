// ============================================================
// pages/api/relatorios/gastos-por-tipo-fornecedor.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Exportação PDF/Excel do relatório "Gastos por tipo de
//         fornecedor" (2.6) — o último dos 6
// Conecta com: lib/relatorios/gastosPorTipoFornecedor.ts
// Referência: Especificacao_Modulo_Relatorios.md, Seção 2.6
//
// MIGRAÇÃO (Especificacao_Fornecedores_Pix_Categorias_WhatsApp.md,
// Seção 4.7) — ROTULO_TIPO (dicionário estático) removido de
// gastosPorTipoFornecedor.ts; rótulos agora vêm resolvidos ao vivo em
// cada linha agregada (`.rotulo`). Contrato externo desta rota
// inalterado: `tipoFiltro` continua sendo aceito como string na
// query (única forma possível em HTTP), só a conversão interna
// (string → number | 'nao_classificado') mudou, via tipoFiltroParaTipo()
// abaixo — mesma função equivalente usada no componente de tela.
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

import { gerarRelatorioGastosPorTipoFornecedor } from '@/lib/relatorios/gastosPorTipoFornecedor'
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
import type { TipoFornecedorOuNaoClassificado } from '@/types/relatorios'

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// ============================================================
// tipoFiltroParaTipo()
// Converte o valor bruto da query string (sempre string em HTTP) para
// o tipo real esperado pelo gerador do relatório — mesma lógica
// equivalente usada em GastosPorTipoFornecedorRelatorio.tsx (tela)
// ============================================================
function tipoFiltroParaTipo(valor: string | undefined): TipoFornecedorOuNaoClassificado | undefined {
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
  const tipoFiltro = tipoFiltroParaTipo(req.query.tipoFiltro ? String(req.query.tipoFiltro) : undefined)

  if (!dataInicial || !dataFinal) return res.status(400).json({ erro: 'dataInicial e dataFinal são obrigatórios' })
  if (formato !== 'pdf' && formato !== 'xlsx') {
    return res.status(400).json({ erro: 'formato deve ser "pdf" ou "xlsx" — leitura de tela não passa por esta rota' })
  }

  try {
    const relatorio = await gerarRelatorioGastosPorTipoFornecedor({ dataInicial, dataFinal, tipoFiltro }, supabaseAdmin)
    const periodoDescricao = formatarPeriodoDescricao(dataInicial, dataFinal)

    // Tabela: uma linha por combinação tipo+mês (visão mensal
    // detalhada) — a visão "por tipo" (período inteiro) fica nos
    // cartões de resumo. Rótulo já vem resolvido em cada linha
    // (relatorio.porTipoPorMes[i].rotulo) — sem dicionário externo
    const linhasTabela = relatorio.porTipoPorMes.map(g => ({
      mes: formatarMesBR(g.mes),
      tipo: g.rotulo,
      total: formatarMoeda(g.total),
    }))

    const cartoes: CartaoResumo[] = relatorio.porTipo.map(t => ({
      rotulo: t.rotulo,
      valor: formatarMoeda(t.total),
    }))

    if (formato === 'pdf') {
      const doc = criarDocumentoRelatorio({ tituloRelatorio: 'Gastos por tipo de fornecedor', periodoDescricao })
      if (cartoes.length > 0) desenharCartoesResumo(doc, cartoes)
      doc.y = desenharGrafico(doc, relatorio.grafico, { x: 40, y: doc.y, largura: 515, altura: 200 })

      const colunas: ColunaTabela[] = [
        { chave: 'mes', rotulo: 'Mês', larguraProporcional: 1 },
        { chave: 'tipo', rotulo: 'Tipo', larguraProporcional: 1.6 },
        { chave: 'total', rotulo: 'Total', larguraProporcional: 1.2, alinhamento: 'right' },
      ]
      desenharTabela(doc, colunas, linhasTabela)
      finalizarComRodape(doc)

      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="gastos_por_tipo_fornecedor_${dataInicial}_a_${dataFinal}.pdf"`)
      doc.pipe(res)
      doc.end()
      doc.on('error', (err: Error) => {
        console.error('[relatorios/gastos-por-tipo-fornecedor][pdf] stream error:', err)
        if (!res.headersSent) res.status(500).json({ erro: 'Erro ao gerar PDF' })
      })
      return
    }

    const colunasExcel: ColunaExcel[] = [
      { chave: 'mes', rotulo: 'Mês', larguraCaracteres: 12 },
      { chave: 'tipo', rotulo: 'Tipo', larguraCaracteres: 22 },
      { chave: 'total', rotulo: 'Total', larguraCaracteres: 16 },
    ]
    const buffer = gerarBufferExcel({
      nomeAba: 'Gastos por Tipo',
      tituloRelatorio: 'Gastos por tipo de fornecedor',
      periodoDescricao,
      colunas: colunasExcel,
      linhas: linhasTabela,
    })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="gastos_por_tipo_fornecedor_${dataInicial}_a_${dataFinal}.xlsx"`)
    return res.status(200).send(buffer)

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[relatorios/gastos-por-tipo-fornecedor] handler error:', msg)
    if (!res.headersSent) res.status(500).json({ erro: msg })
  }
}
