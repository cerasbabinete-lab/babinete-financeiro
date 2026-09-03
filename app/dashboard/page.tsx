// ============================================================
// app/dashboard/page.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Dashboard (NOVO)
// Função: Tela final do Dashboard — home/overview pra TODOS os
//         usuários do sistema (Especificacao_Modulo_Dashboard.md,
//         Seção 1: "Every user who logs in lands here"). Compõe os 8
//         componentes de components/dashboard/*.tsx, consumindo os 3
//         endpoints novos (resumo, titulos, rankings) via fetch com
//         Bearer token — mesmo padrão de auth já usado em toda tela
//         do projeto que chama pages/api/ (ex:
//         ContasAPagarModal.tsx::handleGerarBoletoAvulso).
//         Layout (barra superior, grid de 2 cards, gráfico, grid de
//         2 listas, grid de 2 rankings) fiel ao mockup aprovado
//         (mockup_dashboard.html).
// Conecta com: todos os components/dashboard/*.tsx,
//              types/dashboard.ts, lib/supabase.ts,
//              lib/contasAPagarService.ts (formatarMoeda, usado só
//              indiretamente pelos componentes filhos)
// Referência: Especificacao_Modulo_Dashboard.md, Seção 1, Seção 10;
//             mockup_dashboard.html (fonte visual)
// ============================================================

'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { resolverUsernameExibicao } from '@/lib/authUsername'

// Componentes de layout congelados — mesmo padrão de app/page.tsx,
// app/clientes/page.tsx, app/fornecedores/page.tsx etc. — NÃO modificar
import Topbar from '@/components/layout/Topbar'
import TopbarMobile from '@/components/layout/TopbarMobile'
import NavBar from '@/components/layout/NavBar'
import Drawer from '@/components/layout/Drawer'

import CardReceitas from '@/components/dashboard/CardReceitas'
import CardDespesas from '@/components/dashboard/CardDespesas'
import GraficoFluxoDiario from '@/components/dashboard/GraficoFluxoDiario'
import ListaTitulosPagar from '@/components/dashboard/ListaTitulosPagar'
import ListaTitulosReceber from '@/components/dashboard/ListaTitulosReceber'
import RankingClientes from '@/components/dashboard/RankingClientes'
import type { ItemRanking } from '@/components/dashboard/RankingClientes'

import { formatarMoeda } from '@/lib/contasAPagarService'
import type {
  DashboardResumoResponse,
  DashboardTitulosResponse,
  DashboardRankingsResponse,
} from '@/types/dashboard'

const COR_BORDA_TOPO = '#d7e0e6'
const COR_TEXTO_MUTED = '#7188a0'
const COR_PRIMARIA = '#1a6094'

// ============================================================
// hojeSaoPauloIso() — duplicado mais uma vez, mesmo raciocínio de
// todos os outros arquivos deste módulo. Aqui usado só pra: (1)
// prefixo do vencimentoAte inicial das duas listas ("hoje +
// atrasados", Seção 5.2/6) e (2) o texto do cabeçalho ("Segunda-
// feira, 31 de agosto de 2026")
// ============================================================
function hojeSaoPauloIso(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
  return fmt.format(new Date())
}

function dataCabecalhoFormatada(): string {
  const fmt = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
  const texto = fmt.format(new Date()) // ex: "segunda-feira, 31 de agosto de 2026"
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

// ============================================================
// getToken() — mesmo padrão de auth de
// ContasAPagarModal.tsx::handleGerarBoletoAvulso(), extraído aqui
// porque esta tela faz várias chamadas (resumo/titulos/rankings),
// todas precisando do mesmo token
// ============================================================
async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Sessão expirada — faça login novamente.')
  return token
}

