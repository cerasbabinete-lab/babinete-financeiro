// ============================================================
// components/clientes/ClientesMobileList.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Clientes
// Função: Lista mobile simplificada de clientes
//         Cada item mostra Nome Fantasia, Cidade/UF, Lista
//         e botões de editar/visualizar/excluir
// Conecta com: app/clientes/page.tsx (clientes, onEditar, onVisualizar, onExcluir)
//              types/clientes.ts (Cliente)
// ============================================================

'use client'

import { useState } from 'react'
import type { Cliente } from '@/types/clientes'

// ============================================================
// Props
// ============================================================
interface ClientesMobileListProps {
  clientes: Cliente[]
  onEditar: (cliente: Cliente) => void
  onVisualizar: (cliente: Cliente) => void
  onExcluir: (cliente: Cliente) => void
}

// ============================================================
// ClientesMobileList
// ============================================================
export default function ClientesMobileList({
  clientes,
  onEditar,
  onVisualizar,
  onExcluir,
}: ClientesMobileListProps) {

  // id do cliente aguardando confirmação de exclusão (null = nenhum)
  const [confirmandoExcluirId, setConfirmandoExcluirId] = useState<number | null>(null)

  // ============================================================
  // Render
  // ============================================================
  if (clientes.length === 0) {
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
        Nenhum cliente encontrado.
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
      {clientes.map((cliente) => (
        <div
          key={cliente.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 12px',
            background: '#ffffff',
            borderBottom: '1px solid #e8f0f7',
          }}
        >
          {/* Informações do cliente */}
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* Nome Fantasia */}
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
              {cliente.fantasia || cliente.razao || '—'}
            </div>

            {/* Cidade/UF */}
            <div
              style={{
                fontSize: '9px',
                color: '#5a84a6',
                marginTop: '2px',
              }}
            >
              {cliente.cidade && cliente.uf
                ? `${cliente.cidade}/${cliente.uf}`
                : cliente.cidade || cliente.uf || '—'}
            </div>



          </div>

          {/* Botões de ação */}
          <div style={{ display: 'flex', gap: '6px', marginLeft: '10px', flexShrink: 0 }}>

            {confirmandoExcluirId === cliente.id ? (
              // Confirmação inline — sem alert/confirm
              <>
                <button
                  onClick={() => { onExcluir(cliente); setConfirmandoExcluirId(null) }}
                  title="Confirmar exclusão"
                  style={{ ...btnMobileStyle, color: '#dc2626', borderColor: '#fca5a5', fontSize: '9px', width: 'auto', padding: '0 7px' }}
                >
                  Excluir
                </button>
                <button
                  onClick={() => setConfirmandoExcluirId(null)}
                  title="Cancelar"
                  style={{ ...btnMobileStyle, fontSize: '9px', width: 'auto', padding: '0 7px' }}
                >
                  Não
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => onEditar(cliente)}
                  title="Editar cliente"
                  aria-label={`Editar ${cliente.fantasia ?? cliente.razao}`}
                  style={btnMobileStyle}
                >
                  <i className="ti ti-writing" style={{ fontSize: '14px' }} aria-hidden="true" />
                </button>

                <button
                  onClick={() => onVisualizar(cliente)}
                  title="Visualizar cliente"
                  aria-label={`Visualizar ${cliente.fantasia ?? cliente.razao}`}
                  style={btnMobileStyle}
                >
                  <i className="ti ti-eye" style={{ fontSize: '14px' }} aria-hidden="true" />
                </button>

                <button
                  onClick={() => setConfirmandoExcluirId(cliente.id)}
                  title="Excluir cliente"
                  aria-label={`Excluir ${cliente.fantasia ?? cliente.razao}`}
                  style={{ ...btnMobileStyle, color: '#dc2626', borderColor: '#fca5a5' }}
                >
                  <i className="ti ti-trash" style={{ fontSize: '14px' }} aria-hidden="true" />
                </button>
              </>
            )}

          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================================
// Estilos auxiliares
// ============================================================
const btnMobileStyle: React.CSSProperties = {
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
  fontFamily: 'Tahoma, Geneva, sans-serif',
  fontSize: '12px',
}
