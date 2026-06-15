// ============================================================
// components/layout/Topbar.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Global
// Função: Topbar desktop — 64px, fundo #1a6094
//         Esquerda: logo_branca.png + subtítulos (sem nome empresa)
//         Centro: "Gestão Financeira" (22px)
//         Direita: 1º nome usuário + ícones Trocar (48px) + Sair (48px)
//         Ícones sem texto — tooltip no hover
// Conecta com: app/clientes/page.tsx
//              Supabase Auth (signOut)
// ============================================================

'use client'

import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface TopbarProps {
  usuario?: string
}

export default function Topbar({ usuario = '' }: TopbarProps) {

  const router = useRouter()

  async function handleTrocar() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function handleSair() {
    await supabase.auth.signOut()
    window.close()
    router.push('/encerrado')
  }

  return (
    <header
      style={{
        height: '64px',
        background: '#1a6094',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        flexShrink: 0,
        fontFamily: 'Tahoma, Geneva, sans-serif',
        position: 'relative',
      }}
    >
      {/* Esquerda — apenas logo */}
      <div style={{ flexShrink: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/img/logo_branca.png"
          alt="Ceras Babinete"
          style={{ height: '44px', objectFit: 'contain' }}
        />
      </div>

      {/* Centro — título do sistema */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          color: '#ffffff',
          fontSize: '22px',
          fontWeight: 400,
          whiteSpace: 'nowrap',
          fontFamily: 'Tahoma, Geneva, sans-serif',
        }}
      >
        Gestão Financeira
      </div>

      {/* Direita — nome + botões ícone sem texto */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>

        {usuario && (
          <span style={{ color: '#ffffff', fontSize: '12px', fontWeight: 700 }}>
            Olá! {usuario}
          </span>
        )}

        {/* Trocar — ícone 48px, tooltip no hover */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={handleTrocar}
            title="Trocar usuário"
            aria-label="Trocar usuário"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '48px',
              height: '48px',
              background: 'transparent',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              padding: 0,
            }}
            onMouseEnter={e => {
              const tip = e.currentTarget.nextElementSibling as HTMLElement
              if (tip) tip.style.opacity = '1'
            }}
            onMouseLeave={e => {
              const tip = e.currentTarget.nextElementSibling as HTMLElement
              if (tip) tip.style.opacity = '0'
            }}
          >
            <i className="ti ti-arrows-left-right" style={{ fontSize: '28px', color: '#ffffff' }} aria-hidden="true" />
          </button>
          <div style={{
            position: 'absolute',
            bottom: '-30px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.75)',
            color: '#fff',
            fontSize: '10px',
            padding: '3px 8px',
            borderRadius: '4px',
            whiteSpace: 'nowrap',
            fontFamily: 'Tahoma, Geneva, sans-serif',
            opacity: 0,
            transition: 'opacity 0.2s',
            pointerEvents: 'none',
            zIndex: 10,
          }}>
            Trocar usuário
          </div>
        </div>

        {/* Sair — ícone 48px, tooltip no hover */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={handleSair}
            title="Sair do sistema"
            aria-label="Sair do sistema"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '48px',
              height: '48px',
              background: 'transparent',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              padding: 0,
            }}
            onMouseEnter={e => {
              const tip = e.currentTarget.nextElementSibling as HTMLElement
              if (tip) tip.style.opacity = '1'
            }}
            onMouseLeave={e => {
              const tip = e.currentTarget.nextElementSibling as HTMLElement
              if (tip) tip.style.opacity = '0'
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/img/sair.png" alt="Sair do sistema" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
          </button>
          <div style={{
            position: 'absolute',
            bottom: '-30px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.75)',
            color: '#fff',
            fontSize: '10px',
            padding: '3px 8px',
            borderRadius: '4px',
            whiteSpace: 'nowrap',
            fontFamily: 'Tahoma, Geneva, sans-serif',
            opacity: 0,
            transition: 'opacity 0.2s',
            pointerEvents: 'none',
            zIndex: 10,
          }}>
            Sair do sistema
          </div>
        </div>

      </div>
    </header>
  )
}
