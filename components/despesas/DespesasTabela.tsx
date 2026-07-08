// ============================================================
// components/despesas/DespesasTabela.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Despesas
// Função: Tabela desktop com todas as despesas filtradas
//         Colunas: Emissão | Nº Doc. | Favorecido | Categoria |
//         Origem | Vencimento | Status | Valor Total | Ações
//         Indicadores visuais: fornecedor auto-criado (aviso) e
//         classificação pendente de revisão manual (badge)
// Conecta com: app/despesas/page.tsx
//              lib/despesasService.ts (formatarCnpjCpf, formatarMoeda, formatarDataBR)
//              types/despesas.ts (Despesa, CATEGORIA_FINANCEIRA_LABELS,
//              ORIGEM_TIPO_LABELS, STATUS_PAGAMENTO_LABELS, STATUS_PAGAMENTO_CORES)
// ============================================================

'use client'

import { useState } from 'react'
import type { Despesa } from '@/types/despesas'
import { CATEGORIA_FINANCEIRA_LABELS, ORIGEM_TIPO_LABELS, STATUS_PAGAMENTO_LABELS, STATUS_PAGAMENTO_CORES } from '@/types/despesas'
import { formatarMoeda, formatarDataBR } from '@/lib/despesasService'

interface DespesasTabelaProps {
  despesas: Despesa[]
  onEditar: (despesa: Despesa) => void
  onExcluir: (despesa: Despesa) => void
  // FEATURE: botão "Visualizar" inline (olho) — abre o mesmo modal do
  // modo 'editar', porém somente leitura (fieldset disabled), sem passar
  // pela confirmação de exclusão nem habilitar campos
  onVisualizar: (despesa: Despesa) => void
}

