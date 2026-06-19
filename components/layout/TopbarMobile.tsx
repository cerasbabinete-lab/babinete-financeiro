// ============================================================
// components/layout/TopbarMobile.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Global
// Função: Topbar mobile — hamburger esquerda, logo+subtítulos centro,
//         "Olá! [1º nome]" direita (sem botões — Trocar/Sair no Drawer)
//         Datetime strip abaixo
// Conecta com: app/clientes/page.tsx
//              Drawer.tsx (onOpenDrawer)
// ============================================================

'use client'

import { useEffect, useState } from 'react'

interface TopbarMobileProps {
  usuario?: string
  onOpenDrawer: () => void
}

export default function TopbarMobile({ usuario = '', onOpenDrawer }: TopbarMobileProps) {

  const [agora, setAgora] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setAgora(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const hora = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const diasSemana = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']
  const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
  const dataFormatada = `${diasSemana[agora.getDay()]}, ${String(agora.getDate()).padStart(2,'0')} ${meses[agora.getMonth()]} ${agora.getFullYear()}`

  // Extrai 1º nome — usuario já chega sem domínio (pre-processado em page.tsx)
  // includes('@') sempre false aqui; simplificado para evitar branch morto
  const primeiroNome = usuario.split(/[\s._-]/)[0] || usuario

  return (
    <>
      {/* Topbar */}
      <header
        style={{
          background: '#1a6094',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          position: 'relative',
          minHeight: '72px',
          fontFamily: 'Tahoma, Geneva, sans-serif',
        }}
      >
        {/* Hamburger */}
        <button
          onClick={onOpenDrawer}
          aria-label="Abrir menu"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            flexShrink: 0,
            zIndex: 2,
          }}
        >
          <span style={{ display: 'block', width: '20px', height: '2px', background: '#fff', borderRadius: '2px' }} />
          <span style={{ display: 'block', width: '20px', height: '2px', background: '#fff', borderRadius: '2px' }} />
          <span style={{ display: 'block', width: '20px', height: '2px', background: '#fff', borderRadius: '2px' }} />
        </button>

        {/* Centro — apenas logo (sem texto) */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/img/logo_branca.svg"
            alt="Ceras Babinete"
            style={{ height: '44px', objectFit: 'contain' }}
          />
        </div>

        {/* Direita — "Olá!" na 1ª linha, nome na 2ª, ambos alinhados à direita */}
        <div style={{ flexShrink: 0, zIndex: 2, textAlign: 'right' }}>
          {primeiroNome && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              {/* Linha 1: saudação */}
              <span style={{ color: '#ffffff', fontSize: '10px', fontWeight: 700, lineHeight: 1.3 }}>
                Olá!
              </span>
              {/* Linha 2: primeiro nome do usuário logado */}
              <span style={{ color: '#ffffff', fontSize: '10px', fontWeight: 700, lineHeight: 1.3 }}>
                {primeiroNome}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Datetime strip */}
      <div
        style={{
          background: '#d0e3f0',
          borderBottom: '1px solid #c4d8eb',
          padding: '4px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          fontFamily: 'Tahoma, Geneva, sans-serif',
        }}
      >
        {/* Espaço vazio à esquerda para balancear */}
        <div style={{ flex: 1 }} />

        {/* Centro — Gestão Financeira */}
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#1a6094', whiteSpace: 'nowrap' }}>
          Gestão Financeira
        </span>

        {/* Direita — hora e data */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#1a6094' }}>{hora}</span>
          <span style={{ fontSize: '9px', color: '#5a84a6' }}>{dataFormatada}</span>
        </div>
      </div>
    </>
  )
}
