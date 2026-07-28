// ============================================================
// components/relatorios/RelatorioPageShell.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Shell compartilhado de autenticação + layout responsivo
//         (Topbar/NavBar desktop, TopbarMobile/Drawer mobile) para
//         as rotas de relatório individuais. Mesmo padrão usado em
//         app/relatorios/page.tsx e app/relatorios/faturamento/
//         page.tsx (Fases 1 e 2), extraído aqui pros relatórios
//         seguintes (Fases 4+) não duplicarem o mesmo bloco de
//         ~80 linhas em cada rota.
// Conecta com: componentes de layout globais (não alterados),
//              usado por app/relatorios/[slug]/page.tsx (Fases 4+)
// ============================================================

'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

import Topbar from '@/components/layout/Topbar'
import TopbarMobile from '@/components/layout/TopbarMobile'
import NavBar from '@/components/layout/NavBar'
import Drawer from '@/components/layout/Drawer'

import { CabecalhoRota } from '@/components/relatorios/RelatorioUiComum'

export function RelatorioPageShell({ titulo, children }: { titulo: string; children: ReactNode }) {
  const router = useRouter()

  const [usuario, setUsuario] = useState<string>('')
  const [authCarregando, setAuthCarregando] = useState(true)
  const [drawerAberto, setDrawerAberto] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setIsMobile(mq.matches) // eslint-disable-line react-hooks/set-state-in-effect
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

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

  if (authCarregando) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Tahoma, Geneva, sans-serif', fontSize: '13px', color: '#5a84a6', background: '#f0f4f7' }}>
        Carregando...
      </div>
    )
  }

  const voltar = () => router.push('/relatorios')

  if (!isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f0f4f7', fontFamily: 'Tahoma, Geneva, sans-serif' }}>
        <Topbar usuario={usuario} />
        <NavBar />
        <main style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          <CabecalhoRota titulo={titulo} onVoltar={voltar} />
          {children}
        </main>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#f0f4f7', fontFamily: 'Tahoma, Geneva, sans-serif', paddingBottom: '56px' }}>
      <TopbarMobile usuario={usuario} onOpenDrawer={() => setDrawerAberto(true)} />
      <Drawer isOpen={drawerAberto} onClose={() => setDrawerAberto(false)} />
      <main style={{ flex: 1, padding: '10px 12px' }}>
        <CabecalhoRota titulo={titulo} onVoltar={voltar} />
        {children}
      </main>
    </div>
  )
}
