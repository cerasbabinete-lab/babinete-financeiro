// ============================================================
// components/relatorios/RelatoriosGradeCards.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Tela inicial do módulo — grade de 6 cards, um por
//         relatório, cada um com ícone, título, descrição curta e
//         botão "Gerar relatório" (Seção 5). IMPORTANTE (Seção 1.4):
//         a descrição do card de Retiradas NÃO cita nomes de sócios/
//         beneficiários — é texto estático, visível a qualquer
//         usuário autenticado antes mesmo de gerar o relatório. Essa
//         restrição vale só para este texto — o relatório em si
//         (Fase 4) mostra nomes normalmente.
// Conecta com: types/relatorios.ts (RelatorioSlug, RelatorioCardInfo),
//              app/relatorios/page.tsx (renderiza este componente),
//              rotas app/relatorios/[slug]/page.tsx (destino de cada card)
// Referência: Especificacao_Modulo_Relatorios.md, Seção 5 e 1.4
// ============================================================

'use client'

import { useRouter } from 'next/navigation'
import type { RelatorioCardInfo } from '@/types/relatorios'

// ============================================================
// CARDS — conteúdo estático dos 6 relatórios da v1. A ordem aqui
// é a ordem de exibição na grade, mesma ordem da Seção 2 da spec
// ============================================================
const CARDS: RelatorioCardInfo[] = [
  {
    slug: 'faturamento',
    titulo: 'Faturamento por período',
    descricaoCurta: 'Receita bruta, ticket médio e clientes novos x recorrentes, mês a mês.',
    icone: 'chart-line',
  },
  {
    slug: 'fluxo-caixa',
    titulo: 'Fluxo de caixa realizado',
    descricaoCurta: 'Entradas e saídas efetivamente baixadas no período, em regime de caixa.',
    icone: 'cash',
  },
  {
    slug: 'retiradas',
    // Seção 1.4 — texto estático, sem nomes de sócios/beneficiários
    titulo: 'Retiradas e benefícios por beneficiário',
    descricaoCurta: 'Visão discriminada de retiradas e benefícios pessoais registrados no sistema.',
    icone: 'wallet',
  },
  {
    slug: 'extrato-consolidado',
    titulo: 'Extrato consolidado',
    descricaoCurta: 'Títulos a pagar e a receber, com filtro de status e faixas de vencimento (aging).',
    icone: 'file-invoice',
  },
  {
    slug: 'curva-abc',
    titulo: 'Curva ABC',
    descricaoCurta: 'Classificação de clientes, fornecedores ou produtos pelo princípio de Pareto.',
    icone: 'chart-pie',
  },
  {
    slug: 'gastos-por-tipo-fornecedor',
    titulo: 'Gastos por tipo de fornecedor',
    descricaoCurta: 'Total de gastos agrupado por classificação de fornecedor (matéria-prima, embalagem, serviços etc.).',
    icone: 'category',
  },
]

// ============================================================
// RelatoriosGradeCards
// ============================================================
export default function RelatoriosGradeCards() {
  const router = useRouter()

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: '16px',
        fontFamily: 'Tahoma, Geneva, sans-serif',
      }}
    >
      {CARDS.map(card => (
        <div
          key={card.slug}
          style={{
            display: 'flex',
            flexDirection: 'column',
            background: '#ffffff',
            border: '1px solid #dde8f0',
            borderRadius: '10px',
            padding: '18px',
          }}
        >
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              background: '#eaf2f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '12px',
            }}
          >
            <i className={`ti ti-${card.icone}`} style={{ fontSize: '20px', color: '#1a6094' }} aria-hidden="true" />
          </div>

          <div style={{ fontSize: '13px', fontWeight: 700, color: '#1a6094', marginBottom: '6px' }}>
            {card.titulo}
          </div>

          <div style={{ fontSize: '11px', color: '#5a84a6', lineHeight: 1.5, flex: 1, marginBottom: '14px' }}>
            {card.descricaoCurta}
          </div>

          <button
            onClick={() => router.push(`/relatorios/${card.slug}`)}
            style={{
              alignSelf: 'flex-start',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: '#1a6094',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '7px 14px',
              fontSize: '11px',
              fontFamily: 'Tahoma, Geneva, sans-serif',
              cursor: 'pointer',
            }}
          >
            Gerar relatório
            <i className="ti ti-arrow-right" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  )
}
