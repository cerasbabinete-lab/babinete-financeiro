// ============================================================
// pages/api/danfe.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Receitas
// Função: Endpoint para geração de DANFE PDF
//         Recebe chave_acesso via POST JSON,
//         busca XML no Supabase Storage (bucket receitas_xml),
//         gera PDF com @mmachadosantos/nfe-danfe-pdf e faz pipe
//         direto para a resposta HTTP (Pages Router — Node.js stream)
// Conecta com: receitasService.ts (downloadXml),
//              @mmachadosantos/nfe-danfe-pdf (gerarPDF),
//              patch.js (aplicado via postinstall — visual patches)
// CRÍTICO: PDFKit retorna stream — SEMPRE usar .pipe(), nunca buffer
// CRÍTICO: Access key é o ÚNICO elemento em negrito no DANFE
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import path from 'path'
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

// Importação CJS — a lib usa require() internamente
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { gerarPDF } = require('@mmachadosantos/nfe-danfe-pdf')

// ============================================================
// Cliente Supabase server-side
// Usa service role key para acesso ao Storage sem RLS
// Variável SUPABASE_SERVICE_ROLE_KEY definida em .env.local
// e nunca exposta ao browser
// ============================================================
function getSupabaseAdmin() {
  const url     = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, svcKey)
}

// ============================================================
// handler
// ============================================================
export default async function handler(req: NextApiRequest, res: NextApiResponse) {

  // Aceita apenas POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ erro: 'Método não permitido' })
  }

  const { chave_acesso } = req.body as { chave_acesso?: string }

  if (!chave_acesso || chave_acesso.length !== 44) {
    return res.status(400).json({ erro: 'chave_acesso inválida ou ausente' })
  }

  try {
    // ── 1. Baixa o XML do Supabase Storage ─────────────────
    const supabase  = getSupabaseAdmin()
    const filename  = `${chave_acesso}.xml`

    const { data: blob, error: storageError } = await supabase.storage
      .from('receitas_xml')
      .download(filename)

    if (storageError || !blob) {
      console.error('[danfe] storage download error:', storageError)
      return res.status(404).json({ erro: 'XML não encontrado no storage' })
    }

    const xmlString = await blob.text()

    // ── 2. Resolve o path absoluto do logo PNG ──────────────
    // process.cwd() = raiz do projeto Next.js em qualquer ambiente
    const logoPath = path.join(process.cwd(), 'public', 'img', 'logo_cb.png')

    // ── 3. Gera o PDF via lib (retorna PDFKit PDFDocument) ──
    // gerarPDF() é async — aguarda a resolução antes do pipe
    const doc = await gerarPDF(xmlString, {
      pathLogo: fs.existsSync(logoPath) ? logoPath : undefined,
    })

    // ── 4. Headers da resposta ──────────────────────────────
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'inline; filename="danfe.pdf"')

    // ── 5. Pipe do stream PDFKit diretamente para res ───────
    // NUNCA coletar em buffer — o stream deve ser piped
    doc.pipe(res)

    // Trata erros no stream após o pipe ter iniciado
    doc.on('error', (err: Error) => {
      console.error('[danfe] stream error:', err)
      if (!res.headersSent) {
        res.status(500).json({ erro: 'Erro ao gerar PDF' })
      }
    })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[danfe] handler error:', msg)
    if (!res.headersSent) {
      res.status(500).json({ erro: msg })
    }
  }
}
