// ============================================================
// components/clientes/ExportDropdown.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Clientes
// Função: Botão "Exportar" com dropdown CSV / Excel
//         Exporta a lista atualmente filtrada (não a tabela completa)
// Conecta com: ClientesHeader.tsx (desktop) e Basebar.tsx (mobile)
//              clientesService.ts (exportarCSV, exportarExcel)
// ============================================================

'use client'

import { useEffect, useRef, useState } from 'react'
import { exportarCSV, exportarExcel } from '@/lib/clientesService'
import type { Cliente } from '@/types/clientes'

// ============================================================
// Props
// ============================================================
interface ExportDropdownProps {
  clientes: Cliente[]   // Lista filtrada atual para exportar
  usuario: string       // 1º nome do usuário logado — incluído no nome do arquivo
  mobile?: boolean      // Ajusta estilo quando usado na Basebar mobile
}

// ============================================================
// ExportDropdown
// ============================================================
export default function ExportDropdown({ clientes, usuario, mobile = false }: ExportDropdownProps) {

  // Controla visibilidade do dropdown
  const [aberto, setAberto] = useState(false)

  // Ref para detectar clique fora e fechar o dropdown
  const ref = useRef<HTMLDivElement>(null)

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    function handleClickFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAberto(false)
      }
    }
    document.addEventListener('mousedown', handleClickFora)
    return () => document.removeEventListener('mousedown', handleClickFora)
  }, [])

  // ============================================================
  // handleCSV
  // Exporta lista filtrada como CSV e fecha dropdown
  // ============================================================
  function handleCSV() {
    // Passa usuario para incluir no nome do arquivo exportado
    exportarCSV(clientes, usuario)
    setAberto(false)
  }

  // ============================================================
  // handleExcel
  // Exporta lista filtrada como Excel e fecha dropdown
  // ============================================================
  function handleExcel() {
    // Passa usuario para incluir no nome do arquivo exportado
    exportarExcel(clientes, usuario)
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
          // Mobile — igual aos demais botões da Basebar
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
          // Desktop — estilo horizontal padrão
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
            {/* Ícone em cima */}
            <i className="ti ti-table-export" style={{ fontSize: '20px', color: '#1a6094' }} aria-hidden="true" />
            {/* Texto + seta na lateral direita */}
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
            // Mobile: abre para cima (componente fica na Basebar fixa no rodapé)
            // Desktop: abre para baixo (comportamento padrão de dropdown)
            // Sem esta inversão, o dropdown fica invisível abaixo da viewport no mobile
            ...(mobile
              ? { bottom: 'calc(100% + 4px)', top: undefined }
              : { top: 'calc(100% + 4px)', bottom: undefined }
            ),
            right: 0,
            background: '#ffffff',
            border: '1px solid #dde8f0',
            borderRadius: '5px',
            minWidth: '140px',
            zIndex: 100,
            overflow: 'hidden',
          }}
        >
          {/* Opção CSV */}
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

          {/* Opção Excel */}
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
