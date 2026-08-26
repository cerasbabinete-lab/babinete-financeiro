// ============================================================
// app/relatorios/page.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Tela inicial do módulo — grade de 6 cards (Seção 5).
//         Módulo é somente-leitura, sem CRUD, sem filtro de lista —
//         por isso a página é bem mais enxuta que os módulos com
//         cadastro (Fornecedores, Clientes etc.): só autenticação +
//         layout + a grade de cards.
//         Resolve o 404 que já existia em produção — Drawer.tsx e
//         NavBar.tsx (componentes globais, não alterados) já tinham
//         a entrada "Relatórios" habilitada apontando para /relatorios
//         antes desta página existir.
// Conecta com: components/relatorios/RelatoriosGradeCards.tsx,
//              componentes de layout globais (Topbar, TopbarMobile,
//              NavBar, Drawer — não alterados)
// Referência: Especificacao_Modulo_Relatorios.md, Seção 5
// ============================================================

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { resolverUsernameExibicao } from '@/lib/authUsername'

import Topbar from '@/components/layout/Topbar'
import TopbarMobile from '@/components/layout/TopbarMobile'
import NavBar from '@/components/layout/NavBar'
import Drawer from '@/components/layout/Drawer'

import RelatoriosGradeCards from '@/components/relatorios/RelatoriosGradeCards'

// ============================================================
// Page
// ============================================================
export default function RelatoriosPage() {
  const router = useRouter()

  const [usuario, setUsuario] = useState<string>('')
  const [authCarregando, setAuthCarregando] = useState(true)
  const [drawerAberto, setDrawerAberto] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // ============================================================
  // Detecção de mobile (breakpoint 768px) — mesmo padrão dos
  // demais módulos (ex: app/fornecedores/page.tsx)
  // ============================================================
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setIsMobile(mq.matches) // eslint-disable-line react-hooks/set-state-in-effect
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // ============================================================
  // Verificação de autenticação — mesmo padrão dos demais módulos.
  // Sem controle de acesso por relatório nesta v1 (Seção 1.3 —
  // módulo de usuários ainda não existe; qualquer usuário
  // autenticado pode gerar qualquer um dos 6 relatórios)
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

        <main style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#1a6094' }}>
              Relatórios
            </div>
            <div style={{ fontSize: '11px', color: '#5a84a6' }}>
              Relatórios gerenciais sob demanda — não substitui a contabilidade oficial.
            </div>
          </div>

          <RelatoriosGradeCards />
        </main>
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
      <TopbarMobile usuario={usuario} onOpenDrawer={() => setDrawerAberto(true)} />
      <Drawer isOpen={drawerAberto} onClose={() => setDrawerAberto(false)} />

      <main style={{ flex: 1, padding: '10px 12px' }}>
        <div style={{ marginBottom: '10px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#1a6094' }}>
            Relatórios
          </div>
          <div style={{ fontSize: '9px', color: '#5a84a6' }}>
            Relatórios gerenciais sob demanda
          </div>
        </div>

        <RelatoriosGradeCards />
      </main>
    </div>
  )
}
