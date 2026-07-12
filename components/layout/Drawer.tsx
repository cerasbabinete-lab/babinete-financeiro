// ============================================================
// components/layout/Drawer.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Global
// Função: Side drawer mobile — 10 módulos com ícones PNG
//         Rodapé: Trocar usuário + Sair do sistema
//         Item ativo com border-left #1a6094 e fundo #f0f6fc
//         Overlay escuro — clique fora fecha
// Conecta com: app/clientes/page.tsx (isOpen, onClose, usuario)
//              TopbarMobile.tsx (onOpenDrawer)
//              Supabase Auth (signOut — Trocar e Sair)
// ============================================================

'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// QA fix (achado Médio #18 — Relatorio_Auditoria_Modulo_Despesas.md):
// campo "habilitado" adicionado — "Contas a Pagar" apontava para /pagar,
// rota que ainda não existia (módulo não construído), levando a um 404
// real. Item ficou visível, mas não clicável, enquanto a rota não existia.
// ATUALIZAÇÃO: módulo Contas a Pagar concluído (código + banco validados)
// nesta sessão — "habilitado" alterado para true. Alteração feita
// seguindo o processo de exceção do projeto (arquivo congelado), com
// aprovação explícita do usuário para este item.
const MODULOS = [
  { label: 'Início',           href: '/',            icon: '/img/home.svg',           habilitado: true },
  { label: 'Dashboard',        href: '/dashboard',   icon: '/img/dashboard.svg',       habilitado: true },
  { label: 'Relatórios',       href: '/relatorios',  icon: '/img/relatorios.svg',      habilitado: true },
  { label: 'Receitas',         href: '/receitas',    icon: '/img/receitas.svg',        habilitado: true },
  { label: 'Despesas',         href: '/despesas',    icon: '/img/despesas.svg',        habilitado: true },
  { label: 'Contas a Receber', href: '/receber',     icon: '/img/contas_receber.svg',  habilitado: true },
  { label: 'Contas a Pagar',   href: '/pagar',       icon: '/img/contas_pagar.svg',    habilitado: true },
  { label: 'Clientes',         href: '/clientes',    icon: '/img/clientes.svg',        habilitado: true },
  { label: 'Fornecedores',     href: '/fornecedores',icon: '/img/fornecedores.svg',    habilitado: true },
  { label: 'Usuários',         href: '/usuarios',    icon: '/img/usuarios.svg',        habilitado: true },
  { label: 'Backup',           href: '/backup',      icon: '/img/backup.svg',          habilitado: true },
]

interface DrawerProps {
  isOpen: boolean
  onClose: () => void
}

export default function Drawer({ isOpen, onClose }: DrawerProps) {

  const pathname = usePathname()
  const router = useRouter()

  async function handleTrocar() {
    onClose()
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function handleSair() {
    onClose()
    await supabase.auth.signOut()
    window.close()
    router.push('/encerrado')
  }

  if (!isOpen) return null

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.35)',
          zIndex: 200,
        }}
      />

      {/* Painel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: '220px',
          background: '#ffffff',
          zIndex: 201,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'Tahoma, Geneva, sans-serif',
          boxShadow: '2px 0 8px rgba(0,0,0,0.15)',
        }}
      >
        {/* Header */}
        <div style={{ background: '#1a6094', padding: '14px 16px 12px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/img/logo_branca.svg" alt="Ceras Babinete" style={{ height: '28px', objectFit: 'contain', marginBottom: '4px' }} />
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '8px', marginTop: '2px' }}>
            Gestão Financeira
          </div>
        </div>

        {/* Módulos */}
        <nav style={{ flex: 1, overflowY: 'auto' }}>
          {MODULOS.map(modulo => {
            const ativo = modulo.href === '/'
              ? pathname === '/'
              : pathname === modulo.href || pathname.startsWith(modulo.href + '/')

            // QA fix (achado Médio #18): módulo desabilitado renderiza como
            // <div> cinza, sem navegação — nunca gera um <Link> para uma
            // rota inexistente (404)
            if (!modulo.habilitado) {
              return (
                <div
                  key={modulo.href}
                  title="Módulo em construção"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 16px',
                    fontSize: '11px',
                    fontWeight: 600,
                    fontFamily: 'Tahoma, Geneva, sans-serif',
                    textTransform: 'uppercase',
                    letterSpacing: '0.03em',
                    color: '#a9bccb',
                    background: 'transparent',
                    borderLeft: '3px solid transparent',
                    borderBottom: '1px solid #eef3f7',
                    cursor: 'not-allowed',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={modulo.icon} alt={modulo.label} style={{ width: '22px', height: '22px', objectFit: 'contain', flexShrink: 0, opacity: 0.4 }} />
                  {modulo.label}
                </div>
              )
            }

            return (
              <Link
                key={modulo.href}
                href={modulo.href}
                onClick={onClose}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 16px',
                  fontSize: '11px',
                  fontWeight: ativo ? 700 : 600,
                  fontFamily: 'Tahoma, Geneva, sans-serif',
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                  color: ativo ? '#1a6094' : '#3a6080',
                  textDecoration: 'none',
                  background: ativo ? '#f0f6fc' : 'transparent',
                  borderLeft: ativo ? '3px solid #1a6094' : '3px solid transparent',
                  borderBottom: '1px solid #eef3f7',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={modulo.icon} alt={modulo.label} style={{ width: '22px', height: '22px', objectFit: 'contain', flexShrink: 0 }} />
                {modulo.label}
              </Link>
            )
          })}
        </nav>

        {/* Rodapé — Trocar e Sair */}
        <div style={{ borderTop: '1px solid #eef3f7', padding: '8px' }}>

          {/* Trocar usuário */}
          <button
            onClick={handleTrocar}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              width: '100%',
              padding: '10px 8px',
              fontSize: '11px',
              fontWeight: 600,
              fontFamily: 'Tahoma, Geneva, sans-serif',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              color: '#3a6080',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid #eef3f7',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/img/trocar_user.svg" alt="Trocar usuário" style={{ width: '22px', height: '22px', objectFit: 'contain', flexShrink: 0 }} />
            Trocar Usuário
          </button>

          {/* Sair do sistema */}
          <button
            onClick={handleSair}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              width: '100%',
              padding: '10px 8px',
              fontSize: '11px',
              fontWeight: 600,
              fontFamily: 'Tahoma, Geneva, sans-serif',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              color: '#dc2626',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/img/sair.svg" alt="Sair do sistema" style={{ width: '22px', height: '22px', objectFit: 'contain', flexShrink: 0 }} />
            Sair do Sistema
          </button>

        </div>
      </div>
    </>
  )
}
