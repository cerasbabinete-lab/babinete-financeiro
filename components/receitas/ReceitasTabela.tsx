// ============================================================
// components/receitas/ReceitasTabela.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Receitas
// Função: Tabela desktop com todas as receitas filtradas
//         Colunas: Emissão | Nº Doc. | Nome/Razão Social |
//         CNPJ/CPF | Cidade/UF | Transportadora | Dupl. |
//         Prazos | Forma Pgto | Valor Total | Ações
// Conecta com: app/receitas/page.tsx
//              receitasService.ts (calcularPrazos, calcularFormaPagamento,
//                                  formatarCnpjCpf, formatarMoeda, formatarDataBR)
//              types/receitas.ts (Receita)
// ============================================================

'use client'

import { useState } from 'react'
import type { Receita } from '@/types/receitas'
import {
  calcularPrazos,
  calcularFormaPagamento,
  formatarCnpjCpf,
  formatarMoeda,
  formatarDataBR,
} from '@/lib/receitasService'

interface ReceitasTabelaProps {
  receitas: Receita[]
  onEditar: (receita: Receita) => void
  onVisualizar: (receita: Receita) => void
  onExcluir: (receita: Receita) => void
}

export default function ReceitasTabela({
  receitas,
  onEditar,
  onVisualizar,
  onExcluir,
}: ReceitasTabelaProps) {

  const [hoverId, setHoverId] = useState<string | null>(null)
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null)

  return (
    <div style={{
      width: '100%', overflowX: 'auto',
      border: '1px solid #dde8f0', borderRadius: '8px',
      fontFamily: 'Tahoma, Geneva, sans-serif',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', minWidth: '1100px' }}>
        <thead>
          <tr style={{ background: '#1a6094', color: '#ffffff', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
            <th style={thStyle('78px')}>Emissão</th>
            <th style={thStyle('60px')}>Nº Doc.</th>
            <th style={thStyle()}>Nome / Razão Social</th>
            <th style={thStyle('130px')}>CNPJ / CPF</th>
            <th style={thStyle('110px')}>Cidade / UF</th>
            <th style={thStyle('120px')}>Transportadora</th>
            <th style={thStyle('44px', true)}>Dupl.</th>
            <th style={thStyle('90px')}>Prazos</th>
            <th style={thStyle('80px')}>Forma Pgto</th>
            <th style={thStyle('90px', true)}>Valor Total</th>
            <th style={thStyle('80px', true)}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {receitas.length === 0 ? (
            <tr>
              <td colSpan={11} style={{ textAlign: 'center', padding: '32px', color: '#5a84a6', fontSize: '12px' }}>
                Nenhuma receita encontrada.
              </td>
            </tr>
          ) : (
            receitas.map((receita, index) => {
              const isHover     = hoverId === receita.id
              const isAlternado = index % 2 !== 0
              const duplicatas  = receita.duplicatas ?? []
              const prazos      = calcularPrazos(receita.data_emissao, duplicatas)
              const formaPgto   = calcularFormaPagamento(duplicatas)
              const isBoleto    = formaPgto === 'Boleto'

              return (
                <tr
                  key={receita.id}
                  onMouseEnter={() => setHoverId(receita.id)}
                  onMouseLeave={() => setHoverId(null)}
                  style={{
                    background: isHover ? '#edf4fb' : isAlternado ? '#f7fafc' : '#ffffff',
                    borderBottom: '1px solid #e8f0f7',
                    transition: 'background 0.1s',
                  }}
                >
                  {/* Emissão */}
                  <td style={tdStyle('78px')}>
                    {formatarDataBR(receita.data_emissao)}
                  </td>

                  {/* Nº Doc */}
                  <td style={{ ...tdStyle('60px'), fontWeight: 700, color: '#1a6094' }}>
                    {receita.numero_nf}
                  </td>

                  {/* Nome / Razão Social */}
                  <td style={{ ...tdStyle(), maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {receita.cliente_nome ?? '—'}
                  </td>

                  {/* CNPJ / CPF */}
                  <td style={tdStyle('130px')}>
                    {receita.cliente_cpf_cnpj ? formatarCnpjCpf(receita.cliente_cpf_cnpj) : '—'}
                  </td>

                  {/* Cidade / UF */}
                  <td style={tdStyle('110px')}>
                    {receita.cliente_municipio && receita.cliente_uf
                      ? `${receita.cliente_municipio} / ${receita.cliente_uf}`
                      : receita.cliente_municipio ?? '—'}
                  </td>

                  {/* Transportadora */}
                  <td style={{ ...tdStyle('120px'), maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {receita.modalidade_frete === 9
                      ? 'Sem frete'
                      : receita.transportadora?.nome ?? '—'}
                  </td>

                  {/* Duplicatas count */}
                  <td style={{ ...tdStyle('44px'), textAlign: 'center' }}>
                    {duplicatas.length > 0 ? `${duplicatas.length}x` : '—'}
                  </td>

                  {/* Prazos */}
                  <td style={tdStyle('90px')}>{prazos}</td>

                  {/* Forma Pgto */}
                  <td style={tdStyle('80px')}>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 7px',
                      borderRadius: '10px',
                      fontSize: '10px',
                      fontWeight: 700,
                      background: isBoleto ? '#dbeafe' : '#eaf3de',
                      color: isBoleto ? '#1e40af' : '#3b6d11',
                    }}>
                      {formaPgto}
                    </span>
                  </td>

                  {/* Valor Total */}
                  <td style={{ ...tdStyle('90px'), textAlign: 'right', fontWeight: 700, color: '#1a6094' }}>
                    {formatarMoeda(receita.valor_nf)}
                  </td>

                  {/* Ações */}
                  <td style={{ ...tdStyle('80px'), textAlign: 'center' }}>
                    {confirmandoId === receita.id ? (
                      <div style={{ display: 'flex', gap: '3px', justifyContent: 'center' }}>
                        <button
                          onClick={() => { onExcluir(receita); setConfirmandoId(null) }}
                          style={{ ...btnAcaoStyle, color: '#dc2626', fontSize: '10px', width: 'auto', padding: '2px 5px' }}
                          onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = '#fef2f2')}
                          onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = 'none')}
                        >Excluir</button>
                        <button
                          onClick={() => setConfirmandoId(null)}
                          style={{ ...btnAcaoStyle, fontSize: '10px', width: 'auto', padding: '2px 5px' }}
                          onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = '#e0ecf7')}
                          onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = 'none')}
                        >Não</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                        <button onClick={() => onEditar(receita)} title="Editar receita" style={btnAcaoStyle}
                          onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = '#e0ecf7')}
                          onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = 'none')}>
                          <i className="ti ti-writing" aria-hidden="true" />
                        </button>
                        <button onClick={() => onVisualizar(receita)} title="Visualizar receita" style={btnAcaoStyle}
                          onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = '#e0ecf7')}
                          onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = 'none')}>
                          <i className="ti ti-eye" aria-hidden="true" />
                        </button>
                        <button onClick={() => setConfirmandoId(receita.id)} title="Excluir receita"
                          style={{ ...btnAcaoStyle, color: '#dc2626' }}
                          onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = '#fef2f2')}
                          onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = 'none')}>
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

function thStyle(width?: string, centered?: boolean): React.CSSProperties {
  return { padding: '7px 8px', fontWeight: 700, textAlign: centered ? 'center' : 'left', whiteSpace: 'nowrap', ...(width ? { width } : {}) }
}

function tdStyle(width?: string): React.CSSProperties {
  return { padding: '6px 8px', color: '#2c4a60', whiteSpace: 'nowrap', verticalAlign: 'middle', ...(width ? { width } : {}) }
}

const btnAcaoStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: '24px', height: '24px', background: 'none', border: 'none',
  cursor: 'pointer', padding: '2px 4px', borderRadius: '3px',
  fontSize: '13px', color: '#1a6094',
}
