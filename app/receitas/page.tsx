// ============================================================
// app/receitas/page.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Receitas
// Função: Página principal — orquestra todos os componentes
//         Gerencia estado global: lista, filtros, modal, drawer
//         Detecta desktop/mobile via matchMedia
//         Requer autenticação Supabase
// Conecta com: todos os componentes do módulo receitas e layout
// ============================================================

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  buscarReceitas,
  contarReceitas,
  excluirReceita,
  buscarTransportadoras,
} from '@/lib/receitasService'
import {
  buscarContadoresReceitasAberto,
  type ContadoresReceitasAberto,
} from '@/lib/contasReceberService'
import type { Receita, FiltrosReceitas, ModoModal, Transportadora } from '@/types/receitas'

// Layout
import Topbar from '@/components/layout/Topbar'
import TopbarMobile from '@/components/layout/TopbarMobile'
import NavBar from '@/components/layout/NavBar'
import Drawer from '@/components/layout/Drawer'

// Módulo Receitas
import ReceitasHeader from '@/components/receitas/ReceitasHeader'
import ReceitasFiltros from '@/components/receitas/ReceitasFiltros'
import ReceitasTabela from '@/components/receitas/ReceitasTabela'
import ReceitasMobileList from '@/components/receitas/ReceitasMobileList'
import ReceitasModal from '@/components/receitas/ReceitasModal'
import BasebarReceitas from '@/components/receitas/BasebarReceitas'
import ImportarXmlButton, { type ImportarXmlHandle } from '@/components/receitas/ImportarXmlButton'

// ============================================================
// Filtros iniciais
// ============================================================
const FILTROS_INICIAIS: FiltrosReceitas = {
  busca: '',
  dataEmissaoDe: '',
  dataEmissaoAte: '',
  prazo: '',
  formaPagamento: '',
  transportadoraId: '',
}

