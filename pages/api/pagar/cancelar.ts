// ============================================================
// pages/api/pagar/cancelar.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Pagar
// Função: Endpoint de cancelamento (soft-delete) de um título —
//         nunca DELETE físico.
// Conecta com: lib/contasAPagarService.ts (cancelarTitulo)
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

import { cancelarTitulo } from '@/lib/contasAPagarService'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

interface CorpoRequisicaoCancelar {
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

  const { id } = req.body as CorpoRequisicaoCancelar
  if (!id) {
    return res.status(400).json({ erro: 'Corpo da requisição incompleto: id é obrigatório.' })
  }

  try {
    await cancelarTitulo(id, supabaseAdmin)
    return res.status(200).json({ sucesso: true })
  } catch (err: unknown) {
    const mensagemErro = err instanceof Error ? err.message : String(err)
    console.error('[cancelar] erro:', mensagemErro)
    return res.status(500).json({ erro: `Falha ao cancelar título: ${mensagemErro}` })
  }
}
