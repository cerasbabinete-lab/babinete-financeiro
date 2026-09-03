// ============================================================
// components/dashboard/CardDespesas.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Dashboard (NOVO)
// Função: Card Vermelho — Despesas (Especificacao_Modulo_Dashboard.md,
//         Seção 3). REESCRITO nesta sessão pra seguir fielmente o
//         mockup aprovado (mockup_dashboard.html) — inclui o ícone de
//         caminhão (SVG inline, path idêntico ao do mockup) e o
//         badge bege (#f7f3e9) na Linha 3, em vez do cinza que eu
//         tinha usado na primeira versão sem acesso ao mockup.
//         Componente "burro" — só recebe os dados já calculados
//         (pages/api/dashboard/resumo.ts) e formata/exibe.
// Conecta com: types/dashboard.ts (DashboardCardDespesas),
//              lib/contasAPagarService.ts (formatarMoeda),
//              app/dashboard/page.tsx (renderiza este componente)
// Referência: Especificacao_Modulo_Dashboard.md, Seção 3;
//             mockup_dashboard.html (fonte visual desta revisão)
// ============================================================

import { formatarMoeda } from '@/lib/contasAPagarService'
import type { DashboardCardDespesas } from '@/types/dashboard'

// Cores exatas do mockup aprovado — substituem os tokens do banco de
// código (#d32f2f) usados na primeira versão deste arquivo
const COR_VERMELHO_ACENTO = '#c0392b' // borda esquerda + cabeçalho
const COR_VERMELHO_ESCURO = '#4a1f1a' // valor da Linha 1 (grande)
const COR_TEXTO_LABEL = '#5c7484'
const COR_TEXTO_VALOR = '#233240'
const COR_BORDA_CARD = '#d7e0e6'
const COR_BORDA_INTERNA = '#eef2f4'
const COR_FRETE_FUNDO = '#f7f3e9' // bege — badge da Linha 3, distinto do resto do card
const COR_FRETE_TEXTO = '#8a7233' // dourado/marrom — texto e ícone do badge de frete

// ============================================================
// mesReferenciaAtual() — mesma função de CardReceitas.tsx,
// duplicada aqui pelo mesmo motivo dos helpers de data dos endpoints
// (cada componente/arquivo declara o que precisa localmente, sem
// arquivo compartilhado novo fora da lista da Seção 10)
// ============================================================
function mesReferenciaAtual(): string {
  const MESES = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ]
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' })
  const [ano, mes] = fmt.format(new Date()).split('-')
  return `${MESES[Number(mes) - 1]}/${ano}`
}

interface CardDespesasProps {
  // null enquanto pages/api/dashboard/resumo.ts ainda não respondeu
  dados: DashboardCardDespesas | null
}

export default function CardDespesas({ dados }: CardDespesasProps) {
  return (
    <div
      style={{
        fontFamily: 'Tahoma, Geneva, Verdana, sans-serif',
        background: '#ffffff',
        border: `1px solid ${COR_BORDA_CARD}`,
        borderLeft: `4px solid ${COR_VERMELHO_ACENTO}`,
        borderRadius: '8px',
        padding: '16px 18px',
      }}
    >
      <div
        style={{
          fontSize: '12px',
          fontWeight: 'bold',
          color: COR_VERMELHO_ACENTO,
          textTransform: 'uppercase',
          letterSpacing: '0.4px',
          marginBottom: '10px',
        }}
      >
        Despesas — {mesReferenciaAtual()}
      </div>

      {/* Linha 1 (fonte maior) — total lançado no mês, qualquer
          status (Seção 3 — sem filtro de status, diferente da Linha
          1 do Card Verde) */}
      <div style={{ marginBottom: '10px' }}>
        <div style={{ fontSize: '12px', color: COR_TEXTO_LABEL }}>Lançado no mês</div>
        <div style={{ fontSize: '27px', fontWeight: 'bold', color: COR_VERMELHO_ESCURO }}>
          {dados ? formatarMoeda(dados.totalLancadoMes) : '—'}
        </div>
      </div>

      {/* Linha 2 — já pago até hoje. Sozinha nesta linha (diferente
          do Card Verde, que tem 2 colunas aqui) — o mockup não
          coloca nada ao lado dela, a Linha 3 vem embaixo como badge
          separado, não como segunda coluna */}
      <div
        style={{
          borderTop: `1px solid ${COR_BORDA_INTERNA}`,
          paddingTop: '8px',
          marginBottom: '8px',
        }}
      >
        <div style={{ fontSize: '11px', color: COR_TEXTO_LABEL }}>Pago até hoje</div>
        <div style={{ fontSize: '16px', fontWeight: 'bold', color: COR_TEXTO_VALOR }}>
          {dados ? formatarMoeda(dados.totalPagoAteHoje) : '—'}
        </div>
      </div>

      {/* Linha 3 — fretes, PURAMENTE INFORMATIVA (regra travada:
          nunca somada em nenhum total do card). MUDANÇA DESTA SESSÃO:
          badge bege com ícone de caminhão, agora com 2 colunas
          internas (Opção B do mockup de revisão, confirmada) — total
          do mês à esquerda, pago até hoje à direita */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: COR_FRETE_FUNDO,
          borderRadius: '5px',
          padding: '8px 12px',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={COR_FRETE_TEXTO} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0 }}>
          <rect x="1" y="7" width="14" height="9" rx="1" />
          <path d="M15 10h4l3 3v3h-7z" />
          <circle cx="6" cy="18" r="1.6" />
          <circle cx="18.5" cy="18" r="1.6" />
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', flex: 1, gap: '10px' }}>
          <div>
            <div style={{ fontSize: '10px', color: COR_FRETE_TEXTO }}>Frete no mês</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold', color: COR_FRETE_TEXTO }}>
              {dados ? formatarMoeda(dados.valorFreteNoMes) : '—'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '10px', color: COR_FRETE_TEXTO }}>Frete pago no mês</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold', color: COR_FRETE_TEXTO }}>
              {dados ? formatarMoeda(dados.valorFretePagoMes) : '—'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
