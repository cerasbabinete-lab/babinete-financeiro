// ============================================================
// components/fornecedores/FornecedoresMobileList.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Fornecedores
// Função: Lista mobile simplificada de fornecedores
//         Clone de ClientesMobileList.tsx — SEM linha de Lista
//         Cada item mostra Nome Fantasia, Cidade/UF, botões de ação
// Conecta com: app/fornecedores/page.tsx (fornecedores, onEditar, onVisualizar)
//              types/fornecedores.ts (Fornecedor)
// ============================================================

'use client'

import type { Fornecedor } from '@/types/fornecedores'

// ============================================================
// Props
// ============================================================
interface FornecedoresMobileListProps {
  fornecedores: Fornecedor[]
  onEditar: (fornecedor: Fornecedor) => void
  onVisualizar: (fornecedor: Fornecedor) => void
}

// ============================================================
// FornecedoresMobileList
// ============================================================
export default function FornecedoresMobileList({
  fornecedores,
  onEditar,
  onVisualizar,
}: FornecedoresMobileListProps) {

  if (fornecedores.length === 0) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '32px 16px',
          color: '#5a84a6',
          fontSize: '12px',
          fontFamily: 'Tahoma, Geneva, sans-serif',
        }}
      >
        Nenhum fornecedor encontrado.
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1px',
        fontFamily: 'Tahoma, Geneva, sans-serif',
      }}
    >
      {fornecedores.map((fornecedor) => (
        <div
          key={fornecedor.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 12px',
            background: '#ffffff',
            borderBottom: '1px solid #e8f0f7',
          }}
        >
          {/* Informações do fornecedor — sem linha de Lista */}
          <div style={{ flex: 1, minWidth: 0 }}>

            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#1a6094',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {fornecedor.fantasia || fornecedor.razao || '—'}
            </div>

            <div
              style={{
                fontSize: '9px',
                color: '#5a84a6',
                marginTop: '2px',
              }}
            >
              {fornecedor.cidade && fornecedor.uf
                ? `${fornecedor.cidade}/${fornecedor.uf}`
                : fornecedor.cidade || fornecedor.uf || '—'}
            </div>

          </div>

          {/* Botões de ação */}
          <div style={{ display: 'flex', gap: '6px', marginLeft: '10px', flexShrink: 0 }}>

            <button
              onClick={() => onEditar(fornecedor)}
              title="Editar fornecedor"
              aria-label={`Editar ${fornecedor.fantasia}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '28px',
                height: '28px',
                background: '#ffffff',
                border: '1px solid #c4d8eb',
                borderRadius: '4px',
                color: '#1a6094',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <i className="ti ti-writing" style={{ fontSize: '14px' }} aria-hidden="true" />
            </button>

            <button
              onClick={() => onVisualizar(fornecedor)}
              title="Visualizar fornecedor"
              aria-label={`Visualizar ${fornecedor.fantasia}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '28px',
                height: '28px',
                background: '#ffffff',
                border: '1px solid #c4d8eb',
                borderRadius: '4px',
                color: '#1a6094',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <i className="ti ti-eye" style={{ fontSize: '14px' }} aria-hidden="true" />
            </button>

          </div>
        </div>
      ))}
    </div>
  )
}
