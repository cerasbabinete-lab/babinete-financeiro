// ============================================================
// components/dashboard/CardReceitas.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Dashboard (NOVO)
// Função: Card Verde — Receitas (Especificacao_Modulo_Dashboard.md,
//         Seção 2). REVISADO nesta sessão (Opção A do mockup de
//         revisão): vira grid 2×2 — Linha 1 (bruto | líquido, fonte
//         27px) e Linha 2 (recebido | repasse de frete, fonte 16px)
//         — sem mais a linha "Faturamento total". No mobile
//         (prop isMobile nova) empilha em 1 coluna, ordem bruto →
//         líquido → recebido → repasse, mesmos tamanhos de fonte do
//         desktop (Maycon pediu explicitamente pra não reduzir).
// Conecta com: types/dashboard.ts (DashboardCardReceitas),
//              lib/contasAPagarService.ts (formatarMoeda),
//              app/dashboard/page.tsx (renderiza este componente)
// Referência: Especificacao_Modulo_Dashboard.md, Seção 2;
//             mockup_dashboard.html (fonte visual desta revisão)
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
  // MUDANÇA DESTA SESSÃO — controla grid 2×2 (desktop, false) vs.
  // empilhado 1 coluna (mobile, true). Vem de app/dashboard/page.tsx,
  // mesmo state/guard `isMobile` (null → matchMedia) já usado pelo
  // resto do sistema (Topbar/TopbarMobile etc.) — por isso o tipo
  // aqui é `boolean`, não `boolean | null`: quem chama este
  // componente só o renderiza depois do guard `if (isMobile === null)
  // return null` já ter passado
  isMobile: boolean
}

export default function CardReceitas({ dados, isMobile }: CardReceitasProps) {
  // Linha 1 (fonte maior, 27px, mesmo tamanho de hoje — Maycon pediu
  // pra não reduzir fonte no mobile): bruto à esquerda, líquido à
  // direita no desktop; empilhados bruto → líquido no mobile
  const linha1 = (
    <>
      <div>
        <div style={{ fontSize: '12px', color: COR_TEXTO_LABEL }}>A receber no mês</div>
        <div style={{ fontSize: '27px', fontWeight: 'bold', color: COR_VERDE_ESCURO }}>
          {dados ? formatarMoeda(dados.valorAReceberMes) : '—'}
        </div>
      </div>
      <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
        <div style={{ fontSize: '12px', color: COR_TEXTO_LABEL }}>A receber no mês (líquido)</div>
        <div style={{ fontSize: '27px', fontWeight: 'bold', color: COR_VERDE_ESCURO }}>
          {dados ? formatarMoeda(dados.valorAReceberMesLiquido) : '—'}
        </div>
      </div>
    </>
  )

  // Linha 2 (fonte menor, 16px, mesmo tamanho de hoje): recebido à
  // esquerda, repasse de frete à direita no desktop; empilhados
  // recebido → repasse no mobile — ordem final: bruto, líquido,
  // recebido, repasse (confirmada com Maycon)
  const linha2 = (
    <>
      <div>
        <div style={{ fontSize: '11px', color: COR_TEXTO_LABEL }}>Recebido até hoje</div>
        <div style={{ fontSize: '16px', fontWeight: 'bold', color: COR_TEXTO_VALOR }}>
          {dados ? formatarMoeda(dados.valorRecebidoAteHoje) : '—'}
        </div>
      </div>
      <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
        <div style={{ fontSize: '11px', color: COR_TEXTO_LABEL }}>Valor de repasse de frete</div>
        <div style={{ fontSize: '16px', fontWeight: 'bold', color: COR_TEXTO_VALOR }}>
          {dados ? formatarMoeda(dados.valorRepasseFrete) : '—'}
        </div>
      </div>
    </>
  )

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

      {/* Linha 1 — grid 2 colunas no desktop, empilhado no mobile */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: isMobile ? '10px' : '12px',
          marginBottom: '10px',
        }}
      >
        {linha1}
      </div>

      {/* Linha 2 — mesmo padrão de grid, com borda superior separando
          da Linha 1 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: isMobile ? '10px' : '12px',
          borderTop: `1px solid ${COR_BORDA_INTERNA}`,
          paddingTop: '8px',
        }}
      >
        {linha2}
      </div>
    </div>
  )
}
