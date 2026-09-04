// ============================================================
// pages/api/usuarios/status-visitante.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Usuários — Usuário Visitante
// Função: Retorna o tipo_usuario e status de expiração do usuário
//         autenticado (não de outro — sempre o dono do token). Usado
//         em dois lugares: app/login/page.tsx (barra o login se já
//         expirado) e components/layout/Topbar.tsx (contador
//         regressivo). "expirado" é calculado AQUI, no relógio do
//         servidor Node (Date.now()) — nunca confia em cálculo feito
//         no navegador (relógio do cliente não é confiável).
// Conecta com: types/usuarios.ts (StatusVisitanteResultado)
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

import type { StatusVisitanteResultado } from '@/types/usuarios'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ erro: 'Método não permitido' })
  }

  const token = (req.headers.authorization ?? '').replace('Bearer ', '').trim() || null
  if (!token) return res.status(401).json({ erro: 'Não autorizado' })

  const supabaseAdmin = getSupabaseAdmin()
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ erro: 'Não autorizado' })

  const { data: usuario, error: erroBusca } = await supabaseAdmin
    .from('usuarios')
    .select('tipo_usuario, expira_em')
    .eq('auth_user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (erroBusca || !usuario) {
    console.error('[status-visitante] erro:', erroBusca)
    return res.status(404).json({ erro: 'Usuário não encontrado.' })
  }

  const expirado = usuario.tipo_usuario === 'visitante' && !!usuario.expira_em
    && new Date(usuario.expira_em).getTime() <= Date.now()

  const resultado: StatusVisitanteResultado = {
    tipoUsuario: usuario.tipo_usuario,
    expiraEm: usuario.expira_em,
    expirado,
  }
  return res.status(200).json(resultado)
}
