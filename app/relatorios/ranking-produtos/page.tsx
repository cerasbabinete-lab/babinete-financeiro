// ============================================================
// app/relatorios/ranking-produtos/page.tsx
// ============================================================

'use client'

import { RelatorioPageShell } from '@/components/relatorios/RelatorioPageShell'
import RankingProdutosRelatorio from '@/components/relatorios/rankingProdutos/RankingProdutosRelatorio'

export default function RankingProdutosPage() {
  return (
    <RelatorioPageShell titulo="Relatório Ranking de Produtos">
      <RankingProdutosRelatorio />
    </RelatorioPageShell>
  )
}
