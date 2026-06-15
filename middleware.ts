// ============================================================
// middleware.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Função: Proteção global de rotas — verifica autenticação
//         Supabase antes de qualquer página carregar
//         Rotas públicas: /login e /encerrado
//         Todas as demais rotas exigem sessão ativa
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Rotas que não precisam de login
const ROTAS_PUBLICAS = ['/login', '/encerrado']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Se for rota pública, deixa passar sem verificar
  if (ROTAS_PUBLICAS.some(rota => pathname.startsWith(rota))) {
    return NextResponse.next()
  }

  // Verifica cookie de sessão do Supabase
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const supabase = createClient(supabaseUrl, supabaseKey)

  const { data: { session } } = await supabase.auth.getSession()

  // Sem sessão: redireciona para login
  if (!session) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  // Com sessão: deixa passar
  return NextResponse.next()
}

// Aplica o middleware a todas as rotas exceto arquivos estáticos
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|img/).*)'],
}
