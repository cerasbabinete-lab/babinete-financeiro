// ============================================================
// components/layout/NavBar.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Global
// Função: Nav bar desktop — 32px, fundo #dce8f3
//         Módulos do sistema conforme mockup aprovado
//         Item ativo com underline #1a6094
//         Datetime em tempo real à direita
// Conecta com: app/clientes/page.tsx e demais páginas
// ============================================================

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// ============================================================
// Módulos do sistema — ordem e rotas conforme mockup aprovado
// QA fix (achado Médio #18 — Relatorio_Auditoria_Modulo_Despesas.md):
// campo "habilitado" adicionado — "Contas a Pagar" apontava para /pagar,
// rota que ainda não existia no projeto (módulo não construído), levando
// a um 404 real. Mesmo mecanismo de "módulo desabilitado" que
// app/page.tsx já usa no grid da Home (flag "ativo"), aplicado aqui.
// ATUALIZAÇÃO: módulo Contas a Pagar concluído (código + banco
// validados) nesta sessão — "habilitado" alterado para true. Alteração
// feita seguindo o processo de exceção do projeto (arquivo congelado),
// com aprovação explícita do usuário para este item.
// ============================================================
const MODULOS = [
  { label: 'Início',           href: '/',            icon: 'ti-home-star', habilitado: true },
  { label: 'Dashboard',        href: '/dashboard',   icon: null,           habilitado: true },
  { label: 'Relatórios',       href: '/relatorios',  icon: null,           habilitado: true },
  { label: 'Receitas',         href: '/receitas',    icon: null,           habilitado: true },
  { label: 'Despesas',         href: '/despesas',    icon: null,           habilitado: true },
  { label: 'Contas a Receber', href: '/receber',     icon: null,           habilitado: true },
  { label: 'Contas a Pagar',   href: '/pagar',       icon: null,           habilitado: true },
  { label: 'Clientes',         href: '/clientes',    icon: null,           habilitado: true },
  { label: 'Fornecedores',     href: '/fornecedores',icon: null,           habilitado: true },
  { label: 'Usuários',         href: '/usuarios',    icon: null,           habilitado: true },
  { label: 'Backup',           href: '/backup',      icon: null,           habilitado: true },
]

// ============================================================
// NavBar
// ============================================================
export default function NavBar() {

  const pathname = usePathname()

  // Estado do relógio em tempo real
  const [agora, setAgora] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setAgora(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // ============================================================
  // Formatações de data e hora
  // ============================================================
  const hora = agora.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
  const diasSemana = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
  const diaSemana = diasSemana[agora.getDay()]
  const dia = String(agora.getDate()).padStart(2, '0')
  const mes = meses[agora.getMonth()]
  const ano = agora.getFullYear()

  // ============================================================
  // Render
  // ============================================================
  return (
    <nav
      style={{
        height: '32px',
        background: '#dce8f3',
        borderBottom: '1px solid #c4d8eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        flexShrink: 0,
        fontFamily: 'Tahoma, Geneva, sans-serif',
      }}
    >
      {/* Lista de módulos — centralizada */}
      <div style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>
        {MODULOS.map((modulo, index) => {
          const ativo = modulo.href === '/'
            ? pathname === '/'
            : pathname === modulo.href || pathname.startsWith(modulo.href + '/')

          // QA fix (achado Médio #18): módulo desabilitado (ainda sem rota
          // construída) renderiza como <span> cinza, sem href — nunca gera
          // um <Link> apontando para uma página inexistente (404)
          if (!modulo.habilitado) {
            return (
              <span
                key={modulo.href}
                title="Módulo em construção"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 10px',
                  fontSize: '9.5px',
                  fontWeight: 600,
                  fontFamily: 'Tahoma, Geneva, sans-serif',
                  color: '#a9bccb',
                  textTransform: 'uppercase',
                  letterSpacing: '0.025em',
                  borderRight: '1px solid rgba(26,96,148,0.1)',
                  borderLeft: index === 0 ? '1px solid rgba(26,96,148,0.1)' : 'none',
                  borderBottom: '3px solid transparent',
                  whiteSpace: 'nowrap',
                  height: '100%',
                  boxSizing: 'border-box',
                  cursor: 'not-allowed',
                }}
              >
                {modulo.icon && (
                  <i className={`ti ${modulo.icon}`} style={{ fontSize: '14px', marginRight: '4px' }} aria-hidden="true" />
                )}
                {modulo.label}
              </span>
            )
          }

          return (
            <Link
              key={modulo.href}
              href={modulo.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0 10px',
                fontSize: '9.5px',
                fontWeight: ativo ? 700 : 600,
                fontFamily: 'Tahoma, Geneva, sans-serif',
                color: ativo ? '#1a6094' : '#3a6080',
                textDecoration: 'none',
                textTransform: 'uppercase',
                letterSpacing: '0.025em',
                borderRight: '1px solid rgba(26,96,148,0.1)',
                borderLeft: index === 0 ? '1px solid rgba(26,96,148,0.1)' : 'none',
                borderBottom: ativo ? '3px solid #1a6094' : '3px solid transparent',
                whiteSpace: 'nowrap',
                height: '100%',
                boxSizing: 'border-box',
              }}
            >
              {modulo.icon && (
                <i className={`ti ${modulo.icon}`} style={{ fontSize: '14px', marginRight: '4px' }} aria-hidden="true" />
              )}
              {modulo.label}
            </Link>
          )
        })}
      </div>

      {/* Datetime — posição absoluta à direita */}
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          background: '#d0e3f0',
          borderLeft: '1px solid #c4d8eb',
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          gap: '6px',
        }}
      >
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#1a6094' }}>
          {hora}
        </span>
        <span style={{ fontSize: '10px', color: '#5a84a6' }}>·</span>
        <span style={{ fontSize: '9px', color: '#5a84a6' }}>
          {diaSemana}, {dia} {mes} {ano}
        </span>
      </div>
    </nav>
  )
}
