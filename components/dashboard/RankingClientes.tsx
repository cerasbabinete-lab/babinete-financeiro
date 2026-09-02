// ============================================================
// components/dashboard/RankingClientes.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Dashboard (NOVO)
// Função: Componente parametrizável pros dois rankings do Dashboard
//         (Especificacao_Modulo_Dashboard.md, Seções 7 e 8 — a spec
//         explicitamente permite "parameterizable for both rankings,
//         or two components if that reads cleaner — Builder
//         discretion", Seção 10). Optei por 1 componente só: os dois
//         rankings têm exatamente a mesma estrutura visual (lista
//         numerada, nome à esquerda, valor em negrito à direita,
//         seletor de período no cabeçalho) — a única diferença é o
//         texto do valor (R$ vs "X dias") e as opções do seletor de
//         período, ambos parametrizáveis sem duplicar JSX.
//         Visual fiel ao mockup aprovado (mockup_dashboard.html).
// Conecta com: types/dashboard.ts (DashboardRankingClienteTop,
//              DashboardRankingClienteInativo — union tratada via
//              prop `itens` já formatada, ver abaixo),
//              app/dashboard/page.tsx (renderiza este componente 2x,
//              uma vez por ranking)
// Referência: Especificacao_Modulo_Dashboard.md, Seções 7 e 8;
//             mockup_dashboard.html (fonte visual)
// ============================================================

const COR_BORDA_CARD = '#d7e0e6'
const COR_BORDA_LINHA = '#eef2f4'
const COR_TITULO = '#233240'
const COR_TEXTO_MUTED = '#5c7484'
const COR_NUMERO = '#a0adb8'

// ============================================================
// ItemRanking — shape já achatado pro componente, resolvido pelo
// componente pai (app/dashboard/page.tsx) a partir de
// DashboardRankingClienteTop (nome, valor: number) ou
// DashboardRankingClienteInativo (nome, diasSemComprar: number) —
// este componente não sabe a diferença entre os dois tipos de dado
// de origem, só recebe `nome` + `valorFormatado` já como string
// pronta pra exibir (ex: "R$ 14.320,00" ou "168 dias"). Isso evita
// este componente importar os dois tipos de types/dashboard.ts e
// decidir formatação — decisão de formatação fica só no pai, que já
// sabe qual dos dois rankings está montando
// ============================================================
export interface ItemRanking {
  nome: string
  valorFormatado: string
}

// ============================================================
// OpcaoPeriodo — opções do <select> de período (Seção 7: "Mês
// corrente" / "Personalizado"; Seção 8: "Últimos 6 meses" /
// "Personalizado") — parametrizável porque o texto muda entre os
// dois rankings
// ============================================================
export interface OpcaoPeriodo {
  value: string
  label: string
}

interface RankingClientesProps {
  titulo: string // "Top 10 — clientes que mais compraram" ou "...sem comprar há mais tempo"
  itens: ItemRanking[] | null // null enquanto pages/api/dashboard/rankings.ts ainda não respondeu
  opcoesPeriodo: OpcaoPeriodo[]
  periodoSelecionado: string
  onChangePeriodo: (value: string) => void
}

export default function RankingClientes({
  titulo,
  itens,
  opcoesPeriodo,
  periodoSelecionado,
  onChangePeriodo,
}: RankingClientesProps) {
  return (
    <div
      style={{
        fontFamily: 'Tahoma, Geneva, Verdana, sans-serif',
        background: '#ffffff',
        border: `1px solid ${COR_BORDA_CARD}`,
        borderRadius: '8px',
        padding: '14px 16px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div style={{ fontSize: '13px', fontWeight: 'bold', color: COR_TITULO }}>{titulo}</div>
        <select
          value={periodoSelecionado}
          onChange={e => onChangePeriodo(e.target.value)}
          style={{ fontSize: '10px', border: `1px solid ${COR_BORDA_CARD}`, borderRadius: '4px', padding: '3px 4px', color: COR_TEXTO_MUTED }}
        >
          {opcoesPeriodo.map(opcao => (
            <option key={opcao.value} value={opcao.value}>
              {opcao.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ fontSize: '11px' }}>
        {itens === null && <div style={{ color: COR_TEXTO_MUTED, padding: '8px 0' }}>Carregando...</div>}

        {itens !== null && itens.length === 0 && (
          <div style={{ color: COR_TEXTO_MUTED, padding: '8px 0' }}>Nenhum resultado no período.</div>
        )}

        {itens !== null &&
          itens.map((item, i) => (
            <div
              key={`${item.nome}-${i}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '6px 0',
                borderTop: `1px solid ${COR_BORDA_LINHA}`,
              }}
            >
              <span>
                <b style={{ color: COR_NUMERO, marginRight: '6px' }}>{i + 1}</b>
                {item.nome}
              </span>
              <b>{item.valorFormatado}</b>
            </div>
          ))}
      </div>
    </div>
  )
}
