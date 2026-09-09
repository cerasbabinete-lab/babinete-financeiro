// ============================================================
// components/relatorios/rankingProdutos/RankingProdutosRelatorio.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Tela do relatório "Ranking de Produtos" (2.10) — junta
//         as 2 seções independentes (RankingGeralSecao,
//         DrillDownProdutoSecao). Este componente não tem estado
//         próprio nem passa dado entre as seções — são telas
//         irmãs, cada uma com seu ciclo de vida (decisão explícita
//         de Maycon, repetida em 3 perguntas da sessão de
//         brainstorm)
// Referência: mockup aprovado por Maycon (Artifact publicado na
//             conversa)
// ============================================================

'use client'

import RankingGeralSecao from '@/components/relatorios/rankingProdutos/RankingGeralSecao'
import DrillDownProdutoSecao from '@/components/relatorios/rankingProdutos/DrillDownProdutoSecao'
import DisclaimerRodape from '@/components/relatorios/DisclaimerRodape'

export default function RankingProdutosRelatorio() {
  return (
    <div style={{ fontFamily: 'Tahoma, Geneva, sans-serif' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: '#2c4a60', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        Ranking geral
        <span style={{ fontSize: '9px', fontWeight: 400, color: '#5a84a6', background: '#eaf2f9', padding: '2px 7px', borderRadius: '10px' }}>período próprio</span>
      </div>
      <RankingGeralSecao />

      <hr style={{ border: 'none', borderTop: '1px solid #dde8f0', margin: '24px 0' }} />

      <div style={{ fontSize: '13px', fontWeight: 700, color: '#2c4a60', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        Quem comprou este produto
        <span style={{ fontSize: '9px', fontWeight: 400, color: '#5a84a6', background: '#eaf2f9', padding: '2px 7px', borderRadius: '10px' }}>busca e período próprios</span>
      </div>
      <DrillDownProdutoSecao />

      <DisclaimerRodape />
    </div>
  )
}
