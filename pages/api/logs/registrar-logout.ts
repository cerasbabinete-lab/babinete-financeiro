// ============================================================
// pages/api/logs/registrar-logout.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Log de Acesso (auditoria)
// Função: Registra um evento de logout. Diferente de
//         registrar-login.ts, aqui o usuário ainda está autenticado
//         no momento da chamada (é chamado ANTES do
//         supabase.auth.signOut() no cliente), então segue o padrão
//         normal de Bearer token do resto do projeto.
// Conecta com: lib/logsService.ts (registrarLog),
//              components/layout/Topbar.tsx, components/layout/Drawer.tsx
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

import { registrarLog } from '@/lib/logsService'
import { resolverUsernameExibicao } from '@/lib/authUsername'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function obterIp(req: NextApiRequest): string | null {
  const forwardedFor = req.headers['x-forwarded-for']
  if (typeof forwardedFor === 'string') return forwardedFor.split(',')[0].trim()
  return req.socket.remoteAddress ?? null
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' })
  }

  const token = (req.headers.authorization ?? '').replace('Bearer ', '').trim() || null
  if (!token) return res.status(401).json({ erro: 'Não autorizado' })

  const supabaseAdmin = getSupabaseAdmin()
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ erro: 'Não autorizado' })

  await registrarLog(
    {
      usuarioId: user.id,
      username: resolverUsernameExibicao(user.email),
      tipoEvento: 'logout',
      ipAddress: obterIp(req),
    },
    supabaseAdmin,
  )

  return res.status(200).json({ sucesso: true })
}
