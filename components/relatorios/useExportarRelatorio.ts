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

      // Correção Medium §4.1 (Handoff_Modulo_Relatorios_Audit_para_QA.md)
      // — window.open() chamado depois de 2 awaits (getSession +
      // fetch) pode ser tratado pelo navegador como pop-up não
      // solicitado e bloqueado silenciosamente: o clique acontece,
      // o request funciona, mas nada abre e nenhum erro aparece pro
      // usuário. Fix: mesmo padrão de link-âncora já usado no branch
      // xlsx abaixo, que é tolerante a isso — só troca download por
      // target='_blank' pra abrir em nova aba em vez de baixar.
      const a = document.createElement('a')
      a.href = url
      if (formato === 'pdf') {
        a.target = '_blank'
        a.rel = 'noopener'
      } else {
        a.download = `${nomeArquivo}.xlsx`
      }
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
