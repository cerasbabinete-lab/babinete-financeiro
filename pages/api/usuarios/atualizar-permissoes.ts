// ============================================================
// pages/api/usuarios/atualizar-permissoes.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Usuários
// Função: Rota de atualização da matriz de permissões de um
//         usuário — Especificação §5, Função 3, aba Permissões.
//         Reversão #1 (26/08/2026, confirmada por Maycon): as
//         permissões do Admin são editáveis como as de qualquer
//         outro usuário — não há bloqueio aqui nem em
//         atualizarPermissoesUsuario(). Ver
//         Handoff_Modulo_Usuarios_Builder_para_Audit.md, Seção 6.1.
// Conecta com: lib/usuariosService.ts (atualizarPermissoesUsuario, ehAdmin),
//              types/usuarios.ts (PermissaoTogglePayload),
//              components/usuarios/UsuarioFormModal.tsx
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

import { atualizarPermissoesUsuario, ehAdmin } from '@/lib/usuariosService'
import type { PermissaoTogglePayload } from '@/types/usuarios'

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

  if (!ehAdmin(user.id, user.email ?? '')) {
    return res.status(403).json({ erro: 'Acesso restrito ao Administrador.' })
  }

  const { usuarioId, mudancas } = req.body as {
    usuarioId?: string
    mudancas?: PermissaoTogglePayload[]
  }

  if (!usuarioId || !Array.isArray(mudancas) || mudancas.length === 0) {
    return res.status(400).json({ erro: 'Corpo da requisição incompleto: usuarioId e mudancas são obrigatórios.' })
  }

  try {
    // Nenhuma checagem de Admin-alvo acontece aqui nem dentro de
    // atualizarPermissoesUsuario() — comportamento intencional
    // (Reversão #1, ver header deste arquivo)
    await atualizarPermissoesUsuario(usuarioId, mudancas, supabaseAdmin)
    return res.status(200).json({ sucesso: true })
  } catch (err: unknown) {
    const mensagemErro = err instanceof Error ? err.message : String(err)
    console.error('[atualizar-permissoes] erro:', mensagemErro)
    return res.status(500).json({ erro: `Falha ao atualizar permissões: ${mensagemErro}` })
  }
}
