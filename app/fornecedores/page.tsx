// ============================================================
// app/fornecedores/page.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Fornecedores
// Função: Página principal — clone funcional de app/clientes/page.tsx
//         Sem lógica de Lista/Status, sem filtros dropdown
//         Reutiliza Topbar, TopbarMobile, NavBar, Drawer, Basebar
//         (componentes globais — NÃO alterados)
// Conecta com: todos os componentes do módulo fornecedores e layout
// ============================================================

'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { buscarFornecedores, contarFornecedores } from '@/lib/fornecedoresService'
import type { Fornecedor, FiltrosFornecedores, ModoModal } from '@/types/fornecedores'

// Layout — componentes globais, reutilizados sem alteração
import Topbar from '@/components/layout/Topbar'
import TopbarMobile from '@/components/layout/TopbarMobile'
import NavBar from '@/components/layout/NavBar'
import Drawer from '@/components/layout/Drawer'

// Módulo Fornecedores
import FornecedoresHeader from '@/components/fornecedores/FornecedoresHeader'
import FornecedoresFiltros from '@/components/fornecedores/FornecedoresFiltros'
import FornecedoresTabela from '@/components/fornecedores/FornecedoresTabela'
import FornecedoresMobileList from '@/components/fornecedores/FornecedoresMobileList'
import FornecedoresModal from '@/components/fornecedores/FornecedoresModal'
import BasebarFornecedores from '@/components/fornecedores/BasebarFornecedores'

// ============================================================
// Filtros iniciais padrão — sem lista/status, só busca
// ============================================================
const FILTROS_INICIAIS: FiltrosFornecedores = {
  busca: '',
}

// ============================================================
// Page
// ============================================================
export default function FornecedoresPage() {

  const router = useRouter()

  const [usuario, setUsuario] = useState<string>('')
  const [authCarregando, setAuthCarregando] = useState(true)

  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [total, setTotal] = useState(0)
  const [carregando, setCarregando] = useState(true)

  const [filtros, setFiltros] = useState<FiltrosFornecedores>(FILTROS_INICIAIS)

  const [modoModal, setModoModal] = useState<ModoModal>(null)
  const [fornecedorSelecionado, setFornecedorSelecionado] = useState<Fornecedor | null>(null)

  const [drawerAberto, setDrawerAberto] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // ============================================================
  // Detecção de mobile (breakpoint 768px) — mesmo padrão de Clientes
  // ============================================================
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // ============================================================
  // Verificação de autenticação
  // ============================================================
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/login')
        return
      }
      const email = session.user.email ?? ''
      setUsuario(email.split('@')[0])
      setAuthCarregando(false)
    })
  }, [router])

  // ============================================================
  // carregarFornecedores
  // Busca lista filtrada e atualiza contador
  // ============================================================
  const carregarFornecedores = useCallback(async () => {
    setCarregando(true)
    try {
      const [lista, totalRegistros] = await Promise.all([
        buscarFornecedores(filtros),
        contarFornecedores(),
      ])
      setFornecedores(lista)
      setTotal(totalRegistros)
    } catch (err) {
      console.error('[FornecedoresPage] carregarFornecedores error:', err)
    } finally {
      setCarregando(false)
    }
  }, [filtros])

  useEffect(() => {
    if (!authCarregando) carregarFornecedores()
  }, [authCarregando, carregarFornecedores])

  // ============================================================
  // Handlers do modal
  // ============================================================
  function handleNovoFornecedor() {
    setFornecedorSelecionado(null)
    setModoModal('novo')
  }

  function handleEditar(fornecedor: Fornecedor) {
    setFornecedorSelecionado(fornecedor)
    setModoModal('editar')
  }

  function handleVisualizar(fornecedor: Fornecedor) {
    setFornecedorSelecionado(fornecedor)
    setModoModal('visualizar')
  }

  function handleFecharModal() {
    setModoModal(null)
    setFornecedorSelecionado(null)
  }

  function handleSalvo() {
    carregarFornecedores()
  }

  function handleFiltrosChange(novosFiltros: FiltrosFornecedores) {
    setFiltros(novosFiltros)
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
        <Topbar usuario={usuario} />
        <NavBar />

        <main
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 20px',
          }}
        >
          <FornecedoresHeader
            total={total}
            fornecedores={fornecedores}
            usuario={usuario}
            onNovoFornecedor={handleNovoFornecedor}
            onRestaurado={carregarFornecedores}
          />

          <FornecedoresFiltros
            filtros={filtros}
            onFiltrosChange={handleFiltrosChange}
          />

          {carregando ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#5a84a6', fontSize: '12px' }}>
              Carregando fornecedores...
            </div>
          ) : (
            <FornecedoresTabela
              fornecedores={fornecedores}
              onEditar={handleEditar}
              onVisualizar={handleVisualizar}
            />
          )}
        </main>

        <FornecedoresModal
          modo={modoModal}
          fornecedor={fornecedorSelecionado}
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
        paddingBottom: '56px',
      }}
    >
      <TopbarMobile
        usuario={usuario}
        onOpenDrawer={() => setDrawerAberto(true)}
      />

      <Drawer
        isOpen={drawerAberto}
        onClose={() => setDrawerAberto(false)}
      />

      <main style={{ flex: 1, padding: '10px 12px' }}>

        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#1a6094' }}>
            Carteira de Fornecedores
          </div>
          <div style={{ fontSize: '9px', color: '#5a84a6' }}>
            {total} fornecedores
          </div>
        </div>

        <FornecedoresFiltros
          filtros={filtros}
          onFiltrosChange={handleFiltrosChange}
        />

        {carregando ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#5a84a6', fontSize: '12px' }}>
            Carregando fornecedores...
          </div>
        ) : (
          <FornecedoresMobileList
            fornecedores={fornecedores}
            onEditar={handleEditar}
            onVisualizar={handleVisualizar}
          />
        )}
      </main>

      {/* Basebar específica do módulo Fornecedores — componente separado
          criado porque o Basebar.tsx global está acoplado ao módulo
          Clientes (props/imports específicos) e está marcado como
          "não alterar" pelo usuário. */}
      <BasebarFornecedores
        fornecedores={fornecedores}
        usuario={usuario}
        onNovoFornecedor={handleNovoFornecedor}
        onRestaurado={carregarFornecedores}
      />

      <FornecedoresModal
        modo={modoModal}
        fornecedor={fornecedorSelecionado}
        onFechar={handleFecharModal}
        onSalvo={handleSalvo}
      />
    </div>
  )
}
