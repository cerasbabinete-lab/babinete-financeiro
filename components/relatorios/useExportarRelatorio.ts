// ============================================================
// components/relatorios/useExportarRelatorio.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Hook compartilhado de exportação PDF/Excel — fetch
//         autenticado (Bearer token da sessão atual) + blob +
//         download/abertura no browser. Mesma lógica que estava
//         inline em FaturamentoRelatorio.tsx (Fase 2), extraída
//         aqui pros relatórios seguintes (Fases 3+) reaproveitarem
//         sem duplicar.
// Conecta com: pages/api/relatorios/*.ts (qualquer rota de
//              exportação), usado por todos os componentes de
//              relatório a partir da Fase 3
// ============================================================

'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export type FormatoExportUi = 'pdf' | 'xlsx'

export function useExportarRelatorio(endpoint: string) {
  const [exportando, setExportando] = useState<FormatoExportUi | null>(null)
  const [erroExportacao, setErroExportacao] = useState('')

  async function exportar(formato: FormatoExportUi, params: Record<string, string>, nomeArquivo: string) {
    setExportando(formato)
    setErroExportacao('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Sessão expirada — faça login novamente.')

      const query = new URLSearchParams({ ...params, formato })
      const res = await fetch(`${endpoint}?${query.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        const corpo = await res.json().catch(() => ({}))
        throw new Error(corpo.erro ?? 'Erro ao exportar relatório')
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)

      // Correção Medium §4.1 original (Handoff_Modulo_Relatorios_Audit_
      // para_QA.md) — window.open() chamado depois de 2 awaits
      // (getSession + fetch) pode ser tratado pelo navegador como
      // pop-up não solicitado e bloqueado silenciosamente. Fix: link-
      // âncora criado e clicado via JS, que os navegadores tratam
      // como navegação disparada por gesto do usuário, não pop-up —
      // essa técnica (não a escolha de target vs download) é o que
      // evita o bloqueio.
      // AJUSTE pós-entrega (revisão do Maycon, relatório 2.7) — antes,
      // o PDF usava target='_blank' (abria em nova aba) e só o Excel
      // usava download (baixava direto). Maycon pediu que o PDF
      // também baixe direto, como o Excel — os dois formatos agora
      // usam o mesmo caminho (a.download), sem diferença de
      // comportamento entre eles. Afeta os 7 relatórios do módulo
      // (hook compartilhado), não só este.
      const extensao = formato === 'pdf' ? 'pdf' : 'xlsx'
      const a = document.createElement('a')
      a.href = url
      a.download = `${nomeArquivo}.${extensao}`
      document.body.appendChild(a)
      a.click()
      a.remove()

      setTimeout(() => URL.revokeObjectURL(url), 10000)
    } catch (err: unknown) {
      setErroExportacao(err instanceof Error ? err.message : 'Erro ao exportar relatório')
    } finally {
      setExportando(null)
    }
  }

  return { exportar, exportando, erroExportacao, limparErroExportacao: () => setErroExportacao('') }
}
