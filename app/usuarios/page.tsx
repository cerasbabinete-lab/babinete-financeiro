// ============================================================
// app/usuarios/page.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Usuários
// Função: Página principal — Lista de Usuários (Especificação §4).
//         Módulo inteiro é Admin-only (§2.3): checagem de acesso
//         no client (redireciona quem não for Admin) além da
//         checagem já feita em toda rota de API (defesa em
//         profundidade — a checagem que realmente importa é a do
//         servidor, esta aqui só evita expor a tela por um instante).
//         Sem separação Desktop/Mobile no CONTEÚDO (UsuariosTabela
//         já é única pros dois — Especificação §4, decisão
//         explícita), mas mantém a moldura padrão do projeto
//         (Topbar+NavBar no desktop, TopbarMobile+Drawer no mobile).
// Conecta com: components/usuarios/UsuariosTabela.tsx,
//              components/usuarios/UsuarioFormModal.tsx,
//              pages/api/usuarios/listar.ts,
//              pages/api/usuarios/resetar-senha.ts,
//              pages/api/usuarios/excluir.ts
// ============================================================

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { resolverUsernameExibicao } from '@/lib/authUsername'
import type { Usuario, UsuarioPermissao } from '@/types/usuarios'

// Layout — componentes globais, reutilizados sem alteração
import Topbar from '@/components/layout/Topbar'
import TopbarMobile from '@/components/layout/TopbarMobile'
import NavBar from '@/components/layout/NavBar'
import Drawer from '@/components/layout/Drawer'

// Módulo Usuários
import UsuariosTabela from '@/components/usuarios/UsuariosTabela'
import UsuarioFormModal from '@/components/usuarios/UsuarioFormModal'
import VisitanteFormModal from '@/components/usuarios/VisitanteFormModal'
import LogAcessoTabela from '@/components/usuarios/LogAcessoTabela'

type ModoModal = 'novo' | 'editar' | null
type AbaPagina = 'usuarios' | 'log'

