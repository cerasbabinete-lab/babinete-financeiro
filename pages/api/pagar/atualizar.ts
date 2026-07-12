// ============================================================
// pages/api/pagar/atualizar.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Pagar
// Função: Endpoint de edição de campos de um título existente
//         (observações, status manual, etc.)
// Conecta com: lib/contasAPagarService.ts (atualizarTitulo)
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

import { atualizarTitulo } from '@/lib/contasAPagarService'
import type { ContaAPagarUpdate } from '@/types/contasAPagar'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
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

  const titulo = req.body as ContaAPagarUpdate
  if (!titulo?.id) {
    return res.status(400).json({ erro: 'Corpo da requisição incompleto: id é obrigatório.' })
  }

  try {
    const tituloAtualizado = await atualizarTitulo(titulo, supabaseAdmin)
    return res.status(200).json({ titulo: tituloAtualizado })
  } catch (err: unknown) {
    const mensagemErro = err instanceof Error ? err.message : String(err)
    console.error('[atualizar] erro:', mensagemErro)
    return res.status(500).json({ erro: `Falha ao atualizar título: ${mensagemErro}` })
  }
}
