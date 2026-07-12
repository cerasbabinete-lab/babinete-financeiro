// ============================================================
// pages/api/pagar/reabrir.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Pagar
// Função: Endpoint de reabertura de um título cancelado ou baixado —
//         reverte para em_aberto.
// Conecta com: lib/contasAPagarService.ts (reabrirTitulo)
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

import { reabrirTitulo } from '@/lib/contasAPagarService'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

interface CorpoRequisicaoReabrir {
  id: string
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'PUT') {
    return res.status(405).json({ erro: 'Método não permitido' })
  }

  const token = (req.headers.authorization ?? '').replace('Bearer ', '').trim() || null
  if (!token) return res.status(401).json({ erro: 'Não autorizado' })

  const supabaseAdmin = getSupabaseAdmin()
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ erro: 'Não autorizado' })

  const { id } = req.body as CorpoRequisicaoReabrir
  if (!id) {
    return res.status(400).json({ erro: 'Corpo da requisição incompleto: id é obrigatório.' })
  }

  try {
    await reabrirTitulo(id, supabaseAdmin)
    return res.status(200).json({ sucesso: true })
  } catch (err: unknown) {
    const mensagemErro = err instanceof Error ? err.message : String(err)
    console.error('[reabrir] erro:', mensagemErro)
    return res.status(500).json({ erro: `Falha ao reabrir título: ${mensagemErro}` })
  }
}
