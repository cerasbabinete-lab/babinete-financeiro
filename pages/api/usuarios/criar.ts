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
import { validarCpfCnpj } from '@/lib/validacoesUsuarios'
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
  const tipoUsuario = dados?.tipo_usuario ?? 'normal'

  // Passo 1 — valida campos obrigatórios (Especificação §5, Função 1, passo 1)
  // Visitante (fluxo novo, 27/08/2026): não é uma pessoa real, não tem
  // CPF/data de nascimento/celular/e-mail pessoal nem username digitado
  // — exige só nome, senha, status e expiraEmMinutos.
  const camposObrigatorios: (keyof UsuarioInsert)[] = tipoUsuario === 'visitante'
    ? ['nome_completo', 'senha', 'status']
    : ['nome_completo', 'username', 'senha', 'cpf_cnpj', 'data_nascimento', 'celular_whatsapp', 'email_pessoal', 'status']
  const faltando = camposObrigatorios.filter((campo) => !dados?.[campo] || String(dados[campo]).trim() === '')
  if (faltando.length > 0) {
    return res.status(400).json({ erro: `Campos obrigatórios faltando: ${faltando.join(', ')}` })
  }

  if (tipoUsuario === 'visitante' && (!dados.expiraEmMinutos || dados.expiraEmMinutos <= 0)) {
    return res.status(400).json({ erro: 'expiraEmMinutos é obrigatório e deve ser maior que zero para visitante.' })
  }

  // Senha digitada pelo Admin (não gerada mais pelo sistema — decisão
  // de 26/08/2026) — só um piso mínimo de sanidade, 6 caracteres
  if (!senhaValida(dados.senha)) {
    return res.status(400).json({ erro: 'A senha precisa ter pelo menos 6 caracteres.' })
  }

  // Passos 3 e 4 — validação de formato de e-mail pessoal e CPF/CNPJ
  // só se aplicam a usuário normal (visitante não tem esses campos)
  if (tipoUsuario === 'normal') {
    if (!emailValido(dados.email_pessoal!)) {
      return res.status(400).json({ erro: 'E-mail pessoal em formato inválido.' })
    }
    if (!validarCpfCnpj(dados.cpf_cnpj!)) {
      return res.status(400).json({ erro: 'CPF/CNPJ em formato inválido.' })
    }
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