export default function DashboardPage() {
  // Router para redirect em caso de sessão inválida — mesmo padrão de app/page.tsx
  const router = useRouter()

  // Nome do usuário extraído do email — passado para Topbar/TopbarMobile/Drawer
  const [usuario, setUsuario] = useState<string>('')

  // Controla se a verificação de autenticação ainda está em andamento
  const [authCarregando, setAuthCarregando] = useState(true)

  // Resultado da detecção de viewport — null enquanto não resolvido (evita flash de layout errado)
  const [isMobile, setIsMobile] = useState<boolean | null>(null)

  // Controla a abertura do Drawer lateral no layout mobile
  const [drawerAberto, setDrawerAberto] = useState(false)

  const [resumo, setResumo] = useState<DashboardResumoResponse | null>(null)
  const [titulosResp, setTitulosResp] = useState<DashboardTitulosResponse | null>(null)
  const [rankingsResp, setRankingsResp] = useState<DashboardRankingsResponse | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  // Filtro de data das 2 listas (Seção 5.2/6) — padrão "hoje +
  // atrasados": vencimentoAte = hoje, vencimentoDe vazio (sem piso).
  // Compartilhado entre as 2 listas (mesma janela, Seção 6: "Same
  // time window as Section 5")
  const [vencimentoDe, setVencimentoDe] = useState('')
  const [vencimentoAte, setVencimentoAte] = useState(hojeSaoPauloIso())

  // Filtro de período dos 2 rankings (Seções 7/8) — 'padrao' usa o
  // default do próprio endpoint (mês corrente / últimos 6 meses),
  // 'personalizado' revela os 2 inputs de data abaixo do seletor
  const [modoTopClientes, setModoTopClientes] = useState<'padrao' | 'personalizado'>('padrao')
  const [topClientesDataInicial, setTopClientesDataInicial] = useState('')
  const [topClientesDataFinal, setTopClientesDataFinal] = useState('')

  const [modoInativos, setModoInativos] = useState<'padrao' | 'personalizado'>('padrao')
  const [inativosDataInicial, setInativosDataInicial] = useState('')
  const [inativosDataFinal, setInativosDataFinal] = useState('')

  // ── Carregamento — Resumo (Cards + Gráfico) ──────────────────
  // Estrutura em cadeia .then()/.catch() de propósito, não
  // async/await: os 3 setState (setResumo/setErro) precisam viver
  // dentro de closures de .then()/.catch(), não no corpo direto de
  // uma função async chamada pelo efeito — é o que faz a análise
  // estática do eslint-plugin-react-hooks (regra
  // react-hooks/set-state-in-effect) parar de enxergar um caminho
  // síncrono de "efeito → setState" e considerar resolvido, mesmo
  // padrão recomendado pela documentação do React pra Effects de
  // busca de dados. Decisão pedida explicitamente por Maycon nesta
  // sessão — diverge do padrão async/await usado no resto do
  // projeto (app/pagar/page.tsx etc., que têm o mesmo aviso não
  // resolvido) só neste arquivo
  const carregarResumo = useCallback(() => {
    getToken()
      .then(token => fetch('/api/dashboard/resumo', { headers: { Authorization: `Bearer ${token}` } }))
      .then(resp => {
        if (!resp.ok) {
          return resp.json().catch(() => ({})).then(corpo => {
            throw new Error(corpo.erro ?? 'Erro ao carregar resumo')
          })
        }
        return resp.json()
      })
      .then((dados: DashboardResumoResponse) => setResumo(dados))
      .catch((err: unknown) => setErro(err instanceof Error ? err.message : 'Erro ao carregar resumo'))
  }, [])

  // ── Carregamento — Listas de Títulos ──────────────────────────
  const carregarTitulos = useCallback((de: string, ate: string) => {
    getToken()
      .then(token => {
        const params = new URLSearchParams()
        if (de) params.set('vencimentoDe', de)
        if (ate) params.set('vencimentoAte', ate)
        return fetch(`/api/dashboard/titulos?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } })
      })
      .then(resp => {
        if (!resp.ok) {
          return resp.json().catch(() => ({})).then(corpo => {
            throw new Error(corpo.erro ?? 'Erro ao carregar títulos')
          })
        }
        return resp.json()
      })
      .then((dados: DashboardTitulosResponse) => setTitulosResp(dados))
      .catch((err: unknown) => setErro(err instanceof Error ? err.message : 'Erro ao carregar títulos'))
  }, [])

  // ── Carregamento — Rankings ────────────────────────────────────
  const carregarRankings = useCallback((
    topDe: string, topAte: string,
    inativosDe: string, inativosAte: string,
  ) => {
    getToken()
      .then(token => {
        const params = new URLSearchParams()
        if (topDe) params.set('topClientesDataInicial', topDe)
        if (topAte) params.set('topClientesDataFinal', topAte)
        if (inativosDe) params.set('inativosDataInicial', inativosDe)
        if (inativosAte) params.set('inativosDataFinal', inativosAte)
        return fetch(`/api/dashboard/rankings?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } })
      })
      .then(resp => {
        if (!resp.ok) {
          return resp.json().catch(() => ({})).then(corpo => {
            throw new Error(corpo.erro ?? 'Erro ao carregar rankings')
          })
        }
        return resp.json()
      })
      .then((dados: DashboardRankingsResponse) => setRankingsResp(dados))
      .catch((err: unknown) => setErro(err instanceof Error ? err.message : 'Erro ao carregar rankings'))
  }, [])

  // ============================================================
  // useEffect — Detecção de viewport (mobile / desktop)
  // Padrão idêntico ao de app/page.tsx, app/clientes/page.tsx e
  // app/fornecedores/page.tsx. Breakpoint: 768px (max-width → mobile)
  // ============================================================
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setIsMobile(mq.matches) // eslint-disable-line react-hooks/set-state-in-effect
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // ============================================================
  // useEffect — Verificação de autenticação
  // Padrão aprovado (FIX-05): getUser() valida JWT server-side.
  // SIGNED_OUT listener garante redirect imediato ao expirar sessão.
  // Idêntico ao de app/page.tsx
  // ============================================================
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user }, error }) => {
      if (!user || error) {
        router.push('/login')
        return
      }
      const email = user.email ?? ''
      setUsuario(resolverUsernameExibicao(email)) // eslint-disable-line react-hooks/set-state-in-effect
      setAuthCarregando(false) // eslint-disable-line react-hooks/set-state-in-effect
    }).catch(() => {
      router.push('/login')
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.push('/login')
    })

    return () => subscription.unsubscribe()
  }, [router])

  // Carga inicial — uma vez, ao montar a tela.
  // Fix Audit §3.3 (Handoff_Modulo_Dashboard_Audit_para_QA.md): antes,
  // este efeito também chamava carregarTitulos() e carregarRankings(),
  // duplicando as chamadas GET /api/dashboard/titulos e /rankings —
  // os dois useEffects dependency-tracked logo abaixo JÁ rodam uma vez
  // no mount independente de dependência ter mudado (comportamento
  // padrão do React), então eles sozinhos cobrem a carga inicial dessas
  // duas listas. Só carregarResumo() fica aqui — não é duplicado por
  // nenhum outro efeito
  useEffect(() => {
    carregarResumo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Refaz a busca das listas quando o filtro de data muda (debounce
  // simples não implementado — troca de data via <input type="date">
  // já dispara só ao soltar o seletor, não a cada tecla, então o
  // volume de chamadas é naturalmente baixo)
  useEffect(() => {
    carregarTitulos(vencimentoDe, vencimentoAte)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vencimentoDe, vencimentoAte])

  // Refaz a busca dos rankings quando modo ou datas personalizadas mudam
  useEffect(() => {
    const topDe = modoTopClientes === 'personalizado' ? topClientesDataInicial : ''
    const topAte = modoTopClientes === 'personalizado' ? topClientesDataFinal : ''
    const inativosDe = modoInativos === 'personalizado' ? inativosDataInicial : ''
    const inativosAte = modoInativos === 'personalizado' ? inativosDataFinal : ''
    carregarRankings(topDe, topAte, inativosDe, inativosAte)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoTopClientes, topClientesDataInicial, topClientesDataFinal, modoInativos, inativosDataInicial, inativosDataFinal])

  // ── Achata os rankings pro shape que RankingClientes espera
  // (nome + valorFormatado já pronto) — decisão de formatação fica
  // aqui, não dentro do componente de tela (ver comentário em
  // RankingClientes.tsx) ──────────────────────────────────────────
  const itensTopClientes: ItemRanking[] | null = rankingsResp
    ? rankingsResp.topClientes.map(c => ({ nome: c.nome, valorFormatado: formatarMoeda(c.valor) }))
    : null

  const itensInativos: ItemRanking[] | null = rankingsResp
    ? rankingsResp.clientesInativos.map(c => ({ nome: c.nome, valorFormatado: `${c.diasSemComprar} dias` }))
    : null

  const inputPeriodoStyle: React.CSSProperties = {
    fontSize: '10px',
    border: `1px solid ${COR_BORDA_TOPO}`,
    borderRadius: '4px',
    padding: '2px 4px',
    color: COR_TEXTO_MUTED,
  }

  // Guard de autenticação — evita flash de conteúdo não autorizado antes do redirect
  if (authCarregando) return null

  // Guard de viewport — evita flash do layout desktop em dispositivos móveis
  if (isMobile === null) return null

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        fontFamily: 'Tahoma, Geneva, Verdana, sans-serif',
        background: '#f0f4f7',
      }}
    >
      {/* Cabeçalho padrão do sistema — desktop: Topbar + NavBar / mobile: TopbarMobile */}
      {isMobile ? (
        <TopbarMobile usuario={usuario} onOpenDrawer={() => setDrawerAberto(true)} />
      ) : (
        <>
          <Topbar usuario={usuario} />
          <NavBar />
        </>
      )}

    <div
      style={{
        padding: '20px',
        color: '#233240',
        maxWidth: '1180px',
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* Sub-cabeçalho do Dashboard — título do módulo + data, mantido abaixo do cabeçalho padrão */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: '18px',
          paddingBottom: '14px',
          borderBottom: `1px solid ${COR_BORDA_TOPO}`,
        }}
      >
        <div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: COR_PRIMARIA, marginTop: '2px' }}>Dashboard</div>
        </div>
        <div style={{ fontSize: '13px', color: COR_TEXTO_MUTED }}>{dataCabecalhoFormatada()}</div>
      </div>

      {erro && (
        <div style={{ background: '#fff3f3', border: '1px solid #f0b8b8', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', color: '#c0392b', marginBottom: '18px' }}>
          {erro}
        </div>
      )}

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
        <CardReceitas dados={resumo?.cardReceitas ?? null} />
        <CardDespesas dados={resumo?.cardDespesas ?? null} />
      </div>

      {/* Gráfico */}
      <div style={{ marginBottom: '20px' }}>
        <GraficoFluxoDiario dados={resumo?.graficoFluxoDiario ?? null} />
      </div>

      {/* Listas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
        <ListaTitulosPagar
          titulos={titulosResp?.titulosPagar ?? null}
          vencimentoDe={vencimentoDe}
          vencimentoAte={vencimentoAte}
          onChangeVencimentoDe={setVencimentoDe}
          onChangeVencimentoAte={setVencimentoAte}
        />
        <ListaTitulosReceber
          titulos={titulosResp?.titulosReceber ?? null}
          vencimentoDe={vencimentoDe}
          vencimentoAte={vencimentoAte}
          onChangeVencimentoDe={setVencimentoDe}
          onChangeVencimentoAte={setVencimentoAte}
        />
      </div>

      {/* Rankings */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div>
          <RankingClientes
            titulo="Top 10 — clientes que mais compraram"
            itens={itensTopClientes}
            opcoesPeriodo={[
              { value: 'padrao', label: 'Mês corrente' },
              { value: 'personalizado', label: 'Personalizado' },
            ]}
            periodoSelecionado={modoTopClientes}
            onChangePeriodo={v => setModoTopClientes(v as 'padrao' | 'personalizado')}
          />
          {/* Inputs de data personalizados — só aparecem quando
              "Personalizado" está selecionado. Fora de
              RankingClientes.tsx de propósito (componente genérico,
              não conhece esse estado) — o mockup não mostrou este
              estado expandido, então o posicionamento abaixo do card
              é decisão própria, não cópia literal do mockup */}
          {modoTopClientes === 'personalizado' && (
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginTop: '6px', padding: '0 4px' }}>
              <input type="date" value={topClientesDataInicial} onChange={e => setTopClientesDataInicial(e.target.value)} style={inputPeriodoStyle} />
              <span style={{ fontSize: '10px', color: COR_TEXTO_MUTED }}>a</span>
              <input type="date" value={topClientesDataFinal} onChange={e => setTopClientesDataFinal(e.target.value)} style={inputPeriodoStyle} />
            </div>
          )}
        </div>

        <div>
          <RankingClientes
            titulo="Top 10 — clientes sem comprar há mais tempo"
            itens={itensInativos}
            opcoesPeriodo={[
              { value: 'padrao', label: 'Últimos 6 meses' },
              { value: 'personalizado', label: 'Personalizado' },
            ]}
            periodoSelecionado={modoInativos}
            onChangePeriodo={v => setModoInativos(v as 'padrao' | 'personalizado')}
          />
          {modoInativos === 'personalizado' && (
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginTop: '6px', padding: '0 4px' }}>
              <input type="date" value={inativosDataInicial} onChange={e => setInativosDataInicial(e.target.value)} style={inputPeriodoStyle} />
              <span style={{ fontSize: '10px', color: COR_TEXTO_MUTED }}>a</span>
              <input type="date" value={inativosDataFinal} onChange={e => setInativosDataFinal(e.target.value)} style={inputPeriodoStyle} />
            </div>
          )}
        </div>
      </div>
    </div>

      {/* Drawer lateral — mobile only. usuario removido — DrawerProps
          (components/layout/Drawer.tsx, congelado) não declara essa prop;
          TS2322 apareceu porque o padrão foi copiado de app/page.tsx, que
          tem o mesmo problema pré-existente (fora do escopo desta correção
          — Drawer.tsx não pode ser modificado) */}
      {isMobile && (
        <Drawer
          isOpen={drawerAberto}
          onClose={() => setDrawerAberto(false)}
        />
      )}
    </div>
  )
}