export default function DespesasTabela({
  despesas,
  onEditar,
  onExcluir,
  onVisualizar,
}: DespesasTabelaProps) {

  const [hoverId, setHoverId] = useState<string | null>(null)
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null)

  // Reseta confirmação de exclusão quando a lista muda (ex: após filtro) —
  // ajuste feito DURANTE o render (padrão recomendado pelo React), não
  // dentro de um useEffect, evitando o erro react-hooks/set-state-in-effect
  const [despesasAnterior, setDespesasAnterior] = useState(despesas)
  if (despesas !== despesasAnterior) {
    setDespesasAnterior(despesas)
    setConfirmandoId(null)
  }

  return (
    <div style={{
      width: '100%', overflowX: 'auto',
      border: '1px solid #dde8f0', borderRadius: '8px',
      fontFamily: 'Tahoma, Geneva, sans-serif',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', tableLayout: 'fixed' }}>
        <thead>
          <tr style={{ background: '#1a6094', color: '#ffffff', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
            <th style={thStyle('6%')}>Emissão</th>
            <th style={thStyle('7%')}>Nº Doc.</th>
            <th style={thStyle('20%')}>Favorecido</th>
            <th style={thStyle('13%')}>Categoria</th>
            <th style={thStyle('10%', true)}>Origem</th>
            <th style={thStyle('7%')}>1º Venc.</th>
            <th style={thStyle('9%', true)}>Status</th>
            <th style={thStyle('9%', true)}>Valor Total</th>
            <th style={thStyle('6%', true)}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {despesas.length === 0 ? (
            <tr>
              <td colSpan={9} style={{ textAlign: 'center', padding: '32px', color: '#5a84a6', fontSize: '12px' }}>
                Nenhuma despesa encontrada.
              </td>
            </tr>
          ) : (
            despesas.map((despesa, index) => {
              const isHover     = hoverId === despesa.id
              const isAlternado = index % 2 !== 0
              const parcelasAtivas = (despesa.parcelas ?? []).filter((p) => !p.deleted_at)
              const primeiraParcela = parcelasAtivas.sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento))[0]
              const corStatus = STATUS_PAGAMENTO_CORES[despesa.status_pagamento]
              const isPessoal = despesa.origem_tipo === 'pessoal_socio'
              const pendenteRevisao = despesa.origem_classificacao_status === 'revisao_manual'

              return (
                <tr
                  key={despesa.id}
                  onMouseEnter={() => setHoverId(despesa.id)}
                  onMouseLeave={() => setHoverId(null)}
                  style={{
                    background: isHover ? '#edf4fb' : isAlternado ? '#f7fafc' : '#ffffff',
                    borderBottom: '1px solid #e8f0f7',
                    transition: 'background 0.1s',
                  }}
                >
                  {/* Emissão */}
                  <td style={tdStyle('6%')}>
                    {despesa.documento_data_emissao ? formatarDataBR(despesa.documento_data_emissao) : '—'}
                  </td>

                  {/* Nº Doc */}
                  <td style={{ ...tdStyle('7%'), fontWeight: 700, color: '#1a6094' }}>
                    {despesa.documento_numero ?? '—'}
                  </td>

                  {/* Favorecido — com indicador de fornecedor auto-criado */}
                  <td style={{ ...tdStyle('20%'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {despesa.favorecido_nome}
                    {despesa.fornecedor_auto_criado && (
                      <i
                        className="ti ti-alert-triangle"
                        title="Fornecedor criado automaticamente — dados incompletos, revisar cadastro"
                        style={{ marginLeft: '5px', color: '#c98a1e', fontSize: '12px' }}
                        aria-hidden="true"
                      />
                    )}
                  </td>

                  {/* Categoria financeira */}
                  <td style={{ ...tdStyle('13%'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#5a84a6' }}>
                    {CATEGORIA_FINANCEIRA_LABELS[despesa.categoria_financeira]}
                  </td>

                  {/* Origem — badge empresarial x pessoal, com aviso de revisão pendente */}
                  <td style={{ ...tdStyle('10%'), textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 7px',
                      borderRadius: '10px',
                      fontSize: '10px',
                      fontWeight: 700,
                      background: isPessoal ? '#fce7f3' : '#dbeafe',
                      color: isPessoal ? '#9d174d' : '#1e40af',
                    }}>
                      {ORIGEM_TIPO_LABELS[despesa.origem_tipo]}
                    </span>
                    {pendenteRevisao && (
                      <i
                        className="ti ti-help-circle"
                        title="Classificação automática não teve sinais suficientes — revisar manualmente"
                        style={{ marginLeft: '4px', color: '#c98a1e', fontSize: '12px' }}
                        aria-hidden="true"
                      />
                    )}
                  </td>

                  {/* Primeiro vencimento entre as parcelas ativas */}
                  <td style={tdStyle('7%')}>
                    {primeiraParcela ? formatarDataBR(primeiraParcela.data_vencimento) : '—'}
                  </td>

                  {/* Status */}
                  <td style={{ ...tdStyle('9%'), textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 7px', borderRadius: '10px',
                      fontSize: '10px', fontWeight: 700,
                      background: corStatus.bg, color: corStatus.text,
                    }}>
                      {STATUS_PAGAMENTO_LABELS[despesa.status_pagamento]}
                    </span>
                  </td>

                  {/* Valor Total */}
                  <td style={{ ...tdStyle('9%'), textAlign: 'right', fontWeight: 700, color: '#1a6094' }}>
                    {formatarMoeda(despesa.valor_total)}
                  </td>

                  {/* Ações */}
                  <td style={{ ...tdStyle('6%'), textAlign: 'center' }}>
                    {confirmandoId === despesa.id ? (
                      <div style={{ display: 'flex', gap: '3px', justifyContent: 'center' }}>
                        <button
                          onClick={() => { onExcluir(despesa); setConfirmandoId(null) }}
                          style={{ ...btnAcaoStyle, color: '#dc2626', fontSize: '10px', width: 'auto', padding: '2px 5px' }}
                        >Excluir</button>
                        <button
                          onClick={() => setConfirmandoId(null)}
                          style={{ ...btnAcaoStyle, fontSize: '10px', width: 'auto', padding: '2px 5px' }}
                        >Não</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                        <button onClick={() => onVisualizar(despesa)} title="Visualizar despesa" style={btnAcaoStyle}>
                          <i className="ti ti-eye" aria-hidden="true" />
                        </button>
                        <button onClick={() => onEditar(despesa)} title="Editar despesa" style={btnAcaoStyle}>
                          <i className="ti ti-writing" aria-hidden="true" />
                        </button>
                        <button onClick={() => setConfirmandoId(despesa.id)} title="Cancelar despesa"
                          style={{ ...btnAcaoStyle, color: '#dc2626' }}>
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
