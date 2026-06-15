// ============================================================
// proxy.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Função: Proxy de rotas — por ora apenas deixa passar
//         A autenticação é verificada individualmente em cada
//         page.tsx via supabase.auth.getUser()
// Nota: A verificação de sessão via cookie no proxy causava
//       conflito de timing com o Supabase Auth no login —
//       a sessão ainda não estava gravada quando o proxy
//       interceptava o redirect para /clientes
// ============================================================

import { NextRequest, NextResponse } from 'next/server'

export async function proxy(request: NextRequest) {
  // Deixa todas as rotas passarem — auth verificada em cada página
  return NextResponse.next()
}

// Aplica apenas a rotas de página (exclui assets estáticos)
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|img/).*)'],
}
