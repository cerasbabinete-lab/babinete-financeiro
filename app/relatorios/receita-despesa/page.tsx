// ============================================================
// app/relatorios/receita-despesa/page.tsx
// ============================================================

'use client'

import { RelatorioPageShell } from '@/components/relatorios/RelatorioPageShell'
import ReceitaDespesaRelatorio from '@/components/relatorios/receitaDespesa/ReceitaDespesaRelatorio'

export default function ReceitaDespesaPage() {
  return (
    <RelatorioPageShell titulo="Receita x Despesa (Bruta e Líquida) por período">
      <ReceitaDespesaRelatorio />
    </RelatorioPageShell>
  )
}
