// ============================================================
// pages/api/importar-boleto-pdf.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Receber
// Função: Recebe um boleto PDF como body binário (Content-Type:
//         application/pdf), extrai texto com pdf-parse (Node.js
//         server-side), parseia com boletoPdfParser e vincula
//         nosso_numero + linha_digitavel ao título existente.
// CRÍTICO: pdf-parse é CJS Node.js — NÃO pode rodar no browser.
//          Esta route é o único ponto de uso correto.
// CRÍTICO: bodyParser desabilitado — lemos o stream manualmente.
// Conecta com: ContasReceberHeader.tsx (fetch POST body=PDF)
//              BasebarContasReceber.tsx (fetch POST body=PDF)
//              lib/boletoPdfParser.ts (parsearBoletoPdf)
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient }     from '@supabase/supabase-js'
import { parsearBoletoPdf } from '@/lib/boletoPdfParser'

// Desabilita o bodyParser do Next.js — lemos o stream manualmente
export const config = { api: { bodyParser: false } }

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require('pdf-parse')

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── Lê o body da request como Buffer ────────────────────────
function lerBodyBuffer(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end',   () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ erro: 'Método não permitido' })
  }

  // ── Auth ──────────────────────────────────────────────────
  const token = (req.headers.authorization ?? '').replace('Bearer ', '').trim() || null
  if (!token) return res.status(401).json({ erro: 'Não autorizado' })

  const supabase = getSupabaseAdmin()
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ erro: 'Não autorizado' })

  try {
    // ── Lê o PDF como Buffer ──────────────────────────────
    const buffer = await lerBodyBuffer(req)
    if (!buffer.length) {
      return res.status(400).json({ erro: 'Nenhum arquivo PDF recebido' })
    }

    // ── Extrai texto do PDF (server-side Node.js) ─────────
    const parser             = new PDFParse()
    const { text: textoPdf } = await parser.parse(buffer)

    // ── Parseia os campos do boleto ───────────────────────
    const { resultado, erros } = parsearBoletoPdf(textoPdf)

    if (!resultado) {
      const campos = erros.map(e => `${e.campo}: ${e.detalhe}`).join(' | ')
      return res.status(422).json({ erro: `Não foi possível extrair dados do boleto. ${campos}` })
    }

    const { nossoNumero, linhaDigitavel, numeroDocumento, dataVencimento } = resultado

    // ── Busca o título por numero_documento + data_vencimento
    const { data: encontrado, error: errBusca } = await supabase
      .from('contas_receber')
      .select('id, nosso_numero, linha_digitavel')
      .eq('numero_documento', numeroDocumento)
      .eq('data_vencimento',  dataVencimento)
      .is('deleted_at', null)
      .maybeSingle()

    if (errBusca) {
      return res.status(500).json({ erro: `Erro ao buscar título: ${errBusca.message}` })
    }

    if (!encontrado) {
      return res.status(200).json({
        vinculado:       false,
        nossoNumero,
        numeroDocumento,
        descricao: `Nenhum título encontrado para ${numeroDocumento} com vencimento ${dataVencimento}. Verifique se o XML foi importado em Receitas.`,
      })
    }

    // ── Já tem Nosso Número — só atualiza linha_digitavel se vazia
    if (encontrado.nosso_numero) {
      if (!encontrado.linha_digitavel) {
        await supabase
          .from('contas_receber')
          .update({ linha_digitavel: linhaDigitavel })
          .eq('id', encontrado.id)
      }
      return res.status(200).json({
        vinculado:       true,
        nossoNumero,
        numeroDocumento,
        descricao: `Título ${numeroDocumento} já possuía Nosso Número${!encontrado.linha_digitavel ? ' — linha digitável atualizada' : ''}.`,
      })
    }

    // ── Vincula nosso_numero + linha_digitavel ────────────
    const { error: errUpd } = await supabase
      .from('contas_receber')
      .update({ nosso_numero: nossoNumero, linha_digitavel: linhaDigitavel })
      .eq('id', encontrado.id)

    if (errUpd) {
      return res.status(500).json({ erro: `Erro ao vincular: ${errUpd.message}` })
    }

    // Registra evento no histórico
    await supabase
      .from('contas_receber_eventos')
      .insert({
        titulo_id: encontrado.id,
        tipo:      'nosso_numero_vinculado',
        descricao: `Nosso Número ${nossoNumero} e linha digitável vinculados via import de boleto PDF.`,
      })

    return res.status(200).json({
      vinculado:       true,
      nossoNumero,
      numeroDocumento,
      descricao: `Nosso Número ${nossoNumero} vinculado ao título ${numeroDocumento}.`,
    })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[importar-boleto-pdf] error:', msg)
    return res.status(500).json({ erro: msg })
  }
}
