// ============================================================
// pages/api/logs/listar.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Log de Acesso (auditoria)
// Função: Rota de LEITURA paginada de logs_acesso, para a aba "Log
//         de Acesso" dentro de app/usuarios/page.tsx. Admin-only,
//         mesmo padrão de acesso do resto do Módulo Usuários.
// Conecta com: lib/logsService.ts (listarLogs), lib/usuariosService.ts
//              (ehAdmin), app/usuarios/page.tsx
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

import { listarLogs } from '@/lib/logsService'
import { ehAdmin } from '@/lib/usuariosService'

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

  if (!ehAdmin(user.id, user.email ?? '')) {
    return res.status(403).json({ erro: 'Acesso restrito ao Administrador.' })
  }

  try {
    const pagina = Math.max(1, Number(req.query.pagina) || 1)
    const tamanhoPagina = Math.min(200, Math.max(1, Number(req.query.tamanhoPagina) || 50))

    const resultado = await listarLogs(supabaseAdmin, pagina, tamanhoPagina)
    return res.status(200).json(resultado)
  } catch (err: unknown) {
    const mensagemErro = err instanceof Error ? err.message : String(err)
    console.error('[logs/listar] erro:', mensagemErro)
    return res.status(500).json({ erro: `Falha ao buscar logs: ${mensagemErro}` })
  }
}
