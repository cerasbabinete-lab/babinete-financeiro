// ============================================================
// pages/api/usuarios/listar.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Usuários
// Função: Rota de LEITURA — necessária porque usuarios/
//         usuarios_permissoes têm RLS bloqueando o client anon por
//         completo (sql/usuarios.sql), diferente de todo o resto do
//         projeto, que lê direto via client anon do browser
//         (Especificação §2.4, decisão documentada nesta sessão).
//         Cobre DOIS casos, escolhidos pela presença ou não de
//         ?id= na query string:
//           - Sem id: lista todos os usuários ativos (tela Lista de
//             Usuários)
//           - Com id: retorna um usuário específico + suas 50 linhas
//             de permissões (tela Cadastro/Edição, ambas as abas) —
//             a Especificação não previa uma rota separada pra isso,
//             mas o mesmo motivo (RLS bloqueando leitura) se aplica,
//             então foi resolvido aqui em vez de criar uma sétima rota
// Conecta com: lib/usuariosService.ts (listarUsuariosAtivos,
//              buscarUsuarioComPermissoes, ehAdmin),
//              app/usuarios/page.tsx, components/usuarios/*.tsx
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

import { listarUsuariosAtivos, buscarUsuarioComPermissoes, ehAdmin } from '@/lib/usuariosService'

// Mesmo padrão de todas as rotas de API do projeto (ex:
// pages/api/despesas/atualizar.ts) — client admin instanciado
// localmente dentro do handler, nunca compartilhado como singleton
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

  // Autenticação — Bearer token obrigatório, validado via getUser()
  // (nunca getSession()), mesmo padrão de todo o projeto
  const token = (req.headers.authorization ?? '').replace('Bearer ', '').trim() || null
  if (!token) return res.status(401).json({ erro: 'Não autorizado' })

  const supabaseAdmin = getSupabaseAdmin()
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ erro: 'Não autorizado' })

  // Autorização — módulo inteiro é Admin-only (Especificação §2.3),
  // independente do que a matriz de permissões do usuário diga.
  // user.email aqui já é o e-mail usado para autenticar
  // (email_tecnico para usuários criados pela fórmula padrão; para
  // o Admin temporário atual, é o e-mail real cerasbabinete@gmail.com
  // — ver assimetria documentada em app/login/page.tsx e
  // lib/authUsername.ts). De qualquer forma, não precisa de consulta
  // extra à tabela usuarios, pois ehAdmin() compara diretamente
  // contra as variáveis de ambiente.
  if (!ehAdmin(user.id, user.email ?? '')) {
    return res.status(403).json({ erro: 'Acesso restrito ao Administrador.' })
  }

  try {
    const { id } = req.query

    if (typeof id === 'string' && id.length > 0) {
      // Caso 2 — usuário específico + permissões (tela de edição)
      const resultado = await buscarUsuarioComPermissoes(id, supabaseAdmin)
      if (!resultado) {
        return res.status(404).json({ erro: 'Usuário não encontrado.' })
      }
      return res.status(200).json(resultado)
    }

    // Caso 1 — lista completa de usuários ativos (tela principal)
    const usuarios = await listarUsuariosAtivos(supabaseAdmin)
    return res.status(200).json({ usuarios })
  } catch (err: unknown) {
    const mensagemErro = err instanceof Error ? err.message : String(err)
    console.error('[listar] erro:', mensagemErro)
    return res.status(500).json({ erro: `Falha ao buscar usuários: ${mensagemErro}` })
  }
}
