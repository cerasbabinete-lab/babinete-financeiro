// ============================================================
// pages/api/usuarios/excluir.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Usuários
// Função: Rota de exclusão de um usuário — Especificação §5,
//         Função 4. Soft-delete (deleted_at) + desabilita o login
//         no Supabase Auth. Não existe "reativar" (Especificação
//         §5, Função 4 e §7, item 10 — decisão explícita, não
//         implementar). Se o soft-delete funcionar mas o bloqueio
//         no Auth falhar, o erro é repassado ao Admin em vez de
//         reportar sucesso (estado de falha parcial relevante pra
//         segurança — ver comentário em excluirUsuario(), lib/usuariosService.ts).
// Conecta com: lib/usuariosService.ts (excluirUsuario, ehAdmin),
//              components/usuarios/UsuariosTabela.tsx
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

import { excluirUsuario, ehAdmin } from '@/lib/usuariosService'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ erro: 'Método não permitido' })
  }

  const token = (req.headers.authorization ?? '').replace('Bearer ', '').trim() || null
  if (!token) return res.status(401).json({ erro: 'Não autorizado' })

  const supabaseAdmin = getSupabaseAdmin()
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ erro: 'Não autorizado' })

  if (!ehAdmin(user.id, user.email ?? '')) {
    return res.status(403).json({ erro: 'Acesso restrito ao Administrador.' })
  }

  const { usuarioId } = req.body as { usuarioId?: string }
  if (!usuarioId) {
    return res.status(400).json({ erro: 'Corpo da requisição incompleto: usuarioId é obrigatório.' })
  }

  try {
    await excluirUsuario(usuarioId, supabaseAdmin)
    return res.status(200).json({ sucesso: true })
  } catch (err: unknown) {
    const mensagemErro = err instanceof Error ? err.message : String(err)
    console.error('[excluir] erro:', mensagemErro)
    // Repassa a mensagem tal como veio de excluirUsuario() — pode
    // conter o aviso de falha parcial (soft-delete ok, Auth ban falhou)
    return res.status(500).json({ erro: mensagemErro })
  }
}
