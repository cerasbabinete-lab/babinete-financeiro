// ============================================================
// pages/api/logs/registrar-login.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Log de Acesso (auditoria)
// Função: Registra um evento de login_sucesso ou login_falha.
//         EXCEÇÃO DELIBERADA ao padrão de Bearer token obrigatório
//         do resto do projeto: login_falha por definição não tem
//         sessão/token ainda, então esta rota não pode exigir
//         autenticação. Risco aceito: alguém pode forjar linhas de
//         login_falha para um username arbitrário sem se autenticar
//         — é só poluição na trilha de auditoria (sistema interno,
//         não há dado sensível exposto por isto), não um caminho de
//         acesso a dado nenhum. Quando sucesso=true, valida o
//         access_token recebido via getUser() antes de gravar
//         usuario_id, para não permitir forjar um login_sucesso
//         atribuído a outro usuário.
// Conecta com: lib/logsService.ts (registrarLog), app/login/page.tsx
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

import { registrarLog } from '@/lib/logsService'

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

  const { username, sucesso, token } = req.body as { username?: string; sucesso?: boolean; token?: string }

  if (!username || typeof sucesso !== 'boolean') {
    return res.status(400).json({ erro: 'Corpo da requisição incompleto: username e sucesso são obrigatórios.' })
  }

  const supabaseAdmin = getSupabaseAdmin()

  let usuarioId: string | null = null
  if (sucesso && token) {
    const { data: { user } } = await supabaseAdmin.auth.getUser(token)
    usuarioId = user?.id ?? null
  }

  await registrarLog(
    {
      usuarioId,
      username,
      tipoEvento: sucesso ? 'login_sucesso' : 'login_falha',
      ipAddress: obterIp(req),
    },
    supabaseAdmin,
  )

  // Sempre 200 — falha ao registrar log nunca deve impactar a UX de
  // login, que já terminou (com sucesso ou erro) antes desta chamada
  return res.status(200).json({ sucesso: true })
}
