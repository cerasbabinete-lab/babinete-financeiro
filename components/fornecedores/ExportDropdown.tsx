// ============================================================
// components/fornecedores/ExportDropdown.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Fornecedores
// Função: Botão "Exportar" com dropdown CSV / Excel
//         Clone do ExportDropdown de Clientes, apontado para fornecedores
// Conecta com: FornecedoresHeader.tsx (desktop) e Basebar (mobile)
//              fornecedoresService.ts (exportarCSV, exportarExcel)
// ============================================================

'use client'

import { useEffect, useRef, useState } from 'react'
import { exportarCSV, exportarExcel } from '@/lib/fornecedoresService'
import type { Fornecedor } from '@/types/fornecedores'

// ============================================================
// Props
// ============================================================
interface ExportDropdownProps {
  fornecedores: Fornecedor[]   // Lista filtrada atual para exportar
  mobile?: boolean             // Ajusta estilo quando usado na Basebar mobile
}

// ============================================================
// ExportDropdown
// ============================================================
export default function ExportDropdown({ fornecedores, mobile = false }: ExportDropdownProps) {

  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAberto(false)
      }
    }
    document.addEventListener('mousedown', handleClickFora)
    return () => document.removeEventListener('mousedown', handleClickFora)
  }, [])

  function handleCSV() {
    exportarCSV(fornecedores)
    setAberto(false)
  }

  function handleExcel() {
    exportarExcel(fornecedores)
    setAberto(false)
  }

  // ============================================================
  // Render
  // ============================================================
  return (
    <div
      ref={ref}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      {/* Botão principal Exportar */}
      <button
        onClick={() => setAberto(v => !v)}
        title="Exportar lista atual"
        style={mobile ? {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '3px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '4px 8px',
          borderRadius: '8px',
          minWidth: '56px',
        } : {
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: '5px 10px',
          fontSize: '12px',
          fontWeight: 700,
          fontFamily: 'Tahoma, Geneva, sans-serif',
          background: '#ffffff',
          color: '#3a6080',
          border: '1px solid #c4d8eb',
          borderRadius: '5px',
          cursor: 'pointer',
        }}
      >
        {mobile ? (
          <>
            <i className="ti ti-database-import" style={{ fontSize: '20px', color: '#1a6094' }} aria-hidden="true" />
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <span style={{
                fontSize: '8px',
                fontWeight: 600,
                textTransform: 'uppercase' as const,
                color: '#3a6080',
                fontFamily: 'Tahoma, Geneva, sans-serif',
                letterSpacing: '0.03em',
                whiteSpace: 'nowrap',
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

      {/* Dropdown de opções */}
      {aberto && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            background: '#ffffff',
            border: '1px solid #dde8f0',
            borderRadius: '5px',
            minWidth: '140px',
            zIndex: 100,
            overflow: 'hidden',
          }}
        >
          <button
            onClick={handleCSV}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              width: '100%',
              padding: '8px 14px',
              fontSize: '12px',
              fontFamily: 'Tahoma, Geneva, sans-serif',
              background: 'transparent',
              color: '#3a6080',
              border: 'none',
              borderBottom: '1px solid #f0f4f7',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#edf4fb')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <i className="ti ti-file-type-csv" style={{ fontSize: '15px', color: '#1a6094' }} aria-hidden="true" />
            CSV
          </button>

          <button
            onClick={handleExcel}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              width: '100%',
              padding: '8px 14px',
              fontSize: '12px',
              fontFamily: 'Tahoma, Geneva, sans-serif',
              background: 'transparent',
              color: '#3a6080',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#edf4fb')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <i className="ti ti-file-type-xls" style={{ fontSize: '15px', color: '#1a6094' }} aria-hidden="true" />
            Excel
          </button>
        </div>
      )}
    </div>
  )
}
