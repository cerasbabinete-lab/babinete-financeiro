// ============================================================
// app/relatorios/curva-abc/page.tsx
// ============================================================

'use client'

import { RelatorioPageShell } from '@/components/relatorios/RelatorioPageShell'
import CurvaAbcRelatorio from '@/components/relatorios/curvaAbc/CurvaAbcRelatorio'

export default function CurvaAbcPage() {
  return (
    <RelatorioPageShell titulo="Curva ABC">
      <CurvaAbcRelatorio />
    </RelatorioPageShell>
  )
}
