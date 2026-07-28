// ============================================================
// app/relatorios/retiradas/page.tsx
// ============================================================

'use client'

import { RelatorioPageShell } from '@/components/relatorios/RelatorioPageShell'
import RetiradasRelatorio from '@/components/relatorios/retiradas/RetiradasRelatorio'

export default function RetiradasPage() {
  return (
    <RelatorioPageShell titulo="Retiradas e benefícios por beneficiário">
      <RetiradasRelatorio />
    </RelatorioPageShell>
  )
}
