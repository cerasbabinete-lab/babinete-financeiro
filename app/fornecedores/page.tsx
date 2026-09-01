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
import { resolverUsernameExibicao } from '@/lib/authUsername'
import {
  buscarFornecedores,
  contarFornecedores,
  excluirFornecedor,
  atualizarTipoFornecedor,
  listarCategorias,
  listarChavesPixPreferenciais,
} from '@/lib/fornecedoresService'
import type { Fornecedor, FiltrosFornecedores, ModoModal, FornecedorCategoria, ChavePix } from '@/types/fornecedores'

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

  // Categorias de fornecedor (Seção 4) — buscadas UMA VEZ aqui e
  // repassadas por prop para FornecedoresModal, FornecedoresTabela e
  // FornecedoresMobileList, evitando 3 fetches redundantes na mesma tela
  const [categorias, setCategorias] = useState<FornecedorCategoria[]>([])

  // Chaves Pix preferenciais de todos os fornecedores (Seção 3.1) —
  // dado que NÃO está embutido no objeto Fornecedor (tabela separada),
  // necessário para a coluna "Chave Pix" da listagem
  const [chavesPixPreferenciais, setChavesPixPreferenciais] = useState<ChavePix[]>([])

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
    setIsMobile(mq.matches) // eslint-disable-line react-hooks/set-state-in-effect
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
      setUsuario(resolverUsernameExibicao(email))
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
    if (!authCarregando) carregarFornecedores() // eslint-disable-line react-hooks/set-state-in-effect
  }, [authCarregando, carregarFornecedores])

  // ============================================================
  // carregarCategorias
  // Busca a lista de categorias ativas — chamada uma vez após o login
  // e novamente sempre que CategoriasModal.tsx reporta uma alteração
  // (criação/rename/exclusão), via onCategoriasAlteradas repassado
  // adiante através de FornecedoresModal.tsx
  // ============================================================
  const carregarCategorias = useCallback(async () => {
    try {
      const lista = await listarCategorias()
      setCategorias(lista)
    } catch (err) {
      console.error('[FornecedoresPage] carregarCategorias error:', err)
    }
  }, [])

  useEffect(() => {
    if (!authCarregando) carregarCategorias() // eslint-disable-line react-hooks/set-state-in-effect
  }, [authCarregando, carregarCategorias])

  // ============================================================
  // carregarChavesPixPreferenciais
  // Busca as chaves Pix preferenciais de todos os fornecedores — usada
  // pela coluna "Chave Pix" da listagem (Seção 3.1). Chamada uma vez
  // após o login e de novo ao fechar o modal (handleFecharModal),
  // porque a troca de chave preferencial grava imediatamente no banco
  // (Seção 1.5) e pode acontecer sem o usuário clicar em "Gravar"
  // ============================================================
  const carregarChavesPixPreferenciais = useCallback(async () => {
    try {
      const lista = await listarChavesPixPreferenciais()
      setChavesPixPreferenciais(lista)
    } catch (err) {
      console.error('[FornecedoresPage] carregarChavesPixPreferenciais error:', err)
    }
  }, [])

  useEffect(() => {
    if (!authCarregando) carregarChavesPixPreferenciais() // eslint-disable-line react-hooks/set-state-in-effect
  }, [authCarregando, carregarChavesPixPreferenciais])

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

  async function handleExcluir(fornecedor: Fornecedor) {
    try {
      await excluirFornecedor(fornecedor.id)
      carregarFornecedores()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      console.error('[fornecedores/page] handleExcluir error:', msg)
    }
  }

  // ============================================================
  // handleAlterarTipo
  // Classificação rápida de tipo_fornecedor_id via select inline
  // (FornecedoresTabela.tsx / FornecedoresMobileList.tsx). Atualiza
  // o registro em fornecedores[] no lugar, em vez de chamar
  // carregarFornecedores() de novo — evita recarregar a lista inteira
  // (e perder posição de scroll/filtro) a cada classificação, já que
  // o objetivo é classificar os 19 fornecedores em sequência rápida
  // MIGRADO (Especificacao_Fornecedores_Pix_Categorias_WhatsApp.md,
  // Seção 4.5): parâmetro `tipo` (enum fechado) virou `categoriaId`
  // (FK numérica para fornecedor_categorias, ou null p/ "Não classificado")
  // ============================================================
  async function handleAlterarTipo(fornecedor: Fornecedor, categoriaId: number | null) {
    try {
      const atualizado = await atualizarTipoFornecedor(fornecedor.id, categoriaId)
      setFornecedores(prev =>
        prev.map(f => (f.id === atualizado.id ? atualizado : f))
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      console.error('[fornecedores/page] handleAlterarTipo error:', msg)
    }
  }

  // ============================================================
  // handleFecharModal
  // Além de fechar o modal, re-busca fornecedores e chaves Pix
  // preferenciais — Chaves Pix (Seção 1.5) e favorito WhatsApp
  // (Seção 2.3) gravam IMEDIATAMENTE no banco, independente do botão
  // "Gravar", então a listagem (colunas Chave Pix/WhatsApp) pode
  // ficar desatualizada se o usuário só fechar o modal sem salvar o
  // restante do formulário. carregarFornecedores() já traz o
  // contato_whatsapp atualizado; carregarChavesPixPreferenciais()
  // cobre o dado que mora na tabela separada
  // ============================================================
  function handleFecharModal() {
    setModoModal(null)
    setFornecedorSelecionado(null)
    carregarFornecedores()
    carregarChavesPixPreferenciais()
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
              onExcluir={handleExcluir}
              onAlterarTipo={handleAlterarTipo}
              categorias={categorias}
              chavesPixPreferenciais={chavesPixPreferenciais}
            />
          )}
        </main>

        <FornecedoresModal
          modo={modoModal}
          fornecedor={fornecedorSelecionado}
          onFechar={handleFecharModal}
          onSalvo={handleSalvo}
          categorias={categorias}
          onCategoriasAlteradas={carregarCategorias}
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
            onExcluir={handleExcluir}
            onAlterarTipo={handleAlterarTipo}
            categorias={categorias}
            chavesPixPreferenciais={chavesPixPreferenciais}
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
        categorias={categorias}
        onCategoriasAlteradas={carregarCategorias}
      />
    </div>
  )
}
