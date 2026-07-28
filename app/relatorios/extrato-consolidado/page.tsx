// ============================================================
// app/relatorios/extrato-consolidado/page.tsx
// ============================================================

'use client'

import { RelatorioPageShell } from '@/components/relatorios/RelatorioPageShell'
import ExtratoConsolidadoRelatorio from '@/components/relatorios/extratoConsolidado/ExtratoConsolidadoRelatorio'

export default function ExtratoConsolidadoPage() {
  return (
    <RelatorioPageShell titulo="Extrato consolidado">
      <ExtratoConsolidadoRelatorio />
    </RelatorioPageShell>
  )
}
