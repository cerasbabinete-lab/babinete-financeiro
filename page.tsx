// ============================================================
// app/clientes/page.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Clientes
// Função: Página principal — orquestra todos os componentes
//         Gerencia estado global: lista, filtros, modal, drawer
//         Detecta desktop/mobile via useMediaQuery
//         Requer autenticação Supabase
// Conecta com: todos os componentes do módulo clientes e layout
// ============================================================

'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { buscarClientes, contarClientesAtivos } from '@/lib/clientesService'
import type { Cliente, FiltrosClientes, ModoModal } from '@/types/clientes'

// Layout
import Topbar from '@/components/layout/Topbar'
import TopbarMobile from '@/components/layout/TopbarMobile'
import NavBar from '@/components/layout/NavBar'
import Drawer from '@/components/layout/Drawer'
import Basebar from '@/components/layout/Basebar'

// Módulo Clientes
import ClientesHeader from '@/components/clientes/ClientesHeader'
import ClientesFiltros from '@/components/clientes/ClientesFiltros'
import ClientesTabela from '@/components/clientes/ClientesTabela'
import ClientesMobileList from '@/components/clientes/ClientesMobileList'
import ClientesModal from '@/components/clientes/ClientesModal'

// ============================================================
// Filtros iniciais padrão
// ============================================================
const FILTROS_INICIAIS: FiltrosClientes = {
  busca: '',
  lista: 'todas',
  status: 'ativos',
}

