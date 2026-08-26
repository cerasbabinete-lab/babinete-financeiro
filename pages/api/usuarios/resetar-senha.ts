// ============================================================
// pages/api/usuarios/resetar-senha.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Usuários
// Função: Rota de reset de senha — Especificação §5, Função 2.
//         Suporta os dois pontos de entrada previstos (linha da
//         lista OU dentro da tela de edição — Especificação §5,
//         Função 2, trigger), já que ambos só precisam do
//         usuarioId no corpo da requisição, sem diferença de
//         lógica entre os dois.
//         Delega a ordem exata (gerar senha -> enviar e-mail -> só
//         então atualizar Auth) para resetarSenhaUsuario() em
//         lib/usuariosService.ts (Opção A, confirmada por Maycon
//         em sessão de build).
// Conecta com: lib/usuariosService.ts (resetarSenhaUsuario, ehAdmin),
//              components/usuarios/UsuariosTabela.tsx, components/usuarios/UsuarioFormModal.tsx
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

import { resetarSenhaUsuario, senhaValida, ehAdmin } from '@/lib/usuariosService'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
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

  if (!ehAdmin(user.id, user.email ?? '')) {
    return res.status(403).json({ erro: 'Acesso restrito ao Administrador.' })
  }

  const { usuarioId, novaSenha } = req.body as { usuarioId?: string; novaSenha?: string }
  if (!usuarioId) {
    return res.status(400).json({ erro: 'Corpo da requisição incompleto: usuarioId é obrigatório.' })
  }
  if (!novaSenha || !senhaValida(novaSenha)) {
    return res.status(400).json({ erro: 'A nova senha precisa ter pelo menos 6 caracteres.' })
  }

  try {
    // Se o envio de e-mail falhar, resetarSenhaUsuario() lança erro
    // ANTES de tocar no Auth — a senha antiga continua válida, nada
    // fica em estado parcial (Opção A, confirmada por Maycon)
    const { emailEnviadoPara } = await resetarSenhaUsuario(usuarioId, novaSenha, supabaseAdmin)
    return res.status(200).json({ emailEnviadoPara })
  } catch (err: unknown) {
    const mensagemErro = err instanceof Error ? err.message : String(err)
    console.error('[resetar-senha] erro:', mensagemErro)
    return res.status(500).json({ erro: `Falha ao resetar senha: ${mensagemErro}` })
  }
}
