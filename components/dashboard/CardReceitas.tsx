// ============================================================
// components/dashboard/CardReceitas.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Dashboard
// Função: Card Verde — Receitas. REVISADO nesta sessão (Opção A do
//         mockup, confirmada com Maycon): vira grid 2×2 no desktop —
//         bruto/líquido em destaque na linha de cima, recebido/
//         repasse de frete menores embaixo — e empilha em 1 coluna
//         no mobile (ordem: bruto, líquido, recebido, repasse),
//         mesmos tamanhos de fonte de antes, sem redução. A linha
//         "Faturamento total (líquido de frete)" saiu do card
//         (Opção A). Recebe isMobile do pai (app/dashboard/page.tsx)
//         — mesmo padrão de prop já usado por outras telas do
//         projeto (ex: app/clientes/page.tsx), não decide sozinho via
//         CSS media query porque o container pai também precisa
//         saber pra decidir side-by-side vs empilhado entre os dois
//         cards (Receitas/Despesas)
// Conecta com: types/dashboard.ts (DashboardCardReceitas),
//              lib/contasAPagarService.ts (formatarMoeda),
//              app/dashboard/page.tsx (renderiza este componente,
//              passa isMobile)
// Referência: Especificacao_Modulo_Dashboard.md, Seção 2 (spec
//             original); mockup_dashboard.html (layout original);
//             revisão desta sessão (mockup publicado em chat, Opção A)
// ============================================================

import { formatarMoeda } from '@/lib/contasAPagarService'
import type { DashboardCardReceitas } from '@/types/dashboard'

// Cores exatas do mockup aprovado — substituem os tokens que eu
// tinha achado no código-fonte (#166534) na primeira versão deste
// arquivo. #2c9d5b é o próprio valor que a spec já sugeria como
// primeira opção (Seção 0/regra 6: "#2c9d5b or the closest existing
// token") — o mockup confirma que é esse mesmo, não o token do banco
const COR_VERDE_ACENTO = '#2c9d5b'   // borda esquerda + cabeçalho
const COR_VERDE_ESCURO = '#1a3c2b'   // valor da Linha 1 (grande) — tom mais escuro que o acento, exato do mockup
const COR_TEXTO_LABEL = '#5c7484'    // labels pequenos acima de cada valor
const COR_TEXTO_VALOR = '#233240'    // valores das linhas 2/3 (não é a mesma cor do título)
const COR_BORDA_CARD = '#d7e0e6'     // borda externa completa do card
const COR_BORDA_INTERNA = '#eef2f4'  // linha divisória entre linha 1 e linha 2/3

// ============================================================
// mesReferenciaAtual() — "agosto/2026", mesmo formato do mockup.
// Calculado no fuso de São Paulo (mesmo raciocínio dos helpers de
// data em pages/api/dashboard/*.ts) — é só um rótulo de exibição,
// mas mantém a mesma convenção de fuso do resto do módulo
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

interface CardReceitasProps {
  // null enquanto pages/api/dashboard/resumo.ts ainda não respondeu
  dados: DashboardCardReceitas | null
  // Controla grid 2×2 (desktop) vs empilhado 1 coluna (mobile) —
  // mesmo valor de isMobile já calculado em app/dashboard/page.tsx
  isMobile: boolean
}

export default function CardReceitas({ dados, isMobile }: CardReceitasProps) {
  return (
    <div
      style={{
        fontFamily: 'Tahoma, Geneva, Verdana, sans-serif',
        background: '#ffffff',
        border: `1px solid ${COR_BORDA_CARD}`,
        borderLeft: `4px solid ${COR_VERDE_ACENTO}`,
        borderRadius: '8px',
        padding: '16px 18px',
      }}
    >
      <div
        style={{
          fontSize: '12px',
          fontWeight: 'bold',
          color: COR_VERDE_ACENTO,
          textTransform: 'uppercase',
          letterSpacing: '0.4px',
          marginBottom: '10px',
        }}
      >
        Receitas — {mesReferenciaAtual()}
      </div>

      {isMobile ? (
        // ── Mobile — empilhado 1 coluna, ordem: bruto, líquido,
        // recebido, repasse. Mesmos tamanhos de fonte do desktop
        // (27px linhas grandes, 16px/11px linhas pequenas) — sem
        // redução, conforme confirmado com Maycon
        <>
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '12px', color: COR_TEXTO_LABEL }}>A receber no mês</div>
            <div style={{ fontSize: '27px', fontWeight: 'bold', color: COR_VERDE_ESCURO }}>
              {dados ? formatarMoeda(dados.valorAReceberMes) : '—'}
            </div>
          </div>
          <div style={{ borderTop: `1px solid ${COR_BORDA_INTERNA}`, paddingTop: '8px', marginBottom: '10px' }}>
            <div style={{ fontSize: '12px', color: COR_TEXTO_LABEL }}>A receber no mês (líquido)</div>
            <div style={{ fontSize: '27px', fontWeight: 'bold', color: COR_VERDE_ESCURO }}>
              {dados ? formatarMoeda(dados.valorAReceberMesLiquido) : '—'}
            </div>
          </div>
          <div style={{ borderTop: `1px solid ${COR_BORDA_INTERNA}`, paddingTop: '8px', marginBottom: '8px' }}>
            <div style={{ fontSize: '11px', color: COR_TEXTO_LABEL }}>Recebido até hoje</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: COR_TEXTO_VALOR }}>
              {dados ? formatarMoeda(dados.valorRecebidoAteHoje) : '—'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: COR_TEXTO_LABEL }}>Valor de repasse de frete</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: COR_TEXTO_VALOR }}>
              {dados ? formatarMoeda(dados.valorRepasseFrete) : '—'}
            </div>
          </div>
        </>
      ) : (
        // ── Desktop — grid 2×2: bruto/líquido em destaque na linha de
        // cima, recebido/repasse menores embaixo (Opção A do mockup)
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
            <div>
              <div style={{ fontSize: '12px', color: COR_TEXTO_LABEL }}>A receber no mês</div>
              <div style={{ fontSize: '27px', fontWeight: 'bold', color: COR_VERDE_ESCURO }}>
                {dados ? formatarMoeda(dados.valorAReceberMes) : '—'}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '12px', color: COR_TEXTO_LABEL }}>A receber no mês (líquido)</div>
              <div style={{ fontSize: '27px', fontWeight: 'bold', color: COR_VERDE_ESCURO }}>
                {dados ? formatarMoeda(dados.valorAReceberMesLiquido) : '—'}
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              borderTop: `1px solid ${COR_BORDA_INTERNA}`,
              paddingTop: '8px',
            }}
          >
            <div>
              <div style={{ fontSize: '11px', color: COR_TEXTO_LABEL }}>Recebido até hoje</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: COR_TEXTO_VALOR }}>
                {dados ? formatarMoeda(dados.valorRecebidoAteHoje) : '—'}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: COR_TEXTO_LABEL }}>Valor de repasse de frete</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: COR_TEXTO_VALOR }}>
                {dados ? formatarMoeda(dados.valorRepasseFrete) : '—'}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
