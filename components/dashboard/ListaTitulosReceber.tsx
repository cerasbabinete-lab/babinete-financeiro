// ============================================================
// components/dashboard/ListaTitulosReceber.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Dashboard (NOVO)
// Função: Lista de Títulos a Receber — Hoje + Atrasados
//         (Especificacao_Modulo_Dashboard.md, Seção 6). Mesma janela
//         de tempo da Lista a Pagar (Seção 5), mas PURAMENTE
//         INFORMATIVA — nenhuma ação de linha (Seção 6: "the client
//         owes the company, not the other way around; there is
//         nothing for the user to do from this list"). Visual fiel
//         ao mockup aprovado (mockup_dashboard.html) — nome à
//         esquerda, venc./atraso + valor à direita (alinhados à
//         direita, empilhados), sem botão nem chip de ação nenhum.
// Conecta com: types/dashboard.ts (implicitamente — recebe
//              ContaReceber[] de DashboardTitulosResponse),
//              lib/contasAPagarService.ts (formatarMoeda,
//              formatarDataBR — mesmos formatadores reaproveitados
//              em ListaTitulosPagar.tsx; reuso explícito pela spec,
//              mesmo sendo do arquivo de serviço de Contas a Pagar),
//              app/dashboard/page.tsx
// Referência: Especificacao_Modulo_Dashboard.md, Seção 6;
//             mockup_dashboard.html (fonte visual)
// ============================================================

import { formatarMoeda, formatarDataBR } from '@/lib/contasAPagarService'
import type { ContaReceber } from '@/types/contasReceber'

const COR_BORDA_CARD = '#d7e0e6'
const COR_BORDA_LINHA = '#eef2f4'
const COR_TITULO = '#233240'
const COR_TEXTO_MUTED = '#5c7484'
const COR_ATRASADO = '#c0392b'
const COR_MUDO_CLARO = '#a0adb8'

// ============================================================
// hojeSaoPauloIso() / diasDeAtraso() — duplicados de
// ListaTitulosPagar.tsx pelo mesmo motivo dos outros helpers de data
// deste módulo (sem arquivo compartilhado novo fora da lista já
// combinada). Aqui não há a mesma ressalva sobre isTituloVencido()
// (esta lista só tem status 'em_aberto', decisão da Seção 9), mas a
// comparação direta continua mais simples que importar uma função
// de um módulo diferente (Contas a Receber não tem um equivalente
// exportado com esse nome)
// ============================================================
function hojeSaoPauloIso(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
  return fmt.format(new Date())
}

function diasDeAtraso(dataVencimento: string, hojeIso: string): number {
  const venc = Date.parse(dataVencimento.slice(0, 10))
  const hoje = Date.parse(hojeIso)
  return Math.round((hoje - venc) / 86_400_000)
}

interface ListaTitulosReceberProps {
  // null enquanto pages/api/dashboard/titulos.ts ainda não respondeu
  titulos: ContaReceber[] | null
  vencimentoDe: string
  vencimentoAte: string
  onChangeVencimentoDe: (v: string) => void
  onChangeVencimentoAte: (v: string) => void
}

export default function ListaTitulosReceber({
  titulos,
  vencimentoDe,
  vencimentoAte,
  onChangeVencimentoDe,
  onChangeVencimentoAte,
}: ListaTitulosReceberProps) {
  const hojeIso = hojeSaoPauloIso()

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
        <div style={{ fontSize: '13px', fontWeight: 'bold', color: COR_TITULO }}>Títulos a receber — hoje + atrasados</div>
        {/* Mesmo filtro de data livre da Lista a Pagar (Seção 6:
            "same adjustable date range filter") */}
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <input
            type="date"
            value={vencimentoDe}
            onChange={e => onChangeVencimentoDe(e.target.value)}
            style={{ fontSize: '10px', border: `1px solid ${COR_BORDA_CARD}`, borderRadius: '4px', padding: '2px 4px', color: COR_TEXTO_MUTED }}
          />
          <span style={{ fontSize: '10px', color: COR_MUDO_CLARO }}>a</span>
          <input
            type="date"
            value={vencimentoAte}
            onChange={e => onChangeVencimentoAte(e.target.value)}
            style={{ fontSize: '10px', border: `1px solid ${COR_BORDA_CARD}`, borderRadius: '4px', padding: '2px 4px', color: COR_TEXTO_MUTED }}
          />
        </div>
      </div>

      {titulos === null && <div style={{ fontSize: '12px', color: COR_TEXTO_MUTED, padding: '8px 0' }}>Carregando...</div>}

      {titulos !== null && titulos.length === 0 && (
        <div style={{ fontSize: '12px', color: COR_TEXTO_MUTED, padding: '8px 0' }}>Nenhum título em aberto no período.</div>
      )}

      {titulos !== null &&
        titulos.map(titulo => {
          const atraso = diasDeAtraso(titulo.data_vencimento, hojeIso)
          const vencido = atraso > 0
          const vencHoje = atraso === 0

          return (
            <div
              key={titulo.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 0',
                borderTop: `1px solid ${COR_BORDA_LINHA}`,
                gap: '10px',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: COR_TITULO, minWidth: 0 }}>{titulo.cliente_nome}</div>
              <div style={{ fontSize: '10px', color: vencido ? COR_ATRASADO : COR_TEXTO_MUTED, textAlign: 'right', whiteSpace: 'nowrap' }}>
                {vencHoje ? 'Venc. hoje' : vencido ? `Atrasado ${atraso}d` : `Venc. ${formatarDataBR(titulo.data_vencimento).slice(0, 5)}`}
                <br />
                {formatarMoeda(titulo.valor)}
              </div>
            </div>
          )
        })}
    </div>
  )
}
