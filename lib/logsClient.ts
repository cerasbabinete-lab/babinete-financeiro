// ============================================================
// lib/logsClient.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Log de Acesso (auditoria)
// Função: Helper client-side único para registrar o evento de
//         logout — chamado nos 4 pontos de saída (Trocar/Sair em
//         Topbar.tsx e Drawer.tsx) ANTES do supabase.auth.signOut(),
//         porque depois do signOut() o token já não é mais válido
//         para a rota autenticada registrar-logout.ts verificar.
//         getSession() aqui é só para pegar o access_token e anexar
//         como Bearer — não é usado para nenhuma decisão de
//         autorização (essa validação real acontece no servidor via
//         getUser(token), mesmo padrão de app/usuarios/page.tsx
//         obterToken()).
// Conecta com: pages/api/logs/registrar-logout.ts,
//              components/layout/Topbar.tsx, components/layout/Drawer.tsx
// ============================================================

import { supabase } from '@/lib/supabase'

export async function registrarLogoutClient(): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return

    await fetch('/api/logs/registrar-logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      keepalive: true,
    })
  } catch {
    // Auditoria complementar — uma falha aqui nunca deve impedir o logout real
  }
}
