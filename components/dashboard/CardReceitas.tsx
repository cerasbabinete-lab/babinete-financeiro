// ============================================================
// components/dashboard/CardReceitas.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Dashboard (NOVO)
// Função: Card Verde — Receitas (Especificacao_Modulo_Dashboard.md,
//         Seção 2). REESCRITO nesta sessão pra seguir fielmente o
//         mockup aprovado (mockup_dashboard.html, produzido na sessão
//         de entrevista/brain) — cores, bordas, raio, tipografia e o
//         layout de 2 colunas das linhas 2/3 vêm direto de lá, não
//         mais de julgamento próprio (a primeira versão deste
//         arquivo, antes desta revisão, foi construída sem acesso ao
//         mockup).
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
}

export default function CardReceitas({ dados }: CardReceitasProps) {
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

      {/* Linha 1 (fonte maior) — valor a receber no mês, títulos
          em_aberto (Seção 2, decisão de status confirmada) */}
      <div style={{ marginBottom: '10px' }}>
        <div style={{ fontSize: '12px', color: COR_TEXTO_LABEL }}>A receber no mês</div>
        <div style={{ fontSize: '27px', fontWeight: 'bold', color: COR_VERDE_ESCURO }}>
          {dados ? formatarMoeda(dados.valorAReceberMes) : '—'}
        </div>
      </div>

      {/* Linhas 2 e 3 lado a lado — layout do mockup, não empilhado */}
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
          <div style={{ fontSize: '11px', color: COR_TEXTO_LABEL }}>Faturamento total (líquido de frete)</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: COR_TEXTO_VALOR }}>
            {dados ? formatarMoeda(dados.faturamentoLiquidoFrete) : '—'}
          </div>
        </div>
      </div>
    </div>
  )
}
