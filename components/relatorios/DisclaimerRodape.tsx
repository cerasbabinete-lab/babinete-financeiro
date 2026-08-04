// ============================================================
// components/relatorios/DisclaimerRodape.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: NO-OP a partir desta sessão. O disclaimer fixo que este
//         componente exibia (DISCLAIMER_RELATORIOS, Seção 1.1 da
//         spec) foi removido a pedido do Maycon em todo o sistema —
//         ver nota em types/relatorios.ts. O componente foi mantido
//         (renderizando null) em vez de removido dos 7 componentes
//         de tela que o importam (Faturamento, Fluxo de Caixa,
//         Retiradas, Extrato Consolidado, Curva ABC, Gastos por
//         Tipo de Fornecedor, Receita x Despesa), pra minimizar o
//         raio de alteração — reverter é só devolver o JSX aqui.
// ============================================================

'use client'

export default function DisclaimerRodape() {
  return null
}
