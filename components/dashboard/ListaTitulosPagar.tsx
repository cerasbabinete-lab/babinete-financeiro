// ============================================================
// components/dashboard/ListaTitulosPagar.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Dashboard (NOVO)
// Função: Lista de Títulos a Pagar — Hoje + Atrasados
//         (Especificacao_Modulo_Dashboard.md, Seção 5 — feature
//         prioritária). Visual fiel ao mockup aprovado
//         (mockup_dashboard.html). Hierarquia de ação por linha
//         (Seção 5.3, avaliada nesta ordem exata):
//           1. linha_digitavel + nosso_numero presentes → botão
//              "Gerar boleto 2ª via"
//           2. senão, fornecedor com chave Pix preferencial → mostra
//              a chave com botão de copiar
//           3. senão → linha só informativa, sem ação
//         O botão de 2ª via espelha EXATAMENTE
//         handleGerarBoletoAvulso() de
//         components/pagar/ContasAPagarModal.tsx (linhas ~115-141) —
//         mesmo padrão de auth (getSession + Bearer), mesmo
//         blob/window.open, mesmo tratamento de erro (Seção 5.3,
//         nota: "do not add a loading/disabled state pattern
//         different from the one already used in that modal").
//         Diferença necessária: lá é 1 título por modal (1 boolean
//         de loading); aqui são N linhas simultâneas, por isso o
//         estado de loading é por id (gerandoId), não um boolean
//         único — mesma lógica interna do handler, só a variável de
//         controle precisa ser por linha.
// Conecta com: types/dashboard.ts (TituloPagarComAcao),
//              lib/contasAPagarService.ts (formatarMoeda,
//              formatarDataBR), lib/supabase.ts (supabase — mesmo
//              client usado por ContasAPagarModal.tsx pra pegar o
//              token de sessão), app/dashboard/page.tsx
// Referência: Especificacao_Modulo_Dashboard.md, Seção 5;
//             mockup_dashboard.html (fonte visual)
// ============================================================

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatarMoeda, formatarDataBR } from '@/lib/contasAPagarService'
import type { TituloPagarComAcao } from '@/types/dashboard'

const COR_BORDA_CARD = '#d7e0e6'
const COR_BORDA_LINHA = '#eef2f4'
const COR_TITULO = '#233240'
const COR_TEXTO_MUTED = '#5c7484'
const COR_ATRASADO = '#c0392b'
const COR_MUDO_CLARO = '#a0adb8'
const COR_PRIMARIA = '#1a6094'
const COR_VERDE_ACENTO = '#2c9d5b'
const COR_PIX_FUNDO = '#eef6f0'

// ============================================================
// hojeSaoPauloIso() — mesmo raciocínio de fuso dos endpoints
// (pages/api/dashboard/*.ts), agora do lado do client. Usado só pra
// decidir "atrasado" vs "vence hoje" vs data futura na Linha de cada
// título — não chama isTituloVencido() de contasAPagarService.ts de
// propósito: aquela função só considera status === 'em_aberto'
// (retorna sempre false pra pago_parcial), e esta lista inclui os
// dois status (Seção 5.1) — teria que reimplementar por dentro dela
// mesma assim, então a comparação de data direta aqui é mais simples
// e correta pros dois casos
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

interface ListaTitulosPagarProps {
  // null enquanto pages/api/dashboard/titulos.ts ainda não respondeu
  titulos: TituloPagarComAcao[] | null
  vencimentoDe: string
  vencimentoAte: string
  onChangeVencimentoDe: (v: string) => void
  onChangeVencimentoAte: (v: string) => void
}

