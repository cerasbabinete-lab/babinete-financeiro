// ============================================================
// components/contas-receber/ExportDropdownContasReceber.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Receber
// Função: Botão "Exportar" com dropdown CSV / Excel
//         Exporta a lista atualmente filtrada de títulos
// Conecta com: ContasReceberHeader.tsx (desktop)
//              BasebarContasReceber.tsx (mobile)
//              contasReceberService.ts (exportarCSV, exportarExcel)
//              types/contasReceber.ts (ContaReceber)
// ============================================================

'use client'

import { useEffect, useRef, useState } from 'react'
import { exportarCSV, exportarExcel } from '@/lib/contasReceberService'
import type { ContaReceber } from '@/types/contasReceber'

interface ExportDropdownContasReceberProps {
  titulos:  ContaReceber[] // Lista filtrada atual a exportar
  usuario:  string         // Nome do usuário — sufixo do filename
  mobile?:  boolean        // Se true, renderiza versão mobile (ícone + label)
}

export default function ExportDropdownContasReceber({
  titulos,
  usuario,
  mobile = false,
}: ExportDropdownContasReceberProps) {

  // Estado de visibilidade do dropdown
  const [aberto, setAberto] = useState(false)

  // Ref do container para detectar clique fora e fechar
  const ref = useRef<HTMLDivElement>(null)

  // Fecha o dropdown ao clicar fora do componente
  useEffect(() => {
    function handleClickFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAberto(false)
      }
    }
    document.addEventListener('mousedown', handleClickFora)
    return () => document.removeEventListener('mousedown', handleClickFora)
  }, [])

  // Estilo dos itens do dropdown — compartilhado
  const btnItemStyle: React.CSSProperties = {
    display:        'flex',
    alignItems:     'center',
    gap:            '8px',
    width:          '100%',
    padding:        '8px 14px',
    fontSize:       '12px',
    fontFamily:     'Tahoma, Geneva, sans-serif',
    background:     'transparent',
    color:          '#3a6080',
    border:         'none',
    borderBottom:   '1px solid #f0f4f7',
    cursor:         'pointer',
    textAlign:      'left',
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>

      {/* Botão principal — variante desktop ou mobile */}
      <button
        onClick={() => setAberto((v: boolean) => !v)}
        title="Exportar lista atual"
        style={mobile ? {
          // Mobile: coluna (ícone + label)
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
          gap:            '3px',
          background:     'transparent',
          border:         'none',
          cursor:         'pointer',
          padding:        '4px 8px',
          borderRadius:   '8px',
          minWidth:       '56px',
        } : {
          // Desktop: linha (ícone + texto + chevron)
          display:      'flex',
          alignItems:   'center',
          gap:          '5px',
          padding:      '5px 10px',
          fontSize:     '12px',
          fontWeight:   700,
          fontFamily:   'Tahoma, Geneva, sans-serif',
          background:   '#ffffff',
          color:        '#3a6080',
          border:       '1px solid #c4d8eb',
          borderRadius: '5px',
          cursor:       'pointer',
        }}
      >
        {mobile ? (
          // Versão mobile: ícone grande + label pequeno + chevron
          <>
            <i className="ti ti-table-export" style={{ fontSize: '20px', color: '#1a6094' }} aria-hidden="true" />
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <span style={{
                fontSize:       '8px',
                fontWeight:     600,
                textTransform:  'uppercase',
                color:          '#3a6080',
                fontFamily:     'Tahoma, Geneva, sans-serif',
                letterSpacing:  '0.03em',
                whiteSpace:     'nowrap',
              }}>
                Exportar
              </span>
              <i
                className={`ti ${aberto ? 'ti-chevron-up' : 'ti-chevron-down'}`}
                style={{ fontSize: '9px', color: '#3a6080' }}
                aria-hidden="true"
              />
            </div>
          </>
        ) : (
          // Versão desktop: ícone + texto + chevron inline
          <>
            <i className="ti ti-table-export" style={{ fontSize: '14px' }} aria-hidden="true" />
            Exportar
            <i
              className={`ti ${aberto ? 'ti-chevron-up' : 'ti-chevron-down'}`}
              style={{ fontSize: '11px', marginLeft: '2px' }}
              aria-hidden="true"
            />
          </>
        )}
      </button>

      {/* Dropdown — visível apenas quando aberto */}
      {aberto && (
        <div style={{
          position:   'absolute',
          // Mobile: abre para cima; desktop: abre para baixo
          ...(mobile ? { bottom: 'calc(100% + 4px)' } : { top: 'calc(100% + 4px)' }),
          right:        0,
          background:   '#ffffff',
          border:       '1px solid #dde8f0',
          borderRadius: '5px',
          minWidth:     '160px',
          zIndex:       100,
          overflow:     'hidden',
        }}>

          {/* Opção CSV */}
          <button
            onClick={() => { exportarCSV(titulos, usuario); setAberto(false) }}
            style={btnItemStyle}
            onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = '#edf4fb')}
            onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = 'transparent')}
          >
            <i className="ti ti-file-type-csv" style={{ fontSize: '15px', color: '#1a6094' }} aria-hidden="true" />
            CSV
          </button>

          {/* Opção Excel */}
          <button
            onClick={() => { exportarExcel(titulos, usuario); setAberto(false) }}
            style={{ ...btnItemStyle, borderBottom: 'none' }}
            onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = '#edf4fb')}
            onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = 'transparent')}
          >
            <i className="ti ti-file-type-xls" style={{ fontSize: '15px', color: '#1a6094' }} aria-hidden="true" />
            Excel
          </button>

        </div>
      )}
    </div>
  )
}