// ============================================================
// Page
// ============================================================
export default function ClientesPage() {

  const router = useRouter()

  // ============================================================
  // Estado de autenticação
  // ============================================================
  const [usuario, setUsuario] = useState<string>('')
  const [authCarregando, setAuthCarregando] = useState(true)

  // ============================================================
  // Estado da lista de clientes
  // ============================================================
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [totalAtivos, setTotalAtivos] = useState(0)
  const [carregando, setCarregando] = useState(true)

  // ============================================================
  // Estado dos filtros
  // ============================================================
  const [filtros, setFiltros] = useState<FiltrosClientes>(FILTROS_INICIAIS)

  // ============================================================
  // Estado do modal
  // ============================================================
  const [modoModal, setModoModal] = useState<ModoModal>(null)
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null)

  // ============================================================
  // Estado do drawer mobile
  // ============================================================
  const [drawerAberto, setDrawerAberto] = useState(false)

  // ============================================================
  // Detecção de mobile (breakpoint 768px)
  // Inicializado como null para evitar SSR/hydration mismatch:
  // o servidor não conhece o viewport, então adiamos o render
  // do layout até o cliente resolver isMobile via matchMedia
  // ============================================================
  const [isMobile, setIsMobile] = useState<boolean | null>(null)

  useEffect(() => {
    // Resolve o breakpoint client-side na primeira montagem
    const mq = window.matchMedia('(max-width: 768px)')
    // Padrão correto para inicializar estado de media query no client-side:
    // setState síncrono aqui é intencional — resolve o viewport antes do render
    setIsMobile(mq.matches) // eslint-disable-line react-hooks/set-state-in-effect
    // Atualiza dinamicamente se o viewport mudar (ex: rotação)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // ============================================================
  // Verificação de autenticação
  // Redireciona para /login se não autenticado
  // Também escuta mudanças de sessão em tempo real:
  // se o JWT expirar ou o usuário fizer logout em outra aba,
  // o evento SIGNED_OUT redireciona imediatamente para /login
  // ============================================================
  useEffect(() => {
    // Verifica sessão inicial ao montar o componente
    // getUser() faz validação server-side do JWT — mais seguro que
    // getSession() que apenas lê o localStorage sem verificar com o servidor
    supabase.auth.getUser().then(({ data: { user }, error }) => {
      if (error || !user) {
        // JWT inválido ou expirado: redireciona — authCarregando permanece
        // true para bloquear carregarClientes() durante o redirect
        router.push('/login')
        return
      }
      // Usuário verificado pelo servidor: extrai nome do email (parte antes do @)
      const email = user.email ?? ''
      setUsuario(email.split('@')[0])
      setAuthCarregando(false)
    })

    // Listener de mudanças de sessão — cobre expiração de JWT
    // e logout em outra aba/dispositivo
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        // Sessão encerrada em tempo real: redireciona para login
        router.push('/login')
      }
    })

    // Cancela o listener ao desmontar o componente
    return () => subscription.unsubscribe()
  }, [router])

  // ============================================================
  // carregarClientes
  // Busca lista filtrada e atualiza contador de ativos
  // ============================================================
  const carregarClientes = useCallback(async () => {
    setCarregando(true)
    try {
      const [lista, total] = await Promise.all([
        buscarClientes(filtros),
        contarClientesAtivos(),
      ])
      setClientes(lista)
      setTotalAtivos(total)
    } catch (err) {
      console.error('[ClientesPage] carregarClientes error:', err)
    } finally {
      setCarregando(false)
    }
  }, [filtros])

  // Recarrega sempre que os filtros mudarem (e auth estiver pronta)
  useEffect(() => {
    // carregarClientes é um async data-fetcher que chama múltiplos setState
    // internamente — padrão correto para disparar fetch em resposta a mudança
    // de estado (filtros, auth); useReducer não se aplica aqui
    if (!authCarregando) carregarClientes() // eslint-disable-line react-hooks/set-state-in-effect
  }, [authCarregando, carregarClientes])

  // ============================================================
  // Handlers do modal
  // ============================================================
  function handleNovoCliente() {
    setClienteSelecionado(null)
    setModoModal('novo')
  }

  function handleEditar(cliente: Cliente) {
    setClienteSelecionado(cliente)
    setModoModal('editar')
  }

  function handleVisualizar(cliente: Cliente) {
    setClienteSelecionado(cliente)
    setModoModal('visualizar')
  }

  function handleFecharModal() {
    setModoModal(null)
    setClienteSelecionado(null)
  }

  function handleSalvo() {
    carregarClientes()
  }

  // ============================================================
  // Handler de filtros
  // ============================================================
  function handleFiltrosChange(novosFiltros: FiltrosClientes) {
    setFiltros(novosFiltros)
  }

  // ============================================================
  // Aguarda resolução do viewport (isMobile ainda desconhecido)
  // Renderiza skeleton neutro para evitar flash de layout errado
  // isMobile === null apenas no primeiro frame client-side
  // ============================================================
  if (isMobile === null) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          fontFamily: 'Tahoma, Geneva, sans-serif',
          fontSize: '13px',
          color: '#5a84a6',
          background: '#f0f4f7',
        }}
      />
    )
  }

  // ============================================================
  // Aguarda autenticação
  // ============================================================
  if (authCarregando) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          fontFamily: 'Tahoma, Geneva, sans-serif',
          fontSize: '13px',
          color: '#5a84a6',
          background: '#f0f4f7',
        }}
      >
        Carregando...
      </div>
    )
  }

  // ============================================================
  // Render — Desktop
  // ============================================================
  if (!isMobile) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          background: '#f0f4f7',
          fontFamily: 'Tahoma, Geneva, sans-serif',
        }}
      >
        {/* Topbar */}
        <Topbar usuario={usuario} />

        {/* NavBar */}
        <NavBar />

        {/* Conteúdo principal */}
        <main
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 20px',
          }}
        >
          {/* Header: título + contador + botões */}
          <ClientesHeader
            totalAtivos={totalAtivos}
            clientes={clientes}
            usuario={usuario}
            onNovoCliente={handleNovoCliente}
            onRestaurado={carregarClientes}
          />

          {/* Filtros: busca + dropdowns */}
          <ClientesFiltros
            filtros={filtros}
            onFiltrosChange={handleFiltrosChange}
          />

          {/* Tabela de clientes */}
          {carregando ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#5a84a6', fontSize: '12px' }}>
              Carregando clientes...
            </div>
          ) : (
            <ClientesTabela
              clientes={clientes}
              onEditar={handleEditar}
              onVisualizar={handleVisualizar}
            />
          )}
        </main>

        {/* Modal */}
        <ClientesModal
          modo={modoModal}
          cliente={clienteSelecionado}
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        background: '#f0f4f7',
        fontFamily: 'Tahoma, Geneva, sans-serif',
        paddingBottom: '56px', // espaço para a Basebar fixa
      }}
    >
      {/* Topbar mobile + datetime strip */}
      <TopbarMobile
        usuario={usuario}
        onOpenDrawer={() => setDrawerAberto(true)}
      />

      {/* Drawer lateral */}
      <Drawer
        isOpen={drawerAberto}
        onClose={() => setDrawerAberto(false)}
      />

      {/* Conteúdo */}
      <main style={{ flex: 1, padding: '10px 12px' }}>

        {/* Header mobile: título + contador */}
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#1a6094' }}>
            Carteira de Clientes
          </div>
          <div style={{ fontSize: '9px', color: '#5a84a6' }}>
            {totalAtivos} clientes ativos
          </div>
        </div>

        {/* Filtros */}
        <ClientesFiltros
          filtros={filtros}
          onFiltrosChange={handleFiltrosChange}
        />

        {/* Lista mobile */}
        {carregando ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#5a84a6', fontSize: '12px' }}>
            Carregando clientes...
          </div>
        ) : (
          <ClientesMobileList
            clientes={clientes}
            onEditar={handleEditar}
            onVisualizar={handleVisualizar}
          />
        )}
      </main>

      {/* Basebar fixa */}
      <Basebar
        clientes={clientes}
        usuario={usuario}
        onNovoCliente={handleNovoCliente}
        onRestaurado={carregarClientes}
      />

      {/* Modal */}
      <ClientesModal
        modo={modoModal}
        cliente={clienteSelecionado}
        onFechar={handleFecharModal}
        onSalvo={handleSalvo}
      />
    </div>
  )
}
