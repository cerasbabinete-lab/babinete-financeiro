// ============================================================
// app/relatorios/totalizacao-despesas/page.tsx
// ============================================================

'use client'

import { RelatorioPageShell } from '@/components/relatorios/RelatorioPageShell'
import TotalizacaoDespesasRelatorio from '@/components/relatorios/totalizacaoDespesas/TotalizacaoDespesasRelatorio'

export default function TotalizacaoDespesasPage() {
  return (
    <RelatorioPageShell titulo="Relatório Totalização de Despesas">
      <TotalizacaoDespesasRelatorio />
    </RelatorioPageShell>
  )
}