// ============================================================
// Page
// ============================================================
export default function ReceitasPage() {

  const router = useRouter()

  // ── Auth ──
  const [usuario,        setUsuario]        = useState<string>('')
  const [authCarregando, setAuthCarregando] = useState(true)

  // ── Dados ──
  const [receitas,        setReceitas]        = useState<Receita[]>([])
  const [total,           setTotal]           = useState(0)
  const [carregando,      setCarregando]      = useState(true)
  const [transportadoras, setTransportadoras] = useState<Transportadora[]>([])

  // ── Contadores de títulos em aberto (Feature 1) ──────────
  const [contadoresReceitas, setContadoresReceitas] = useState<ContadoresReceitasAberto>({
    nfsComAberto: 0, duplicatasEmAberto: 0,
  })

  // ── Filtros ──
  const [filtros, setFiltros] = useState<FiltrosReceitas>(FILTROS_INICIAIS)

  // ── Modal ──
  const [modoModal,         setModoModal]         = useState<ModoModal>(null)
  const [receitaSelecionada, setReceitaSelecionada] = useState<Receita | null>(null)

  // ── Mobile ──
  const [drawerAberto, setDrawerAberto] = useState(false)
  const [isMobile,     setIsMobile]     = useState<boolean | null>(null)

  // ── Ref para o ImportarXmlButton — aciona file picker direto ──
  const importarXmlRef = useRef<ImportarXmlHandle>(null)

  // ── Feedback inline ──
  const [msgSucesso, setMsgSucesso] = useState<string | null>(null)
  const [msgErro,    setMsgErro]    = useState<string | null>(null)

  // Detecção mobile — isMobile inicia como null para evitar hidratação SSR
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Auth — getUser() para validação server-side do JWT
  useEffect(() => {
    supabase.auth.getUser().then((result) => {
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

  // Carrega transportadoras para o filtro dropdown
  useEffect(() => {
    buscarTransportadoras().then(setTransportadoras)
  }, [])

  // ── Carregar receitas ──
  const carregarReceitas = useCallback(async () => {
    setCarregando(true)
    try {
      const [lista, count, ctd] = await Promise.all([
        buscarReceitas(filtros),
        contarReceitas(),
        buscarContadoresReceitasAberto(), // Feature 1: contador de NFs/duplicatas em aberto
      ])
      setReceitas(lista)
      setTotal(count)
      setContadoresReceitas(ctd)
    } catch (err) {
      console.error('[ReceitasPage] carregarReceitas error:', err)
    } finally {
      setCarregando(false)
    }
  }, [filtros])

  useEffect(() => {
    if (!authCarregando) carregarReceitas()
  }, [authCarregando, carregarReceitas])

  // Recarrega transportadoras após import para atualizar dropdown
  const handleImportado = useCallback(() => {
    carregarReceitas()
    buscarTransportadoras().then(setTransportadoras)
  }, [carregarReceitas])

  // Auto-hide feedback após 4s / 6s
  useEffect(() => {
    if (!msgSucesso) return
    const t = setTimeout(() => setMsgSucesso(null), 4000)
    return () => clearTimeout(t)
  }, [msgSucesso])

  useEffect(() => {
    if (!msgErro) return
    const t = setTimeout(() => setMsgErro(null), 6000)
    return () => clearTimeout(t)
  }, [msgErro])

  // ── Handlers modal ──
  function handleNovaReceita()          { setReceitaSelecionada(null); setModoModal('novo') }
  function handleEditar(r: Receita)     { setReceitaSelecionada(r); setModoModal('editar') }
  function handleVisualizar(r: Receita) { setReceitaSelecionada(r); setModoModal('visualizar') }
  function handleFecharModal()          { setModoModal(null); setReceitaSelecionada(null) }
  function handleSalvo()                { carregarReceitas(); setModoModal(null); setReceitaSelecionada(null) }
  function handleLimparFiltros()        { setFiltros(FILTROS_INICIAIS) }

  async function handleExcluir(r: Receita) {
    try {
      await excluirReceita(r.id)
      carregarReceitas()
    } catch (err: unknown) {
      setMsgErro(err instanceof Error ? err.message : 'Erro ao excluir')
    }
  }

  // ── Importar XML — aciona file picker diretamente via ref ──
  function handleImportarXml() {
    importarXmlRef.current?.triggerImport()
  }

  // ── Guarda hidratação SSR ──
  if (isMobile === null || authCarregando) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Tahoma, Geneva, sans-serif', fontSize: '13px', color: '#5a84a6', background: '#f0f4f7' }}>
        Carregando...
      </div>
    )
  }

  // ── Feedback inline ──
  const FeedbackBanner = () => (
    <>
      {msgSucesso && (
        <div style={{ margin: '0 0 10px', padding: '8px 12px', background: '#eaf3de', border: '1px solid #b7d98f', borderRadius: '5px', color: '#3b6d11', fontSize: '12px', fontFamily: 'Tahoma, Geneva, sans-serif', display: 'flex', justifyContent: 'space-between' }}>
          <span><i className="ti ti-check" style={{ marginRight: '6px' }} />{msgSucesso}</span>
          <button onClick={() => setMsgSucesso(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b6d11' }}>✕</button>
        </div>
      )}
      {msgErro && (
        <div style={{ margin: '0 0 10px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '5px', color: '#a32d2d', fontSize: '12px', fontFamily: 'Tahoma, Geneva, sans-serif', display: 'flex', justifyContent: 'space-between' }}>
          <span><i className="ti ti-alert-triangle" style={{ marginRight: '6px' }} />{msgErro}</span>
          <button onClick={() => setMsgErro(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a32d2d' }}>✕</button>
        </div>
      )}
    </>
  )

  // ============================================================
  // Render — Desktop
  // ============================================================
  if (!isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f0f4f7', fontFamily: 'Tahoma, Geneva, sans-serif' }}>
        <Topbar usuario={usuario} />
        <NavBar />
        <main style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

          <ReceitasHeader
            totalReceitas={total}
            receitas={receitas}
            usuario={usuario}
            onImportarXml={handleImportarXml}
            onNovaReceita={handleNovaReceita}
            onRestaurado={carregarReceitas}
            onErro={setMsgErro}
            onSucesso={setMsgSucesso}
          />

          {/* ImportarXmlButton headless — file picker acionado via ref */}
          <ImportarXmlButton
            ref={importarXmlRef}
            onImportado={handleImportado}
            onErro={setMsgErro}
          />

          {/* Feature 1: Banner de NFs com títulos em aberto em Contas a Receber */}
          {contadoresReceitas.nfsComAberto > 0 && (
            <div style={{
              margin:       '0 0 10px',
              padding:      '7px 14px',
              background:   '#e8f0f7',
              border:       '1px solid #c4d8eb',
              borderRadius: '5px',
              display:      'flex',
              alignItems:   'center',
              gap:          '10px',
              fontFamily:   'Tahoma, Geneva, sans-serif',
              fontSize:     '12px',
              color:        '#1a6094',
            }}>
              <i className="ti ti-receipt" style={{ fontSize: '15px', flexShrink: 0 }} aria-hidden="true" />
              <span>
                <strong>{contadoresReceitas.nfsComAberto}</strong>
                {contadoresReceitas.nfsComAberto === 1 ? ' NF com ' : ' NFs com '}
                <strong>{contadoresReceitas.duplicatasEmAberto}</strong>
                {contadoresReceitas.duplicatasEmAberto === 1 ? ' título em aberto' : ' títulos em aberto'}
                {' '}em Contas a Receber
              </span>
            </div>
          )}

          <FeedbackBanner />

          <ReceitasFiltros
            filtros={filtros}
            transportadoras={transportadoras}
            onFiltrosChange={setFiltros}
            onLimpar={handleLimparFiltros}
          />

          {carregando ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#5a84a6', fontSize: '12px' }}>
              Carregando receitas...
            </div>
          ) : (
            <ReceitasTabela
              receitas={receitas}
              onEditar={handleEditar}
              onVisualizar={handleVisualizar}
              onExcluir={handleExcluir}
            />
          )}
        </main>

        <ReceitasModal
          modo={modoModal}
          receita={receitaSelecionada}
          onFechar={handleFecharModal}
          onSalvo={handleSalvo}
        />
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

      {/* ImportarXmlButton headless — mesmo ref para mobile */}
      <ImportarXmlButton
        ref={importarXmlRef}
        onImportado={handleImportado}
        onErro={setMsgErro}
      />

      <main style={{ flex: 1, padding: '10px 12px' }}>
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#1a6094' }}>Receitas</div>
          <div style={{ fontSize: '9px', color: '#5a84a6' }}>{total} registros</div>
        </div>

        <FeedbackBanner />

        <ReceitasFiltros
          filtros={filtros}
          transportadoras={transportadoras}
          onFiltrosChange={setFiltros}
          onLimpar={handleLimparFiltros}
        />

        {carregando ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#5a84a6', fontSize: '12px' }}>
            Carregando receitas...
          </div>
        ) : (
          <ReceitasMobileList
            receitas={receitas}
            onEditar={handleEditar}
            onVisualizar={handleVisualizar}
            onExcluir={handleExcluir}
          />
        )}
      </main>

      <BasebarReceitas
        receitas={receitas}
        usuario={usuario}
        onImportarXml={handleImportarXml}
        onNovaReceita={handleNovaReceita}
        onRestaurado={carregarReceitas}
        onErro={setMsgErro}
        onSucesso={setMsgSucesso}
      />

      <ReceitasModal
        modo={modoModal}
        receita={receitaSelecionada}
        onFechar={handleFecharModal}
        onSalvo={handleSalvo}
      />
    </div>
  )
}
