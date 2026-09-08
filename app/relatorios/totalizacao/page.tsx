// ============================================================
// app/relatorios/totalizacao/page.tsx
// ============================================================

'use client'

import { RelatorioPageShell } from '@/components/relatorios/RelatorioPageShell'
import TotalizacaoRelatorio from '@/components/relatorios/totalizacao/TotalizacaoRelatorio'

export default function TotalizacaoPage() {
  return (
    <RelatorioPageShell titulo="Relatório Totalização">
      <TotalizacaoRelatorio />
    </RelatorioPageShell>
  )
}
