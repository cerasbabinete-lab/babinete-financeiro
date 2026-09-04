// ============================================================
// lib/useVisitanteCountdown.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Usuários — Usuário Visitante
// Função: Hook compartilhado entre Topbar.tsx (desktop) e
//         TopbarMobile.tsx — evita duplicar a mesma lógica de busca
//         + contagem regressiva nos dois lugares. Consulta
//         status-visitante.ts uma vez ao montar; se o usuário logado
//         for Visitante, conta os segundos localmente a partir do
//         expira_em real do servidor, e força logout ao chegar a
//         zero (mesma ação de handleSair — signOut + log + redirect).
//         Retorna null para qualquer usuário que não seja Visitante
//         (Topbar/TopbarMobile simplesmente não mostram o badge).
// Conecta com: pages/api/usuarios/status-visitante.ts,
//              lib/logsClient.ts (registrarLogoutClient)
// ============================================================

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { registrarLogoutClient } from '@/lib/logsClient'

export function useVisitanteCountdown(): number | null {
  const router = useRouter()
  const [segundosRestantes, setSegundosRestantes] = useState<number | null>(null)

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined
    let cancelado = false

    async function iniciar() {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return

      try {
        const res = await fetch('/api/usuarios/status-visitante', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok || cancelado) return

        const status = await res.json()
        if (status.tipoUsuario !== 'visitante' || !status.expiraEm) return

        const expiraEmMs = new Date(status.expiraEm).getTime()

        function atualizar() {
          const restante = Math.max(0, Math.floor((expiraEmMs - Date.now()) / 1000))
          if (cancelado) return
          setSegundosRestantes(restante)

          if (restante <= 0) {
            if (intervalId) clearInterval(intervalId)
            // Prazo esgotado — força logout, mesma ação de "Sair"
            void (async () => {
              await registrarLogoutClient()
              await supabase.auth.signOut()
              router.push('/login')
            })()
          }
        }

        atualizar()
        intervalId = setInterval(atualizar, 1000)
      } catch {
        // Falha ao checar status (rede) — não quebra a tela, só não
        // mostra o contador; proxy.ts continua bloqueando escrita
        // de qualquer forma
      }
    }

    iniciar()
    return () => {
      cancelado = true
      if (intervalId) clearInterval(intervalId)
    }
  }, [router])

  return segundosRestantes
}

// ============================================================
// formatarContagem()
// Formata segundos como HH:MM:SS, sempre com as 3 unidades — mais
// fácil de ler num badge pequeno do que "3600s" ou variar formato
// ============================================================
export function formatarContagem(segundosTotais: number): string {
  const horas = Math.floor(segundosTotais / 3600)
  const minutos = Math.floor((segundosTotais % 3600) / 60)
  const segundos = segundosTotais % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(horas)}:${pad(minutos)}:${pad(segundos)}`
}
