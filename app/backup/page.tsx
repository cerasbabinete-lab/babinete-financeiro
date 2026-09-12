// ============================================================
// app/backup/page.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Backup (NOVO)
// Função: Tela central de backup/restauração do sistema — dump e
//         restore de até 18 tabelas de uma vez, respeitando a ordem
//         topológica de foreign keys (ver Especificacao_Modulo_Backup.md).
//         Layout (Topbar/NavBar/TopbarMobile/Drawer, auth guard,
//         detecção de viewport) fiel ao padrão já usado em
//         app/dashboard/page.tsx, app/page.tsx etc. — NÃO reinventado.
// Conecta com: components/layout/Topbar, TopbarMobile, NavBar, Drawer
//              components/backup/BackupPainel.tsx
//              lib/supabase.ts, lib/authUsername.ts
// ============================================================

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { resolverUsernameExibicao } from '@/lib/authUsername'

// Componentes de layout congelados — mesmo padrão de app/dashboard/page.tsx,
// app/clientes/page.tsx etc. — NÃO modificar
import Topbar from '@/components/layout/Topbar'
import TopbarMobile from '@/components/layout/TopbarMobile'
import NavBar from '@/components/layout/NavBar'
import Drawer from '@/components/layout/Drawer'

import BackupPainel from '@/components/backup/BackupPainel'

const COR_BORDA_TOPO = '#d7e0e6'
const COR_PRIMARIA = '#1a6094'

export default function BackupPage() {
  const router = useRouter()

  const [usuario, setUsuario] = useState<string>('')
  const [authCarregando, setAuthCarregando] = useState(true)
  const [isMobile, setIsMobile] = useState<boolean | null>(null)
  const [drawerAberto, setDrawerAberto] = useState(false)

  // Detecção de viewport — mesmo padrão de app/dashboard/page.tsx (breakpoint 768px)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setIsMobile(mq.matches) // eslint-disable-line react-hooks/set-state-in-effect
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Verificação de autenticação — getUser() valida o JWT server-side (nunca getSession()
  // para esta checagem), mesmo padrão de app/dashboard/page.tsx e app/page.tsx
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user }, error }) => {
      if (!user || error) {
        router.push('/login')
        return
      }
      setUsuario(resolverUsernameExibicao(user.email)) // eslint-disable-line react-hooks/set-state-in-effect
      setAuthCarregando(false) // eslint-disable-line react-hooks/set-state-in-effect
    }).catch(() => {
      router.push('/login')
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.push('/login')
    })

    return () => subscription.unsubscribe()
  }, [router])

  if (authCarregando) return null
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
        <div
          style={{
            marginBottom: '18px',
            paddingBottom: '14px',
            borderBottom: `1px solid ${COR_BORDA_TOPO}`,
          }}
        >
          <span style={{ fontSize: isMobile ? '12px' : '15px', fontWeight: 700, color: COR_PRIMARIA }}>
            Backup
          </span>
        </div>

        <BackupPainel usuario={usuario} isMobile={isMobile} />
      </div>

      {isMobile && (
        <Drawer
          isOpen={drawerAberto}
          onClose={() => setDrawerAberto(false)}
        />
      )}
    </div>
  )
}
