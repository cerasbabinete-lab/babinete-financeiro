// ============================================================
// app/relatorios/fluxo-caixa/page.tsx
// ============================================================

'use client'

import { RelatorioPageShell } from '@/components/relatorios/RelatorioPageShell'
import FluxoCaixaRelatorio from '@/components/relatorios/fluxoCaixa/FluxoCaixaRelatorio'

export default function FluxoCaixaPage() {
  return (
    <RelatorioPageShell titulo="Fluxo de caixa realizado">
      <FluxoCaixaRelatorio />
    </RelatorioPageShell>
  )
}
