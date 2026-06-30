// ============================================================
// app/receber/page.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Receber
// Função: Página principal — orquestra todos os componentes
//         Gerencia estado global: lista, filtros, modais, alert banner
//         Detecta desktop/mobile via matchMedia
//         Requer autenticação Supabase (getUser + SIGNED_OUT listener)
// Conecta com: todos os componentes do módulo contas-receber e layout
// ============================================================

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  buscarTitulos,
  contarTitulos,
  cancelarTitulo,
  buscarTitulosNearVencimento,
  verificarHashRemessa,
  registrarRemessaImportada,
  processarRegistrosTxtBb,
  processarRegistrosRem,
  processarRegistrosRet,
  buscarContadoresTitulos,
  type ContadoresTitulos,
} from '@/lib/contasReceberService'
import { parseTxtBb, calcularHashSha256 } from '@/lib/txtBbParser'
import { parseRem } from '@/lib/remParser'
import { parseRet } from '@/lib/retParser'
import type {
  ContaReceber,
  FiltrosContasReceber,
  ModoModal,
  TituloAvisoVencimento,
} from '@/types/contasReceber'

// Layout
import Topbar       from '@/components/layout/Topbar'
import TopbarMobile from '@/components/layout/TopbarMobile'
import NavBar        from '@/components/layout/NavBar'
import Drawer        from '@/components/layout/Drawer'

// Módulo Contas a Receber
import ContasReceberHeader      from '@/components/contas-receber/ContasReceberHeader'
import ContasReceberFiltros     from '@/components/contas-receber/ContasReceberFiltros'
import ContasReceberTabela      from '@/components/contas-receber/ContasReceberTabela'
import ContasReceberMobileList  from '@/components/contas-receber/ContasReceberMobileList'
import ContasReceberModal       from '@/components/contas-receber/ContasReceberModal'
import ContasReceberModalAvisos from '@/components/contas-receber/ContasReceberModalAvisos'
import BasebarContasReceber     from '@/components/contas-receber/BasebarContasReceber'

// ============================================================
// Filtros iniciais — todos vazios (sem restrição)
// ============================================================
const FILTROS_INICIAIS: FiltrosContasReceber = {
  busca:        '',
  vencimentoDe: '',
  vencimentoAte: '',
  status:       '',
}

