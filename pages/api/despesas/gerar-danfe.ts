// ============================================================
// pages/api/despesas/gerar-danfe.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Despesas
// Função: Endpoint de 2ª via de DANFE — busca a despesa por id,
//         valida que tem chave_acesso_nfe + xml_conteudo arquivados,
//         gera o PDF com a mesma lib e os mesmos patches visuais que
//         Receitas já usa (@mmachadosantos/nfe-danfe-pdf, patch.js) e
//         faz pipe direto para a resposta HTTP.
// FEATURE (a pedido do usuário — 2ª via de DANFE): DIFERENÇA em relação
// a pages/api/danfe.ts (Receitas): lá o XML é baixado do Supabase
// Storage (bucket receitas_xml); aqui o XML já está guardado como texto
// na própria linha da despesa (coluna xml_conteudo) — decisão de
// arquitetura tomada explicitamente pelo usuário (guardar a informação
// estruturada, não um arquivo em Storage). Também segue o padrão de
// auth mais estrito já estabelecido em Despesas (Bearer + getUser()),
// diferente de pages/api/danfe.ts, que não exige autenticação.
// Conecta com: components/despesas/DespesasModal.tsx (botão no modal),
//              components/despesas/DespesasTabela.tsx (ícone na tabela),
//              components/despesas/DespesasMobileList.tsx (bottom-sheet)
// Referência: mesmo padrão de pages/api/pagar/gerar-boleto-avulso.ts
//             (GET, Bearer+getUser(), busca por id, pipe do PDF)
// CRÍTICO: PDFKit retorna stream — SEMPRE usar .pipe(), nunca buffer
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import path from 'path'
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

// Importação CJS — a lib usa require() internamente, mesmo padrão de pages/api/danfe.ts
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { gerarPDF } = require('@mmachadosantos/nfe-danfe-pdf')

// ------------------------------------------------------------
// FUNÇÃO: getSupabaseAdmin
// Mesmo padrão local-por-rota já usado nas demais rotas de Despesas
// ------------------------------------------------------------
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ------------------------------------------------------------
// HANDLER
// ------------------------------------------------------------
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ erro: 'Método não permitido' })
  }

  // ── Auth — mesmo padrão Bearer token + getUser() das demais rotas de Despesas ──
  const token = (req.headers.authorization ?? '').replace('Bearer ', '').trim() || null
  if (!token) return res.status(401).json({ erro: 'Não autorizado' })

  const supabaseAdmin = getSupabaseAdmin()
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ erro: 'Não autorizado' })

  const id = typeof req.query.id === 'string' ? req.query.id : null
  if (!id) return res.status(400).json({ erro: 'Parâmetro id é obrigatório' })

  try {
    // ── 1. Busca a despesa e valida que tem o que precisa ──────
    const { data: despesaRow, error: erroBusca } = await supabaseAdmin
      .from('despesas')
      .select('id, chave_acesso_nfe, xml_conteudo')
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (erroBusca || !despesaRow) {
      return res.status(404).json({ erro: 'Despesa não encontrada' })
    }

    if (!despesaRow.chave_acesso_nfe || !despesaRow.xml_conteudo) {
      return res.status(400).json({
        erro: 'Esta despesa não tem chave de acesso e/ou XML arquivados — 2ª via de DANFE só está disponível para despesas importadas por XML após a implantação desta função.',
      })
    }

    // ── 2. Resolve o path absoluto do logo PNG (mesmo arquivo de Receitas) ──
    const logoPath = path.join(process.cwd(), 'public', 'img', 'logo_cb.png')

    // ── 3. Gera o PDF via lib (retorna PDFKit PDFDocument) ──────
    const doc = await gerarPDF(despesaRow.xml_conteudo, {
      pathLogo: fs.existsSync(logoPath) ? logoPath : undefined,
    })

    // ── 4. Headers da resposta ──────────────────────────────────
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'inline; filename="danfe.pdf"')

    // ── 5. Pipe do stream PDFKit diretamente para res ───────────
    // NUNCA coletar em buffer — o stream deve ser piped
    doc.pipe(res)

    doc.on('error', (err: Error) => {
      console.error('[gerar-danfe] stream error:', err)
      if (!res.headersSent) {
        res.status(500).json({ erro: 'Erro ao gerar PDF' })
      }
    })

  } catch (err: unknown) {
    // Convenção do projeto: catch (err: unknown), nunca "any"
    const mensagemErro = err instanceof Error ? err.message : String(err)
    console.error('[gerar-danfe] handler error:', mensagemErro)
    if (!res.headersSent) {
      res.status(500).json({ erro: `Falha ao gerar DANFE: ${mensagemErro}` })
    }
  }
}
