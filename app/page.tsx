// ============================================================
// app/page.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Função: Rota raiz '/' — ponto de entrada do sistema
//         Verifica autenticação Supabase server-side e redireciona:
//         - Autenticado  → /clientes (módulo principal)
//         - Não autenticado → /login
// Conecta com: app/login/page.tsx, app/clientes/page.tsx
// ============================================================

import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

// ============================================================
// Home (Server Component)
// Rota '/' nunca renderiza UI — apenas redireciona
// Centraliza a lógica de entrada do sistema neste arquivo
// ============================================================
export default async function Home() {

  // Cria cliente Supabase server-side usando variáveis de ambiente
  // NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY são
  // injetadas pelo runtime do Next.js (não expostas em bundle privado)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Verifica sessão ativa — getSession() é suficiente aqui
  // pois a validação real acontece no client (page.tsx de cada módulo)
  const { data: { session } } = await supabase.auth.getSession()

  if (session) {
    // Usuário autenticado → redireciona para o módulo principal
    redirect('/clientes')
  } else {
    // Sem sessão → redireciona para login
    redirect('/login')
  }
}