export default function ListaTitulosPagar({
  titulos,
  vencimentoDe,
  vencimentoAte,
  onChangeVencimentoDe,
  onChangeVencimentoAte,
}: ListaTitulosPagarProps) {
  // Estado de loading por id — diferente do único boolean de
  // ContasAPagarModal.tsx porque aqui várias linhas coexistem na
  // mesma tela (nota no cabeçalho do arquivo)
  const [gerandoId, setGerandoId] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [copiadoId, setCopiadoId] = useState<string | null>(null)

  const hojeIso = hojeSaoPauloIso()

  // ============================================================
  // handleGerarBoletoAvulso() — mesmo corpo de
  // ContasAPagarModal.tsx::handleGerarBoletoAvulso(), parametrizado
  // por tituloId em vez de usar um `titulo` de state único
  // ============================================================
  async function handleGerarBoletoAvulso(tituloId: string) {
    setGerandoId(tituloId)
    setErro(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Sessão expirada — faça login novamente.')

      const resp = await fetch(`/api/pagar/gerar-boleto-avulso?id=${tituloId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!resp.ok) {
        const corpo = await resp.json().catch(() => ({}))
        throw new Error(corpo.erro ?? 'Erro ao gerar boleto')
      }

      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao gerar 2ª via')
    } finally {
      setGerandoId(null)
    }
  }

  async function handleCopiarPix(tituloId: string, valorChave: string) {
    try {
      await navigator.clipboard.writeText(valorChave)
      setCopiadoId(tituloId)
      setTimeout(() => setCopiadoId(id => (id === tituloId ? null : id)), 1500)
    } catch {
      // Falha de clipboard (ex: contexto não-seguro) — sem tratamento
      // especial, mesmo padrão de simplicidade do resto do projeto;
      // o usuário ainda vê a chave escrita na tela e pode selecionar
      // manualmente
    }
  }

  // ============================================================
  // renderAcao() — hierarquia de ação da Seção 5.3, nesta ordem exata
  // ============================================================
  function renderAcao(titulo: TituloPagarComAcao) {
    // 1. linha_digitavel + nosso_numero presentes → 2ª via
    if (titulo.linha_digitavel && titulo.nosso_numero) {
      return (
        <button
          disabled={gerandoId === titulo.id}
          onClick={() => handleGerarBoletoAvulso(titulo.id)}
          style={{
            fontSize: '10px',
            background: COR_PRIMARIA,
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            padding: '5px 8px',
            cursor: gerandoId === titulo.id ? 'default' : 'pointer',
            opacity: gerandoId === titulo.id ? 0.7 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {gerandoId === titulo.id ? 'Gerando...' : 'Gerar boleto 2ª via'}
        </button>
      )
    }

    // 2. fornecedor com chave Pix preferencial → mostra chave + copiar
    if (titulo.chavePixPreferencial) {
      const { valorChave } = titulo.chavePixPreferencial
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            background: COR_PIX_FUNDO,
            borderRadius: '4px',
            padding: '4px 6px',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ fontSize: '10px', color: COR_VERDE_ACENTO }}>
            {copiadoId === titulo.id ? 'Copiado!' : valorChave}
          </span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke={COR_VERDE_ACENTO}
            strokeWidth={2}
            style={{ cursor: 'pointer' }}
            onClick={() => handleCopiarPix(titulo.id, valorChave)}
            role="button"
            aria-label="Copiar chave Pix"
          >
            <rect x="8" y="8" width="12" height="12" rx="1" />
            <path d="M4 16V4h12" />
          </svg>
        </div>
      )
    }

    // 3. sem nenhuma das duas — linha só informativa
    return <span style={{ fontSize: '10px', color: COR_MUDO_CLARO, whiteSpace: 'nowrap' }}>sem boleto/pix salvo</span>
  }

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
        <div style={{ fontSize: '13px', fontWeight: 'bold', color: COR_TITULO }}>Títulos a pagar — hoje + atrasados</div>
        {/* Filtro de data livremente ajustável (Seção 5.2), inclusive
            pro futuro — não há trava de intervalo aqui */}
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

      {erro && <div style={{ fontSize: '11px', color: COR_ATRASADO, marginBottom: '8px' }}>{erro}</div>}

      {titulos === null && <div style={{ fontSize: '12px', color: COR_TEXTO_MUTED, padding: '8px 0' }}>Carregando...</div>}

      {titulos !== null && titulos.length === 0 && (
        <div style={{ fontSize: '12px', color: COR_TEXTO_MUTED, padding: '8px 0' }}>Nenhum título em aberto no período.</div>
      )}

      {titulos !== null &&
        titulos.map(titulo => {
          const atraso = diasDeAtraso(titulo.data_vencimento, hojeIso)
          const vencido = atraso > 0
          const vencHoje = atraso === 0
          const dataCurta = formatarDataBR(titulo.data_vencimento).slice(0, 5) // 'DD/MM/AAAA' -> 'DD/MM'

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
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: 'bold', color: COR_TITULO }}>{titulo.favorecido_nome}</div>
                <div style={{ fontSize: '10px', color: vencido ? COR_ATRASADO : COR_TEXTO_MUTED }}>
                  {vencHoje ? 'Venc. hoje' : vencido ? `Venc. ${dataCurta} — atrasado ${atraso}d` : `Venc. ${dataCurta}`}
                  {' · '}
                  {formatarMoeda(titulo.valor)}
                </div>
              </div>
              {renderAcao(titulo)}
            </div>
          )
        })}
    </div>
  )
}
