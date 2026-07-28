// ============================================================
// pages/api/relatorios/curva-abc.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Exportação PDF/Excel do relatório "Curva ABC" (2.5).
//         O drill-down de produtos (Seção 2.5) é só de tela — não
//         faz sentido em PDF/Excel estático, que já lista todos os
//         itens; por isso não tem parâmetro de drill-down aqui.
// Conecta com: lib/relatorios/curvaAbc.ts
// Referência: Especificacao_Modulo_Relatorios.md, Seção 2.5
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

import { gerarRelatorioCurvaAbc } from '@/lib/relatorios/curvaAbc'
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
import type { DimensaoAbc } from '@/types/relatorios'

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const TITULO_DIMENSAO: Record<DimensaoAbc, string> = {
  clientes: 'Curva ABC — Clientes',
  fornecedores: 'Curva ABC — Fornecedores',
  produtos: 'Curva ABC — Produtos',
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
  const dimensao = String(req.query.dimensao ?? '') as DimensaoAbc

  if (!dataInicial || !dataFinal) return res.status(400).json({ erro: 'dataInicial e dataFinal são obrigatórios' })
  if (!['clientes', 'fornecedores', 'produtos'].includes(dimensao)) {
    return res.status(400).json({ erro: 'dimensao deve ser "clientes", "fornecedores" ou "produtos"' })
  }
  if (formato !== 'pdf' && formato !== 'xlsx') {
    return res.status(400).json({ erro: 'formato deve ser "pdf" ou "xlsx" — leitura de tela não passa por esta rota' })
  }

  try {
    const relatorio = await gerarRelatorioCurvaAbc(dimensao, { dataInicial, dataFinal }, supabaseAdmin)
    const periodoDescricao = formatarPeriodoDescricao(dataInicial, dataFinal)
    const temPrazoMedio = dimensao === 'fornecedores'

    const linhasTabela = relatorio.itens.map(i => ({
      nome: i.nome,
      valor: formatarMoeda(i.valor),
      percentualIndividual: `${i.percentualIndividual.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`,
      percentualAcumulado: `${i.percentualAcumulado.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`,
      classe: i.classe,
      prazoMedioPagamentoDias: i.prazoMedioPagamentoDias !== undefined ? `${i.prazoMedioPagamentoDias} dias` : '—',
    }))

    const cartoes: CartaoResumo[] = [
      { rotulo: 'Total do período', valor: formatarMoeda(relatorio.totalPeriodo) },
      { rotulo: 'Itens', valor: String(relatorio.itens.length) },
      { rotulo: 'Classe A', valor: String(relatorio.itens.filter(i => i.classe === 'A').length) },
    ]

    if (formato === 'pdf') {
      const doc = criarDocumentoRelatorio({ tituloRelatorio: TITULO_DIMENSAO[dimensao], periodoDescricao })
      desenharCartoesResumo(doc, cartoes)
      doc.y = desenharGrafico(doc, relatorio.grafico, { x: 40, y: doc.y, largura: 515, altura: 220 })

      const colunas: ColunaTabela[] = [
        { chave: 'nome', rotulo: 'Nome', larguraProporcional: temPrazoMedio ? 1.8 : 2.2 },
        { chave: 'valor', rotulo: 'Valor', larguraProporcional: 1, alinhamento: 'right' },
        { chave: 'percentualIndividual', rotulo: '% Ind.', larguraProporcional: 0.7, alinhamento: 'right' },
        { chave: 'percentualAcumulado', rotulo: '% Acum.', larguraProporcional: 0.8, alinhamento: 'right' },
        { chave: 'classe', rotulo: 'Classe', larguraProporcional: 0.6, alinhamento: 'center' },
        ...(temPrazoMedio ? [{ chave: 'prazoMedioPagamentoDias', rotulo: 'Prazo médio', larguraProporcional: 1, alinhamento: 'right' as const }] : []),
      ]
      desenharTabela(doc, colunas, linhasTabela)
      finalizarComRodape(doc)

      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="curva_abc_${dimensao}_${dataInicial}_a_${dataFinal}.pdf"`)
      doc.pipe(res)
      doc.end()
      doc.on('error', (err: Error) => {
        console.error('[relatorios/curva-abc][pdf] stream error:', err)
        if (!res.headersSent) res.status(500).json({ erro: 'Erro ao gerar PDF' })
      })
      return
    }

    const colunasExcel: ColunaExcel[] = [
      { chave: 'nome', rotulo: 'Nome', larguraCaracteres: 30 },
      { chave: 'valor', rotulo: 'Valor', larguraCaracteres: 16 },
      { chave: 'percentualIndividual', rotulo: '% Individual', larguraCaracteres: 14 },
      { chave: 'percentualAcumulado', rotulo: '% Acumulado', larguraCaracteres: 14 },
      { chave: 'classe', rotulo: 'Classe', larguraCaracteres: 10 },
      ...(temPrazoMedio ? [{ chave: 'prazoMedioPagamentoDias', rotulo: 'Prazo médio de pagamento', larguraCaracteres: 22 }] : []),
    ]
    const buffer = gerarBufferExcel({
      nomeAba: TITULO_DIMENSAO[dimensao].slice(0, 31),
      tituloRelatorio: TITULO_DIMENSAO[dimensao],
      periodoDescricao,
      colunas: colunasExcel,
      linhas: linhasTabela,
    })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="curva_abc_${dimensao}_${dataInicial}_a_${dataFinal}.xlsx"`)
    return res.status(200).send(buffer)

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[relatorios/curva-abc] handler error:', msg)
    if (!res.headersSent) res.status(500).json({ erro: msg })
  }
}
