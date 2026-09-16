// ============================================================
// pages/api/notificacoes/configuracao.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Usuários (aba Notificações)
// Função: GET lê e PUT atualiza a lista de destinatários do aviso
//         diário de despesas (tabela notificacoes_configuracao,
//         linha única id=1). Admin-only — mesmo padrão de
//         autenticação e checagem já usado em
//         pages/api/usuarios/atualizar-permissoes.ts (getUser()
//         com Bearer token + ehAdmin()).
// Conecta com: lib/usuariosService.ts (ehAdmin),
//              components/usuarios/NotificacoesConfiguracao.tsx,
//              sql/notificacoes_configuracao.sql
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

import { ehAdmin } from '@/lib/usuariosService'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// Validação simples de formato de e-mail — mesmo nível de rigor
// usado em outras partes do projeto (não tenta ser um validador
// RFC 5322 completo, só pega erros óbvios de digitação).
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'PUT') {
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

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('notificacoes_configuracao')
      .select('destinatarios_aviso_diario_despesas')
      .eq('id', 1)
      .maybeSingle()

    if (error) {
      console.error('[notificacoes/configuracao][GET] erro:', error.message)
      return res.status(500).json({ erro: `Falha ao buscar configuração: ${error.message}` })
    }

    return res.status(200).json({
      destinatariosAvisoDiarioDespesas: data?.destinatarios_aviso_diario_despesas ?? ['contato@cerasbabinete.com.br'],
    })
  }

  // PUT
  const { destinatariosAvisoDiarioDespesas } = req.body as { destinatariosAvisoDiarioDespesas?: string[] }

  if (!Array.isArray(destinatariosAvisoDiarioDespesas) || destinatariosAvisoDiarioDespesas.length === 0) {
    return res.status(400).json({ erro: 'Informe ao menos um e-mail destinatário.' })
  }

  const listaLimpa = destinatariosAvisoDiarioDespesas.map(e => e.trim()).filter(Boolean)
  const emailInvalido = listaLimpa.find(e => !EMAIL_REGEX.test(e))
  if (emailInvalido) {
    return res.status(400).json({ erro: `E-mail inválido: "${emailInvalido}"` })
  }

  try {
    const { error } = await supabaseAdmin
      .from('notificacoes_configuracao')
      .update({
        destinatarios_aviso_diario_despesas: listaLimpa,
        atualizado_em: new Date().toISOString(),
        atualizado_por_usuario_id: null, // usuarios.id (UUID interno) != auth user id — não temos esse mapeamento aqui sem consulta extra; deixar null é aceitável, o campo é só informativo
      })
      .eq('id', 1)

    if (error) throw error

    return res.status(200).json({ sucesso: true })
  } catch (err: unknown) {
    const mensagemErro = err instanceof Error ? err.message : String(err)
    console.error('[notificacoes/configuracao][PUT] erro:', mensagemErro)
    return res.status(500).json({ erro: `Falha ao salvar configuração: ${mensagemErro}` })
  }
}
