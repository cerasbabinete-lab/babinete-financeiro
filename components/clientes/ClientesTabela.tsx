// ============================================================
// components/clientes/ClientesTabela.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Clientes
// Função: Tabela desktop com todos os clientes filtrados
//         Linhas alternadas, hover, botões editar e visualizar
//         Colunas: Cód. | Nome Fantasia | Razão Social | CNPJ/CPF
//                  Cidade/UF | Telefone | E-mail | Contato | Lista | Ações
// Conecta com: app/clientes/page.tsx (clientes, onEditar, onVisualizar, onExcluir)
//              types/clientes.ts (Cliente)
// ============================================================

'use client'

import { useState } from 'react'
import type { Cliente } from '@/types/clientes'

// ============================================================
// Props
// ============================================================
interface ClientesTabelaProps {
  clientes: Cliente[]
  onEditar: (cliente: Cliente) => void
  onVisualizar: (cliente: Cliente) => void
  onExcluir: (cliente: Cliente) => void
}

// ============================================================
// ClientesTabela
// ============================================================
export default function ClientesTabela({
  clientes,
  onEditar,
  onVisualizar,
  onExcluir,
}: ClientesTabelaProps) {

  const [hoverId, setHoverId] = useState<number | null>(null)
  // id do cliente aguardando confirmação de exclusão (null = nenhum)
  const [confirmandoExcluirId, setConfirmandoExcluirId] = useState<number | null>(null)

  // ============================================================
  // formatarLista
  // ============================================================
  function formatarLista(nomelista: string): string {
    if (nomelista === '0') return 'Inativo'
    if (nomelista === 'VAREJO') return 'VAREJO'
    return `${nomelista}`
  }

  // ============================================================
  // formatarCidadeUF
  // ============================================================
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
          minWidth: '900px',
        }}
      >
        {/* Cabeçalho */}
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
            <th style={thStyle('50px')}>Lista</th>
            <th style={thStyle('80px', true)}>Ações</th>
          </tr>
        </thead>

        {/* Corpo */}
        <tbody>
          {clientes.length === 0 ? (
            <tr>
              <td
                colSpan={10}
                style={{
                  textAlign: 'center',
                  padding: '32px',
                  color: '#5a84a6',
                  fontSize: '12px',
                }}
              >
                Nenhum cliente encontrado.
              </td>
            </tr>
          ) : (
            clientes.map((cliente, index) => {
              const isHover = hoverId === cliente.id
              const isAlternado = index % 2 !== 0

              return (
                <tr
                  key={cliente.id}
                  onMouseEnter={() => setHoverId(cliente.id)}
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
                  {/* Código */}
                  <td style={tdStyle('42px')}>{cliente.id}</td>

                  {/* Nome Fantasia — azul bold */}
                  <td style={{ ...tdStyle(), fontWeight: 700, color: '#1a6094' }}>
                    {cliente.fantasia || '—'}
                  </td>

                  {/* Razão Social */}
                  <td style={tdStyle()}>{cliente.razao || '—'}</td>

                  {/* CNPJ/CPF — exibe o primeiro preenchido ou '—' se ambos vazios */}
                  {/* Comparações com mask-strings removidas: não devem existir no banco */}
                  <td style={tdStyle()}>
                    {cliente.cnpj
                      ? cliente.cnpj
                      : cliente.cpf
                      ? cliente.cpf
                      : '—'}
                  </td>

                  {/* Cidade/UF */}
                  <td style={tdStyle()}>
                    {formatarCidadeUF(cliente.cidade, cliente.uf)}
                  </td>

                  {/* Telefone */}
                  <td style={tdStyle()}>{cliente.fone1 || '—'}</td>

                  {/* E-mail */}
                  <td style={{
                    ...tdStyle(),
                    maxWidth: '160px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {cliente.email || '—'}
                  </td>

                  {/* Contato */}
                  <td style={tdStyle()}>{cliente.contato || '—'}</td>

                  {/* Lista */}
                  <td style={{
                    ...tdStyle('50px'),
                    color: cliente.nomelista === 'VAREJO' ? '#1a6094' : '#3a6080',
                    fontWeight: cliente.nomelista === 'VAREJO' ? 700 : 400,
                  }}>
                    {formatarLista(cliente.nomelista)}
                  </td>

                  {/* Ações */}
                  <td style={{ ...tdStyle('80px'), textAlign: 'center' }}>
                    {confirmandoExcluirId === cliente.id ? (
                      // Confirmação inline — sem alert/confirm
                      <div style={{ display: 'flex', gap: '3px', justifyContent: 'center' }}>
                        <button
                          onClick={() => { onExcluir(cliente); setConfirmandoExcluirId(null) }}
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
                          onClick={() => onEditar(cliente)}
                          title="Editar cliente"
                          aria-label={`Editar ${cliente.fantasia ?? cliente.razao}`}
                          style={btnAcaoStyle}
                          onMouseEnter={e => (e.currentTarget.style.background = '#e0ecf7')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >
                          <i className="ti ti-writing" aria-hidden="true" />
                        </button>

                        <button
                          onClick={() => onVisualizar(cliente)}
                          title="Visualizar cliente"
                          aria-label={`Visualizar ${cliente.fantasia ?? cliente.razao}`}
                          style={btnAcaoStyle}
                          onMouseEnter={e => (e.currentTarget.style.background = '#e0ecf7')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >
                          <i className="ti ti-eye" aria-hidden="true" />
                        </button>

                        <button
                          onClick={() => setConfirmandoExcluirId(cliente.id)}
                          title="Excluir cliente"
                          aria-label={`Excluir ${cliente.fantasia ?? cliente.razao}`}
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
