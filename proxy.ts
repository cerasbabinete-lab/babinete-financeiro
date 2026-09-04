// ============================================================
// proxy.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Função: Proxy global do Next.js (App Router + Pages Router
//         hybrid) — intercepta toda requisição de API ANTES dela
//         chegar em qualquer rota. Único uso hoje: bloquear ações
//         de escrita (POST/PUT/PATCH/DELETE) para qualquer usuário
//         com tipo_usuario='visitante', em qualquer módulo, sem
//         precisar tocar no código de nenhuma rota individual
//         (Clientes, Fornecedores, Despesas, etc. continuam 100%
//         intocados).
//         Módulo Usuários não precisa de tratamento aqui — já é
//         Admin-only via ehAdmin(), o Visitante nunca teria acesso
//         de qualquer forma, nem para leitura.
//         Checagem só roda em métodos de escrita (não em GET) por
//         performance — expirar o acesso do Visitante em si é
//         garantido por outros dois pontos: app/login/page.tsx
//         (barra login novo já expirado) e components/layout/
//         Topbar.tsx (força logout ao zerar o contador). Fazer essa
//         mesma consulta em TODO GET do sistema, pra todo mundo,
//         só pra cobrir a janela entre expirar e o timer do cliente
//         disparar, não vale o custo de performance — mesmo padrão
//         de "melhor esforço" já aceito por Maycon para o caso de
//         fechar a aba sem logout explícito.
// Conecta com: todas as rotas em pages/api/**/*.ts
// ============================================================

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Rotas isentas do bloqueio mesmo sendo método de escrita — são
// registro de auditoria (login/logout), não ação de negócio, e o
// próprio Visitante precisa poder registrar o próprio login/logout
// no Log de Acesso.
const ROTAS_ISENTAS = ['/api/logs/registrar-login', '/api/logs/registrar-logout']

const METODOS_ESCRITA = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl

  if (!METODOS_ESCRITA.has(request.method)) return NextResponse.next()
  if (ROTAS_ISENTAS.some(rota => pathname.startsWith(rota))) return NextResponse.next()

  const token = (request.headers.get('authorization') ?? '').replace('Bearer ', '').trim()
  if (!token) return NextResponse.next() // sem token — a rota real vai rejeitar por conta própria

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return NextResponse.next()

  try {
    // Passo 1 — valida o token via REST da Supabase Auth (evita
    // carregar o SDK completo do @supabase/supabase-js aqui, já que
    // só precisamos do user.id)
    const respostaAuth = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    })
    if (!respostaAuth.ok) return NextResponse.next() // token inválido — a rota real vai rejeitar

    const user = await respostaAuth.json()
    if (!user?.id) return NextResponse.next()

    // Passo 2 — consulta tipo_usuario via PostgREST direto, com a
    // service role key (bypassa RLS, mesmo padrão usado em todas as
    // rotas de API do projeto)
    const respostaUsuario = await fetch(
      `${supabaseUrl}/rest/v1/usuarios?auth_user_id=eq.${user.id}&deleted_at=is.null&select=tipo_usuario`,
      { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
    )
    if (!respostaUsuario.ok) return NextResponse.next()

    const linhas = await respostaUsuario.json()
    if (linhas?.[0]?.tipo_usuario === 'visitante') {
      return NextResponse.json(
        { erro: 'Acesso de Visitante — somente visualização. Nenhuma ação de escrita é permitida.' },
        { status: 403 },
      )
    }
  } catch (err: unknown) {
    // Falha na validação (rede, timeout) — deixa passar; a rota real
    // já faz sua própria checagem de autenticação de qualquer forma,
    // então isto nunca é o único ponto de segurança
    console.error('[proxy] erro ao validar tipo_usuario:', err instanceof Error ? err.message : err)
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}
