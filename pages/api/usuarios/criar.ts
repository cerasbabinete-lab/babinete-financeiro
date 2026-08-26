// ============================================================
// pages/api/usuarios/criar.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Usuários
// Função: Rota de criação de um novo usuário — Especificação §5,
//         Função 1. Valida campos obrigatórios e formato antes de
//         delegar a orquestração (Auth Admin API + insert usuarios +
//         50 linhas de permissões + rollback) para
//         criarUsuario() em lib/usuariosService.ts.
// Conecta com: lib/usuariosService.ts (criarUsuario, emailValido, ehAdmin),
//              types/usuarios.ts (UsuarioInsert), components/usuarios/UsuarioFormModal.tsx
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

import { criarUsuario, emailValido, senhaValida, ehAdmin } from '@/lib/usuariosService'
import type { UsuarioInsert } from '@/types/usuarios'

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

  // Autenticação — Bearer token + getUser(), nunca getSession()
  const token = (req.headers.authorization ?? '').replace('Bearer ', '').trim() || null
  if (!token) return res.status(401).json({ erro: 'Não autorizado' })

  const supabaseAdmin = getSupabaseAdmin()
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ erro: 'Não autorizado' })

  // Autorização — só o Admin pode criar usuários (Especificação §2.3)
  if (!ehAdmin(user.id, user.email ?? '')) {
    return res.status(403).json({ erro: 'Acesso restrito ao Administrador.' })
  }

  const dados = req.body as UsuarioInsert

  // Passo 1 — valida campos obrigatórios (Especificação §5, Função 1, passo 1)
  const camposObrigatorios: (keyof UsuarioInsert)[] = [
    'nome_completo', 'username', 'senha', 'cpf_cnpj', 'data_nascimento',
    'celular_whatsapp', 'email_pessoal', 'status',
  ]
  const faltando = camposObrigatorios.filter((campo) => !dados?.[campo] || String(dados[campo]).trim() === '')
  if (faltando.length > 0) {
    return res.status(400).json({ erro: `Campos obrigatórios faltando: ${faltando.join(', ')}` })
  }

  // Senha digitada pelo Admin (não gerada mais pelo sistema — decisão
  // de 26/08/2026) — só um piso mínimo de sanidade, 6 caracteres
  if (!senhaValida(dados.senha)) {
    return res.status(400).json({ erro: 'A senha precisa ter pelo menos 6 caracteres.' })
  }

  // Passo 4 — valida formato de email_pessoal (Especificação §5, Função 1, passo 4)
  if (!emailValido(dados.email_pessoal)) {
    return res.status(400).json({ erro: 'E-mail pessoal em formato inválido.' })
  }

  // Passos de unicidade de username, email_tecnico, Auth, insert
  // usuarios, insert permissões, rollback — delegados ao service,
  // que já contém toda a orquestração e regras de rollback
  // (Especificação §5, Função 1, edge cases)
  try {
    const { usuario } = await criarUsuario(dados, supabaseAdmin)
    return res.status(201).json({ usuario })
  } catch (err: unknown) {
    const mensagemErro = err instanceof Error ? err.message : String(err)
    console.error('[criar] erro:', mensagemErro)
    return res.status(500).json({ erro: `Falha ao criar usuário: ${mensagemErro}` })
  }
}