// ============================================================
// Page
// ============================================================
export default function ContasReceberPage() {

  const router = useRouter()

  // ── Auth ──────────────────────────────────────────────────
  const [usuario,        setUsuario]        = useState<string>('')
  const [authCarregando, setAuthCarregando] = useState(true)

  // ── Dados ─────────────────────────────────────────────────
  const [titulos,    setTitulos]    = useState<ContaReceber[]>([])
  const [total,      setTotal]      = useState(0)
  const [carregando, setCarregando] = useState(true)

  // ── Near-due (banner de alerta) ───────────────────────────
  const [titulosNearDue,  setTitulosNearDue]  = useState<TituloAvisoVencimento[]>([])
  const [modalAvisosOpen, setModalAvisosOpen] = useState(false)

  // ── Contadores por status ─────────────────────────────────
  const [contadores, setContadores] = useState<ContadoresTitulos>({
    emAberto: 0, atrasados: 0, baixados: 0, protestados: 0, cancelados: 0,
  })

  // ── Filtros ───────────────────────────────────────────────
  const [filtros, setFiltros] = useState<FiltrosContasReceber>(FILTROS_INICIAIS)

  // ── Modal principal ───────────────────────────────────────
  const [modoModal,         setModoModal]         = useState<ModoModal>(null)
  const [tituloSelecionado, setTituloSelecionado] = useState<ContaReceber | null>(null)

  // ── Mobile ────────────────────────────────────────────────
  // isMobile inicia como null para evitar hidratação SSR
  const [isMobile,     setIsMobile]     = useState<boolean | null>(null)
  const [drawerAberto, setDrawerAberto] = useState(false)

  // ── Feedback inline ───────────────────────────────────────
  const [msgSucesso, setMsgSucesso] = useState<string | null>(null)
  const [msgErro,    setMsgErro]    = useState<string | null>(null)

  // Ref para controle de montagem (evita setState após unmount)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // ── Detecção mobile ───────────────────────────────────────
  // isMobile = null até o primeiro matchMedia — guard de hidratação SSR
  useEffect(() => {
    const mq      = window.matchMedia('(max-width: 768px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // ── Auth — getUser() para validação server-side do JWT ────
  useEffect(() => {
    supabase.auth.getUser().then((result: Awaited<ReturnType<typeof supabase.auth.getUser>>) => {
      const user = result.data?.user
      if (!user) { router.push('/login'); return }
      setUsuario((user.email ?? '').split('@')[0])
      setAuthCarregando(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string) => {
      if (event === 'SIGNED_OUT') router.push('/login')
    })
    return () => subscription.unsubscribe()
  }, [router])

  // ── Carrega títulos ───────────────────────────────────────
  const carregarTitulos = useCallback(async () => {
    setCarregando(true)
    try {
      const [lista, count, ctd] = await Promise.all([
        buscarTitulos(filtros),
        contarTitulos(),
        buscarContadoresTitulos(),
      ])
      if (!mountedRef.current) return
      setTitulos(lista)
      setTotal(count)
      setContadores(ctd)
    } catch (err: unknown) {
      console.error('[ContasReceberPage] carregarTitulos error:', err)
    } finally {
      if (mountedRef.current) setCarregando(false)
    }
  }, [filtros])

  useEffect(() => {
    if (!authCarregando) carregarTitulos()
  }, [authCarregando, carregarTitulos])

  // ── Carrega near-due para o banner ────────────────────────
  const carregarNearDue = useCallback(async () => {
    const lista = await buscarTitulosNearVencimento()
    if (mountedRef.current) setTitulosNearDue(lista)
  }, [])

  useEffect(() => {
    if (!authCarregando) carregarNearDue()
  }, [authCarregando, carregarNearDue])

  // ── Auto-hide feedback ────────────────────────────────────
  useEffect(() => {
    if (!msgSucesso) return
    const t = setTimeout(() => { if (mountedRef.current) setMsgSucesso(null) }, 5000)
    return () => clearTimeout(t)
  }, [msgSucesso])

  useEffect(() => {
    if (!msgErro) return
    const t = setTimeout(() => { if (mountedRef.current) setMsgErro(null) }, 7000)
    return () => clearTimeout(t)
  }, [msgErro])

  // ── Handlers modal ────────────────────────────────────────
  function handleNovoLancamento()          { setTituloSelecionado(null); setModoModal('novo') }
  function handleEditar(t: ContaReceber)   { setTituloSelecionado(t); setModoModal('editar') }
  function handleVisualizar(t: ContaReceber) { setTituloSelecionado(t); setModoModal('visualizar') }
  function handleFecharModal()             { setModoModal(null); setTituloSelecionado(null) }
  function handleSalvo()                   { carregarTitulos(); carregarNearDue(); setModoModal(null); setTituloSelecionado(null) }
  function handleLimparFiltros()           { setFiltros(FILTROS_INICIAIS) }

  // ── Cancelar título (direto da tabela/lista) ──────────────
  async function handleCancelar(t: ContaReceber) {
    try {
      await cancelarTitulo(t.id)
      carregarTitulos()
      carregarNearDue()
    } catch (err: unknown) {
      setMsgErro(err instanceof Error ? err.message : 'Erro ao cancelar título')
    }
  }

  // ── Import handlers compartilhados (desktop header + mobile basebar) ──
  // Centraliza a lógica de import para evitar duplicação entre desktop/mobile
  async function processarImportTxtBb(file: File) {
    try {
      const conteudo = await lerArquivoTexto(file)
      const hash     = await calcularHashSha256(conteudo)

      const jaImportadoEm = await verificarHashRemessa(hash)
      if (jaImportadoEm) {
        setMsgErro(`TXT BB já importado em ${formatarDataBRSimples(jaImportadoEm)}.`)
        return
      }

      const registros = parseTxtBb(conteudo)
      if (registros.length === 0) {
        setMsgErro('Nenhum registro de dados encontrado no arquivo TXT BB.')
        return
      }

      const resultado = await processarRegistrosTxtBb(registros)
      await registrarRemessaImportada('txt_bb', file.name, hash, registros.length, resultado.vinculados, resultado.naoEncontrados)

      setMsgSucesso(
        `TXT BB: ${resultado.vinculados} vinculados, ${resultado.avulsosCriados} avulsos, ${resultado.jaExistentes} já existentes.`,
      )
      carregarTitulos()
      carregarNearDue()
    } catch (err: unknown) {
      setMsgErro(err instanceof Error ? err.message : 'Erro ao processar TXT BB')
    }
  }

  async function processarImportRem(file: File) {
    try {
      const conteudo = await lerArquivoTexto(file)
      const hash     = await calcularHashSha256(conteudo)

      const jaImportadoEm = await verificarHashRemessa(hash)
      if (jaImportadoEm) {
        setMsgErro(`REM já importado em ${formatarDataBRSimples(jaImportadoEm)}.`)
        return
      }

      const segmentos = parseRem(conteudo)
      if (segmentos.length === 0) {
        setMsgErro('Nenhum Segmento P encontrado no arquivo REM CNAB 240.')
        return
      }

      const resultado = await processarRegistrosRem(segmentos)
      await registrarRemessaImportada('rem', file.name, hash, segmentos.length, resultado.vinculados, resultado.naoEncontrados)

      setMsgSucesso(
        `REM: ${resultado.vinculados} vinculados, ${resultado.naoEncontrados} não encontrados.`,
      )
      carregarTitulos()
      carregarNearDue()
    } catch (err: unknown) {
      setMsgErro(err instanceof Error ? err.message : 'Erro ao processar REM')
    }
  }

  async function processarImportRet(file: File) {
    try {
      const conteudo  = await lerArquivoTexto(file)
      const hash      = await calcularHashSha256(conteudo)

      const jaImportadoEm = await verificarHashRemessa(hash)
      if (jaImportadoEm) {
        setMsgErro(`RET já importado em ${formatarDataBRSimples(jaImportadoEm)}.`)
        return
      }

      const ocorrencias = parseRet(conteudo)
      if (ocorrencias.length === 0) {
        setMsgErro('Nenhum Segmento T encontrado no arquivo RET CNAB 240.')
        return
      }

      const resultado = await processarRegistrosRet(ocorrencias)
      await registrarRemessaImportada('ret', file.name, hash, ocorrencias.length, resultado.baixados + resultado.atualizados, resultado.naoEncontrados)

      setMsgSucesso(
        `RET: ${resultado.baixados} baixados, ${resultado.atualizados} atualizados, ${resultado.naoEncontrados} não encontrados.`,
      )
      carregarTitulos()
      carregarNearDue()
    } catch (err: unknown) {
      setMsgErro(err instanceof Error ? err.message : 'Erro ao processar RET')
    }
  }

  // ── Avisos enviados ───────────────────────────────────────
  function handleAvisosEnviados(n: number) {
    setModalAvisosOpen(false)
    setMsgSucesso(`${n} aviso${n !== 1 ? 's' : ''} de vencimento registrado${n !== 1 ? 's' : ''}.`)
    carregarNearDue()
  }

  // ── Guard de hidratação SSR ───────────────────────────────
  if (isMobile === null || authCarregando) {
    return (
      <div style={{
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        height:          '100vh',
        fontFamily:      'Tahoma, Geneva, sans-serif',
        fontSize:        '13px',
        color:           '#5a84a6',
        background:      '#f0f4f7',
      }}>
        Carregando...
      </div>
    )
  }

  // ── Banner de pílulas de contadores ───────────────────────
  const ContadoresBanner = () => {
    const totalCtd = contadores.emAberto + contadores.atrasados + contadores.baixados + contadores.protestados + contadores.cancelados
    if (totalCtd === 0) return null

    const pilulas: { label: string; valor: number; bg: string; cor: string }[] = [
      { label: 'Em Aberto',   valor: contadores.emAberto,    bg: '#dcfce7', cor: '#166534' },
      { label: 'Atrasados',   valor: contadores.atrasados,   bg: '#fff5f5', cor: '#c0392b' },
      { label: 'Baixados',    valor: contadores.baixados,    bg: '#eaf3de', cor: '#27ae60' },
      { label: 'Protestados', valor: contadores.protestados, bg: '#fff4e6', cor: '#c06000' },
      { label: 'Cancelados',  valor: contadores.cancelados,  bg: '#f1f1f1', cor: '#888888' },
    ].filter(p => p.valor > 0)

    return (
      <div style={{
        display:      'flex',
        alignItems:   'center',
        gap:          '6px',
        margin:       '0 0 10px',
        padding:      '6px 12px',
        background:   '#f7fafc',
        border:       '1px solid #dde8f0',
        borderRadius: '5px',
        flexWrap:     'wrap',
        fontFamily:   'Tahoma, Geneva, sans-serif',
      }}>
        <span style={{ fontSize: '11px', color: '#5a84a6', marginRight: '2px', whiteSpace: 'nowrap' }}>
          Situação:
        </span>
        {pilulas.map(p => (
          <span
            key={p.label}
            style={{
              display:      'inline-flex',
              alignItems:   'center',
              gap:          '5px',
              padding:      '2px 10px',
              borderRadius: '10px',
              background:   p.bg,
              color:        p.cor,
              fontSize:     '11px',
              fontWeight:   700,
              whiteSpace:   'nowrap',
              border:       `1px solid ${p.cor}22`,
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 700 }}>{p.valor}</span>
            {p.label}
          </span>
        ))}
      </div>
    )
  }

  // ── Banner de feedback inline ─────────────────────────────
  const FeedbackBanner = () => (
    <>
      {msgSucesso && (
        <div style={{
          margin: '0 0 10px', padding: '8px 12px',
          background: '#eaf3de', border: '1px solid #b7d98f',
          borderRadius: '5px', color: '#3b6d11', fontSize: '12px',
          fontFamily: 'Tahoma, Geneva, sans-serif',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>
            <i className="ti ti-check" style={{ marginRight: '6px' }} aria-hidden="true" />
            {msgSucesso}
          </span>
          <button onClick={() => setMsgSucesso(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b6d11', fontSize: '14px' }}>✕</button>
        </div>
      )}
      {msgErro && (
        <div style={{
          margin: '0 0 10px', padding: '8px 12px',
          background: '#fef2f2', border: '1px solid #fca5a5',
          borderRadius: '5px', color: '#a32d2d', fontSize: '12px',
          fontFamily: 'Tahoma, Geneva, sans-serif',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>
            <i className="ti ti-alert-triangle" style={{ marginRight: '6px' }} aria-hidden="true" />
            {msgErro}
          </span>
          <button onClick={() => setMsgErro(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a32d2d', fontSize: '14px' }}>✕</button>
        </div>
      )}
    </>
  )

  // ── Banner de alerta near-due ─────────────────────────────
  const AlertaBanner = () => {
    if (titulosNearDue.length === 0) return null
    return (
      <div
        onClick={() => setModalAvisosOpen(true)}
        style={{
          margin:       '0 0 10px',
          padding:      '8px 14px',
          background:   '#fff8e1',
          border:       '1px solid #ffe082',
          borderRadius: '5px',
          color:        '#7a5c00',
          fontSize:     '12px',
          fontFamily:   'Tahoma, Geneva, sans-serif',
          cursor:       'pointer',
          display:      'flex',
          alignItems:   'center',
          gap:          '8px',
        }}
      >
        <i className="ti ti-bell-ringing" style={{ fontSize: '16px', flexShrink: 0 }} aria-hidden="true" />
        <span>
          <strong>{titulosNearDue.length} título{titulosNearDue.length !== 1 ? 's' : ''}</strong>
          {titulosNearDue.length === 1 ? ' vence' : ' vencem'} nos próximos 5 dias — clique para enviar avisos
        </span>
        <i className="ti ti-chevron-right" style={{ fontSize: '12px', marginLeft: 'auto', flexShrink: 0 }} aria-hidden="true" />
      </div>
    )
  }

  // ============================================================
  // Render — Desktop
  // ============================================================
  if (!isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f0f4f7', fontFamily: 'Tahoma, Geneva, sans-serif' }}>
        <Topbar usuario={usuario} />
        <NavBar />

        <main style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

          {/* Header: título + importar + backup + exportar + novo */}
          <ContasReceberHeader
            totalTitulos={total}
            titulos={titulos}
            usuario={usuario}
            onNovoLancamento={handleNovoLancamento}
            onRestaurado={carregarTitulos}
            onErro={setMsgErro}
            onSucesso={setMsgSucesso}
            onImportado={() => { carregarTitulos(); carregarNearDue() }}
          />

          <FeedbackBanner />
          <ContadoresBanner />
          <AlertaBanner />

          {/* Filtros: busca + vencimento + status */}
          <ContasReceberFiltros
            filtros={filtros}
            onFiltrosChange={setFiltros}
            onLimpar={handleLimparFiltros}
          />

          {/* Tabela ou loading */}
          {carregando ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#5a84a6', fontSize: '12px' }}>
              Carregando títulos...
            </div>
          ) : (
            <ContasReceberTabela
              titulos={titulos}
              onVisualizar={handleVisualizar}
              onEditar={handleEditar}
              onCancelar={handleCancelar}
            />
          )}
        </main>

        {/* Modal principal — key garante reset completo de estado ao trocar título */}
        {modoModal && (
          <ContasReceberModal
            modo={modoModal}
            titulo={tituloSelecionado}
            onFechar={handleFecharModal}
            onSalvo={handleSalvo}
            onEditar={handleEditar}
          />
        )}

        {/* Modal de avisos de vencimento */}
        {modalAvisosOpen && (
          <ContasReceberModalAvisos
            titulos={titulosNearDue}
            onFechar={() => setModalAvisosOpen(false)}
            onEnviado={handleAvisosEnviados}
          />
        )}
      </div>
    )
  }

  // ============================================================
  // Render — Mobile
  // ============================================================
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#f0f4f7', fontFamily: 'Tahoma, Geneva, sans-serif', paddingBottom: '70px' }}>
      <TopbarMobile usuario={usuario} onOpenDrawer={() => setDrawerAberto(true)} />
      <Drawer isOpen={drawerAberto} onClose={() => setDrawerAberto(false)} />

      <main style={{ flex: 1, padding: '10px 12px' }}>

        {/* Título e contador mobile */}
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#1a6094' }}>Contas a Receber</div>
          <div style={{ fontSize: '9px', color: '#5a84a6' }}>{total} título{total !== 1 ? 's' : ''}</div>
        </div>

        <FeedbackBanner />
        <ContadoresBanner />
        <AlertaBanner />

        {/* Filtros mobile */}
        <ContasReceberFiltros
          filtros={filtros}
          onFiltrosChange={setFiltros}
          onLimpar={handleLimparFiltros}
        />

        {/* Lista mobile ou loading */}
        {carregando ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#5a84a6', fontSize: '12px' }}>
            Carregando títulos...
          </div>
        ) : (
          <ContasReceberMobileList
            titulos={titulos}
            onVisualizar={handleVisualizar}
            onEditar={handleEditar}
            onCancelar={handleCancelar}
          />
        )}
      </main>

      {/* Basebar mobile com handlers de import centralizados */}
      <BasebarContasReceber
        titulos={titulos}
        usuario={usuario}
        onImportarTxtBb={processarImportTxtBb}
        onImportarRem={processarImportRem}
        onImportarRet={processarImportRet}
        onNovoLancamento={handleNovoLancamento}
        onRestaurado={carregarTitulos}
        onErro={setMsgErro}
        onSucesso={setMsgSucesso}
      />

      {/* Modal principal */}
      {modoModal && (
        <ContasReceberModal
          modo={modoModal}
          titulo={tituloSelecionado}
          onFechar={handleFecharModal}
          onSalvo={handleSalvo}
          onEditar={handleEditar}
        />
      )}

      {/* Modal de avisos */}
      {modalAvisosOpen && (
        <ContasReceberModalAvisos
          titulos={titulosNearDue}
          onFechar={() => setModalAvisosOpen(false)}
          onEnviado={handleAvisosEnviados}
        />
      )}
    </div>
  )
}

// ============================================================
// lerArquivoTexto()
// Lê um File como string UTF-8 usando FileReader
// ============================================================
function lerArquivoTexto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader   = new FileReader()
    reader.onload  = e => resolve(e.target?.result as string)
    reader.onerror = () => reject(new Error(`Erro ao ler: ${file.name}`))
    reader.readAsText(file, 'utf-8')
  })
}

// ============================================================
// formatarDataBRSimples()
// Formata ISO timestamp para dd/mm/yyyy para mensagens de erro
// ============================================================
function formatarDataBRSimples(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}