export default function UsuariosPage() {

  const router = useRouter()

  const [usuarioLogado, setUsuarioLogado] = useState<string>('')
  const [authCarregando, setAuthCarregando] = useState(true)
  const [abaAtiva, setAbaAtiva] = useState<AbaPagina>('usuarios')
  // Rastreia se o mousedown começou no overlay do dialogReset —
  // evita fechar ao selecionar texto arrastando o mouse (ex.: copiar
  // o e-mail exibido) e soltar fora da caixa
  const mousedownNoOverlayRef = useRef(false)

  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erroLista, setErroLista] = useState<string | null>(null)

  const [modoModal, setModoModal] = useState<ModoModal>(null)
  const [modalVisitanteAberto, setModalVisitanteAberto] = useState(false)
  const [usuarioSelecionado, setUsuarioSelecionado] = useState<Usuario | null>(null)
  const [permissoesSelecionadas, setPermissoesSelecionadas] = useState<UsuarioPermissao[] | null>(null)

  const [resetInfo, setResetInfo] = useState<{ email: string; nome: string } | null>(null)

  // isMobile inicia como null (guard de hidratação SSR — padrão do projeto)
  const [isMobile, setIsMobile] = useState<boolean | null>(null)
  const [drawerAberto, setDrawerAberto] = useState(false)

  // ============================================================
  // Detecção de mobile (breakpoint 768px) — mesmo padrão de Fornecedores/Clientes
  // ============================================================
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setIsMobile(mq.matches) // eslint-disable-line react-hooks/set-state-in-effect
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // ============================================================
  // Verificação de autenticação + autorização (Admin-only)
  // ============================================================
  useEffect(() => {
    // getUser() valida o JWT contra o servidor Supabase (mais seguro
    // que getSession(), que só lê o localStorage) — FIX-10, Handoff_
    // Modulo_Usuarios_Audit_para_QA.md
    supabase.auth.getUser().then(({ data: { user }, error }) => {
      if (!user || error) {
        router.push('/login')
        return
      }
      const emailLogin = user.email ?? ''
      const usernameAtual = resolverUsernameExibicao(emailLogin)
      setUsuarioLogado(usernameAtual)

      // Módulo inteiro é Admin-only — quem não for o Admin fixo é
      // redirecionado para a tela principal. A checagem que
      // efetivamente protege os dados acontece nas rotas de API
      // (ehAdmin() em lib/usuariosService.ts); esta aqui só evita
      // mostrar a tela vazia/quebrada por um instante.
      if (usernameAtual !== process.env.NEXT_PUBLIC_ADMIN_USERNAME) {
        router.push('/')
        return
      }

      setAuthCarregando(false)
    }).catch(() => {
      router.push('/login')
    })

    // Listener reativo — redireciona imediatamente em SIGNED_OUT
    // (logout remoto, sessão expirada, logout em outra aba) — FIX-11
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.push('/login')
    })

    return () => subscription.unsubscribe()
  }, [router])

  // ============================================================
  // obterToken()
  // ============================================================
  async function obterToken(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  // ============================================================
  // carregarUsuarios — busca a lista via listar.ts (RLS bloqueia
  // leitura direta do browser, ver sql/usuarios.sql)
  // ============================================================
  const carregarUsuarios = useCallback(async () => {
    setCarregando(true)
    setErroLista(null)
    try {
      const token = await obterToken()
      const res = await fetch('/api/usuarios/listar', {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.erro ?? 'Erro ao carregar usuários')
      setUsuarios(json.usuarios)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido ao carregar usuários.'
      console.error('[usuarios/page] carregarUsuarios error:', msg)
      setErroLista(msg)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    if (!authCarregando) carregarUsuarios() // eslint-disable-line react-hooks/set-state-in-effect
  }, [authCarregando, carregarUsuarios])

  // ============================================================
  // Handlers do modal
  // ============================================================
  function handleNovoUsuario() {
    setUsuarioSelecionado(null)
    setPermissoesSelecionadas(null)
    setModoModal('novo')
  }

  // Busca o usuário + suas 50 permissões antes de abrir o modal de
  // edição (listar.ts?id= — ver pages/api/usuarios/listar.ts)
  async function handleEditar(usuario: Usuario) {
    try {
      const token = await obterToken()
      const res = await fetch(`/api/usuarios/listar?id=${usuario.id}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.erro ?? 'Erro ao buscar usuário')
      setUsuarioSelecionado(json.usuario)
      setPermissoesSelecionadas(json.permissoes)
      setModoModal('editar')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      console.error('[usuarios/page] handleEditar error:', msg)
      setErroLista(msg)
    }
  }

  async function handleResetarSenha(usuario: Usuario, novaSenha: string) {
    try {
      const token = await obterToken()
      const res = await fetch('/api/usuarios/resetar-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ usuarioId: usuario.id, novaSenha }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.erro ?? 'Erro ao resetar senha')
      setResetInfo({ email: json.emailEnviadoPara, nome: usuario.nome_completo })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      console.error('[usuarios/page] handleResetarSenha error:', msg)
      setErroLista(msg)
    }
  }

  async function handleExcluir(usuario: Usuario) {
    try {
      const token = await obterToken()
      const res = await fetch('/api/usuarios/excluir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ usuarioId: usuario.id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.erro ?? 'Erro ao excluir usuário')
      carregarUsuarios()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      console.error('[usuarios/page] handleExcluir error:', msg)
      setErroLista(msg)
    }
  }

  function handleFecharModal() {
    setModoModal(null)
    setUsuarioSelecionado(null)
    setPermissoesSelecionadas(null)
  }

  function handleSalvo() {
    handleFecharModal()
    carregarUsuarios()
  }

  // ============================================================
  // Aguarda autenticação/autorização
  // ============================================================
  if (authCarregando || isMobile === null) {
    return (
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh',
          fontFamily: 'Tahoma, Geneva, sans-serif', fontSize: '13px', color: '#5a84a6', background: '#f0f4f7',
        }}
      >
        Carregando...
      </div>
    )
  }

  // ============================================================
  // Header comum (título + botão Novo Usuário) — reaproveitado nos
  // dois breakpoints, sem componente separado (tela simples demais
  // pra justificar um Header dedicado como FornecedoresHeader.tsx)
  // ============================================================
  const headerConteudo = (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <div style={{ fontSize: isMobile ? '13px' : '15px', fontWeight: 700, color: '#1a6094' }}>Usuários</div>
          <div style={{ fontSize: '10px', color: '#5a84a6' }}>{usuarios.length} usuário{usuarios.length === 1 ? '' : 's'} cadastrado{usuarios.length === 1 ? '' : 's'}</div>
        </div>
        {abaAtiva === 'usuarios' && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setModalVisitanteAberto(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 14px', fontSize: '12px', fontWeight: 700,
                fontFamily: 'Tahoma, Geneva, sans-serif', background: '#ffffff', color: '#1a6094', border: '1px solid #1a6094',
                borderRadius: '5px', cursor: 'pointer',
              }}
            >
              <i className="ti ti-eye" aria-hidden="true" /> Novo Visitante
            </button>
            <button
              onClick={handleNovoUsuario}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 14px', fontSize: '12px', fontWeight: 700,
                fontFamily: 'Tahoma, Geneva, sans-serif', background: '#1a6094', color: '#ffffff', border: '1px solid #1a6094',
                borderRadius: '5px', cursor: 'pointer',
              }}
            >
              <i className="ti ti-plus" aria-hidden="true" /> Novo Usuário
            </button>
          </div>
        )}
      </div>

      {/* Abas — Log de Acesso é Admin-only, mas o módulo inteiro já é
          (checagem de acesso no topo desta página), então não precisa
          de gate extra aqui */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid #dde8f0', marginBottom: '12px' }}>
        {(['usuarios', 'log'] as const).map(aba => (
          <button
            key={aba}
            onClick={() => setAbaAtiva(aba)}
            style={{
              padding: '7px 14px', fontSize: '12px', fontWeight: 700, fontFamily: 'Tahoma, Geneva, sans-serif',
              background: 'none', border: 'none', borderBottom: abaAtiva === aba ? '2px solid #1a6094' : '2px solid transparent',
              color: abaAtiva === aba ? '#1a6094' : '#5a84a6', cursor: 'pointer', marginBottom: '-1px',
            }}
          >
            {aba === 'usuarios' ? 'Usuários' : 'Log de Acesso'}
          </button>
        ))}
      </div>
    </div>
  )

  // ============================================================
  // Dialog de senha resetada — mesmo espírito do overlay de senha
  // gerada no UsuarioFormModal.tsx, mas independente (dispara pela
  // tabela, não pelo modal de edição)
  // ============================================================
  const dialogReset = resetInfo && (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1100,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
        fontFamily: 'Tahoma, Geneva, sans-serif',
      }}
      onMouseDown={e => { mousedownNoOverlayRef.current = e.target === e.currentTarget }}
      onClick={e => {
        if (mousedownNoOverlayRef.current && e.target === e.currentTarget) setResetInfo(null)
        mousedownNoOverlayRef.current = false
      }}
    >
      <div style={{ background: '#ffffff', borderRadius: '8px', width: '100%', maxWidth: '380px', overflow: 'hidden' }}>
        <div style={{ background: '#1a6094', padding: '10px 16px' }}>
          <span style={{ color: '#ffffff', fontSize: '13px', fontWeight: 700 }}>Senha redefinida</span>
        </div>
        <div style={{ padding: '20px 16px' }}>
          <p style={{ fontSize: '12px', color: '#3a6080', marginBottom: '16px' }}>
            A senha de <strong>{resetInfo.nome}</strong> foi atualizada, e um e-mail avisando foi enviado para <strong>{resetInfo.email}</strong>.
          </p>
          <button
            onClick={() => setResetInfo(null)}
            style={{
              width: '100%', padding: '7px', fontSize: '12px', fontWeight: 700, fontFamily: 'Tahoma, Geneva, sans-serif',
              background: '#1a6094', color: '#ffffff', border: '1px solid #1a6094', borderRadius: '5px', cursor: 'pointer',
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )

  // ============================================================
  // Render — Desktop
  // ============================================================
  if (!isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f0f4f7', fontFamily: 'Tahoma, Geneva, sans-serif' }}>
        <Topbar usuario={usuarioLogado} />
        <NavBar />

        <main style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {headerConteudo}
          {abaAtiva === 'usuarios' ? (
            <UsuariosTabela
              usuarios={usuarios}
              carregando={carregando}
              erro={erroLista}
              usuarioLogado={usuarioLogado}
              onEditar={handleEditar}
              onResetarSenha={handleResetarSenha}
              onExcluir={handleExcluir}
            />
          ) : (
            <LogAcessoTabela />
          )}
        </main>

        {modoModal && (
          <UsuarioFormModal
            modo={modoModal}
            usuarioInicial={usuarioSelecionado}
            permissoesIniciais={permissoesSelecionadas}
            onFechar={handleFecharModal}
            onSalvo={handleSalvo}
          />
        )}
        {modalVisitanteAberto && (
          <VisitanteFormModal
            onFechar={() => setModalVisitanteAberto(false)}
            onSalvo={handleSalvo}
          />
        )}
        {dialogReset}
      </div>
    )
  }

  // ============================================================
  // Render — Mobile
  // ============================================================
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#f0f4f7', fontFamily: 'Tahoma, Geneva, sans-serif', paddingBottom: '24px' }}>
      <TopbarMobile usuario={usuarioLogado} onOpenDrawer={() => setDrawerAberto(true)} />
      <Drawer isOpen={drawerAberto} onClose={() => setDrawerAberto(false)} />

      <main style={{ flex: 1, padding: '10px 12px' }}>
        {headerConteudo}
        {abaAtiva === 'usuarios' ? (
          <UsuariosTabela
            usuarios={usuarios}
            carregando={carregando}
            erro={erroLista}
            usuarioLogado={usuarioLogado}
            onEditar={handleEditar}
            onResetarSenha={handleResetarSenha}
            onExcluir={handleExcluir}
          />
        ) : (
          <LogAcessoTabela />
        )}
      </main>

      {modoModal && (
        <UsuarioFormModal
          modo={modoModal}
          usuarioInicial={usuarioSelecionado}
          permissoesIniciais={permissoesSelecionadas}
          onFechar={handleFecharModal}
          onSalvo={handleSalvo}
        />
      )}
      {modalVisitanteAberto && (
        <VisitanteFormModal
          onFechar={() => setModalVisitanteAberto(false)}
          onSalvo={handleSalvo}
        />
      )}
      {dialogReset}
    </div>
  )
}
