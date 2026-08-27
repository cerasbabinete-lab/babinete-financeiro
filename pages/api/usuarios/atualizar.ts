// ============================================================
// pages/api/usuarios/atualizar.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Usuários
// Função: Rota de atualização dos campos da aba Dados de um
//         usuário existente — Especificação §5, Função 3. NÃO toca
//         em permissões (isso é atualizar-permissoes.ts). Se
//         username vier preenchido e diferente do atual, o service
//         recalcula email_tecnico e propaga a mudança para o
//         Supabase Auth (username editável — decisão confirmada
//         por Maycon em sessão de build).
// Conecta com: lib/usuariosService.ts (atualizarUsuario, emailValido,
//              usernameDisponivel, ehAdmin), types/usuarios.ts (UsuarioUpdate),
//              components/usuarios/UsuarioFormModal.tsx
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

import { atualizarUsuario, emailValido, ehAdmin } from '@/lib/usuariosService'
import { validarCpfCnpj } from '@/lib/validacoesUsuarios'
import type { UsuarioUpdate } from '@/types/usuarios'

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

  const dados = req.body as UsuarioUpdate
  if (!dados?.id) {
    return res.status(400).json({ erro: 'Corpo da requisição incompleto: id é obrigatório.' })
  }

  // Payload só com id, sem nenhum campo a atualizar — evita um
  // .update({}) sem efeito definido no Supabase (FIX-14, Handoff_
  // Modulo_Usuarios_Audit_para_QA.md)
  if (Object.keys(dados).filter((k) => k !== 'id').length === 0) {
    return res.status(400).json({ erro: 'Nenhum campo para atualizar foi enviado.' })
  }

  // Reaplica validação de formato de e-mail se email_pessoal veio no payload
  // (Especificação §5, Função 3, edge cases — "re-apply the same field validations")
  if (dados.email_pessoal !== undefined && !emailValido(dados.email_pessoal)) {
    return res.status(400).json({ erro: 'E-mail pessoal em formato inválido.' })
  }

  // Reaplica validação de formato de cpf_cnpj se veio no payload (FIX-15)
  if (dados.cpf_cnpj !== undefined && !validarCpfCnpj(dados.cpf_cnpj)) {
    return res.status(400).json({ erro: 'CPF/CNPJ em formato inválido.' })
  }

  // Checagem de campo vazio para os campos que vieram no payload
  // (não força todos os campos, já que esta rota aceita update parcial)
  const camposTexto: (keyof UsuarioUpdate)[] = [
    'nome_completo', 'username', 'cpf_cnpj', 'data_nascimento', 'celular_whatsapp',
  ]
  const campoVazio = camposTexto.find((campo) => dados[campo] !== undefined && String(dados[campo]).trim() === '')
  if (campoVazio) {
    return res.status(400).json({ erro: `O campo "${campoVazio}" não pode ficar vazio.` })
  }

  // Unicidade de username (se ele veio no payload) — checagem
  // adicional já feita dentro de atualizarUsuario(), mas delegada
  // ao service, que também cuida da propagação pro Auth se necessário
  try {
    const usuarioAtualizado = await atualizarUsuario(dados, supabaseAdmin)
    return res.status(200).json({ usuario: usuarioAtualizado })
  } catch (err: unknown) {
    const mensagemErro = err instanceof Error ? err.message : String(err)
    console.error('[atualizar] erro:', mensagemErro)
    return res.status(500).json({ erro: `Falha ao atualizar usuário: ${mensagemErro}` })
  }
}
