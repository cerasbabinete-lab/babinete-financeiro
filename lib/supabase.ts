// ============================================================
// lib/supabase.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Clientes
// Função: Cliente Supabase singleton para uso em todo o app
// Conecta com: todas as queries do módulo via clientesService.ts
// ============================================================

import { createClient } from '@supabase/supabase-js'

// Variáveis de ambiente definidas em .env.local
// NEXT_PUBLIC_ = acessível no browser (client-side)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Cria e exporta o cliente Supabase singleton
// Reutilizado em todo o app — não instanciar novamente em outros arquivos
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// supabaseAdmin removido deste arquivo — a SUPABASE_SERVICE_ROLE_KEY
// não pode ser exposta no browser (client components).
// Operações admin (backup completo, restore) são feitas via API Routes
// server-side em app/api/ — nunca diretamente no browser.
