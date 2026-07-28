// ============================================================
// app/relatorios/gastos-por-tipo-fornecedor/page.tsx
// ============================================================

'use client'

import { RelatorioPageShell } from '@/components/relatorios/RelatorioPageShell'
import GastosPorTipoFornecedorRelatorio from '@/components/relatorios/gastosPorTipoFornecedor/GastosPorTipoFornecedorRelatorio'

export default function GastosPorTipoFornecedorPage() {
  return (
    <RelatorioPageShell titulo="Gastos por tipo de fornecedor">
      <GastosPorTipoFornecedorRelatorio />
    </RelatorioPageShell>
  )
}
