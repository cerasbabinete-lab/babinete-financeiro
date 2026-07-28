// ============================================================
// app/relatorios/faturamento/page.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Rota do relatório "Faturamento por período" (2.1) — só
//         autenticação + layout + link de volta; todo o conteúdo
//         real está em FaturamentoRelatorio.tsx
// Conecta com: components/relatorios/faturamento/FaturamentoRelatorio.tsx
// ============================================================

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

import Topbar from '@/components/layout/Topbar'
import TopbarMobile from '@/components/layout/TopbarMobile'
import NavBar from '@/components/layout/NavBar'
import Drawer from '@/components/layout/Drawer'

import FaturamentoRelatorio from '@/components/relatorios/faturamento/FaturamentoRelatorio'

export default function FaturamentoPage() {
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

  const cabecalho = (
    <div style={{ marginBottom: '16px' }}>
      <button
        onClick={() => router.push('/relatorios')}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: '#5a84a6', fontSize: '11px', fontFamily: 'Tahoma, Geneva, sans-serif', cursor: 'pointer', padding: 0, marginBottom: '8px' }}
      >
        <i className="ti ti-arrow-left" aria-hidden="true" /> Voltar para Relatórios
      </button>
      <div style={{ fontSize: '16px', fontWeight: 700, color: '#1a6094' }}>Faturamento por período</div>
    </div>
  )

  if (!isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f0f4f7', fontFamily: 'Tahoma, Geneva, sans-serif' }}>
        <Topbar usuario={usuario} />
        <NavBar />
        <main style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {cabecalho}
          <FaturamentoRelatorio />
        </main>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#f0f4f7', fontFamily: 'Tahoma, Geneva, sans-serif', paddingBottom: '56px' }}>
      <TopbarMobile usuario={usuario} onOpenDrawer={() => setDrawerAberto(true)} />
      <Drawer isOpen={drawerAberto} onClose={() => setDrawerAberto(false)} />
      <main style={{ flex: 1, padding: '10px 12px' }}>
        {cabecalho}
        <FaturamentoRelatorio />
      </main>
    </div>
  )
}
