// ============================================================
// components/fornecedores/FornecedoresTabela.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Fornecedores
// Função: Tabela desktop com fornecedores filtrados
//         Clone de ClientesTabela.tsx — SEM coluna Lista
//         Colunas: Cód. | Nome Fantasia | Razão Social | CNPJ/CPF
//                  Cidade/UF | Telefone | E-mail | Contato | Ações
// Conecta com: app/fornecedores/page.tsx (fornecedores, onEditar, onVisualizar, onExcluir)
//              types/fornecedores.ts (Fornecedor)
// ============================================================

'use client'

import { useState } from 'react'
import type { Fornecedor } from '@/types/fornecedores'

// ============================================================
// Props
// ============================================================
interface FornecedoresTabelaProps {
  fornecedores: Fornecedor[]
  onEditar: (fornecedor: Fornecedor) => void
  onVisualizar: (fornecedor: Fornecedor) => void
  onExcluir: (fornecedor: Fornecedor) => void
}

// ============================================================
// FornecedoresTabela
// ============================================================
export default function FornecedoresTabela({
  fornecedores,
  onEditar,
  onVisualizar,
  onExcluir,
}: FornecedoresTabelaProps) {

  const [hoverId, setHoverId] = useState<number | null>(null)
  // id do fornecedor aguardando confirmação de exclusão (null = nenhum)
  const [confirmandoExcluirId, setConfirmandoExcluirId] = useState<number | null>(null)

  function formatarCidadeUF(cidade?: string, uf?: string): string {
    if (cidade && uf) return `${cidade}/${uf}`
    if (cidade) return cidade
    if (uf) return uf
    return '—'
  }

  // ============================================================
  // Render
  // ============================================================
  return (
    <div
      style={{
        width: '100%',
        overflowX: 'auto',
        border: '1px solid #dde8f0',
        borderRadius: '8px',
        fontFamily: 'Tahoma, Geneva, sans-serif',
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '10px',
          minWidth: '850px',
        }}
      >
        {/* Cabeçalho — sem coluna Lista */}
        <thead>
          <tr
            style={{
              background: '#1a6094',
              color: '#ffffff',
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
            }}
          >
            <th style={thStyle('42px')}>Cód.</th>
            <th style={thStyle()}>Nome Fantasia</th>
            <th style={thStyle()}>Razão Social</th>
            <th style={thStyle()}>CNPJ/CPF</th>
            <th style={thStyle()}>Cidade/UF</th>
            <th style={thStyle()}>Telefone</th>
            <th style={thStyle()}>E-mail</th>
            <th style={thStyle()}>Contato</th>
            <th style={thStyle('80px', true)}>Ações</th>
          </tr>
        </thead>

        <tbody>
          {fornecedores.length === 0 ? (
            <tr>
              <td
                colSpan={9}
                style={{
                  textAlign: 'center',
                  padding: '32px',
                  color: '#5a84a6',
                  fontSize: '12px',
                }}
              >
                Nenhum fornecedor encontrado.
              </td>
            </tr>
          ) : (
            fornecedores.map((fornecedor, index) => {
              const isHover = hoverId === fornecedor.id
              const isAlternado = index % 2 !== 0

              return (
                <tr
                  key={fornecedor.id}
                  onMouseEnter={() => setHoverId(fornecedor.id)}
                  onMouseLeave={() => setHoverId(null)}
                  style={{
                    background: isHover
                      ? '#edf4fb'
                      : isAlternado
                      ? '#f7fafc'
                      : '#ffffff',
                    borderBottom: '1px solid #e8f0f7',
                    transition: 'background 0.1s',
                  }}
                >
                  <td style={tdStyle('42px')}>{fornecedor.id}</td>

                  <td style={{ ...tdStyle(), fontWeight: 700, color: '#1a6094' }}>
                    {fornecedor.fantasia || '—'}
                  </td>

                  <td style={tdStyle()}>{fornecedor.razao || '—'}</td>

                  <td style={tdStyle()}>
                    {fornecedor.cnpj && fornecedor.cnpj !== '___.___.___-__'
                      ? fornecedor.cnpj
                      : fornecedor.cpf && fornecedor.cpf !== '___.___.___-__'
                      ? fornecedor.cpf
                      : '—'}
                  </td>

                  <td style={tdStyle()}>
                    {formatarCidadeUF(fornecedor.cidade, fornecedor.uf)}
                  </td>

                  <td style={tdStyle()}>{fornecedor.fone1 || '—'}</td>

                  <td style={{
                    ...tdStyle(),
                    maxWidth: '160px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {fornecedor.email || '—'}
                  </td>

                  <td style={tdStyle()}>{fornecedor.contato || '—'}</td>

                  {/* Ações */}
                  <td style={{ ...tdStyle('80px'), textAlign: 'center' }}>
                    {confirmandoExcluirId === fornecedor.id ? (
                      // Confirmação inline — sem alert/confirm
                      <div style={{ display: 'flex', gap: '3px', justifyContent: 'center' }}>
                        <button
                          onClick={() => { onExcluir(fornecedor); setConfirmandoExcluirId(null) }}
                          title="Confirmar exclusão"
                          style={{ ...btnAcaoStyle, color: '#dc2626', fontSize: '10px', width: 'auto', padding: '2px 5px' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >
                          Excluir
                        </button>
                        <button
                          onClick={() => setConfirmandoExcluirId(null)}
                          title="Cancelar exclusão"
                          style={{ ...btnAcaoStyle, fontSize: '10px', width: 'auto', padding: '2px 5px' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#e0ecf7')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >
                          Não
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>

                        <button
                          onClick={() => onEditar(fornecedor)}
                          title="Editar fornecedor"
                          aria-label={`Editar ${fornecedor.fantasia}`}
                          style={btnAcaoStyle}
                          onMouseEnter={e => (e.currentTarget.style.background = '#e0ecf7')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >
                          <i className="ti ti-writing" aria-hidden="true" />
                        </button>

                        <button
                          onClick={() => onVisualizar(fornecedor)}
                          title="Visualizar fornecedor"
                          aria-label={`Visualizar ${fornecedor.fantasia}`}
                          style={btnAcaoStyle}
                          onMouseEnter={e => (e.currentTarget.style.background = '#e0ecf7')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >
                          <i className="ti ti-eye" aria-hidden="true" />
                        </button>

                        <button
                          onClick={() => setConfirmandoExcluirId(fornecedor.id)}
                          title="Excluir fornecedor"
                          aria-label={`Excluir ${fornecedor.fantasia}`}
                          style={{ ...btnAcaoStyle, color: '#dc2626' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >
                          <i className="ti ti-trash" aria-hidden="true" />
                        </button>

                      </div>
                    )}
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================
// Estilos auxiliares
// ============================================================
function thStyle(width?: string, centered?: boolean): React.CSSProperties {
  return {
    padding: '7px 8px',
    fontWeight: 700,
    textAlign: centered ? 'center' : 'left',
    whiteSpace: 'nowrap',
    ...(width ? { width } : {}),
  }
}

function tdStyle(width?: string): React.CSSProperties {
  return {
    padding: '6px 8px',
    color: '#2c4a60',
    whiteSpace: 'nowrap',
    verticalAlign: 'middle',
    ...(width ? { width } : {}),
  }
}

const btnAcaoStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '24px',
  height: '24px',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '2px 4px',
  borderRadius: '3px',
  fontSize: '13px',
  color: '#1a6094',
}
