// ============================================================
// components/contas-receber/ContasReceberTabela.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Receber
// Função: Tabela desktop de títulos a receber
//         Colunas: Vencimento | Nº Doc. | Nome Fantasia | CNPJ/CPF |
//                  Nome/Razão Social | Cidade/UF | Dt. Process. |
//                  Nosso Número | Valor | Status | Ações
//         Row states: vencido (vermelho), near-due (âmbar),
//                     cancelado (cinza), pago (normal)
// Conecta com: app/contas-receber/page.tsx
//              contasReceberService.ts (formatadores, isTituloVencido, etc.)
//              types/contasReceber.ts (ContaReceber, STATUS_LABELS, STATUS_CORES)
// ============================================================

'use client'

import { useEffect, useState } from 'react'
import type { ContaReceber } from '@/types/contasReceber'
import { STATUS_LABELS, STATUS_CORES } from '@/types/contasReceber'
import {
  formatarCnpjCpf,
  formatarMoeda,
  formatarDataBR,
  formatarNossoNumero,
  isTituloVencido,
  isTituloNearVencimento,
} from '@/lib/contasReceberService'

interface ContasReceberTabelaProps {
  titulos:      ContaReceber[]
  onVisualizar: (t: ContaReceber) => void
  onEditar:     (t: ContaReceber) => void
  onCancelar:   (t: ContaReceber) => void  // Trigger confirmação de cancelamento
}

export default function ContasReceberTabela({
  titulos,
  onVisualizar,
  onEditar,
  onCancelar,
}: ContasReceberTabelaProps) {

  // ID do título com hover ativo — para highlight de linha
  const [hoverId, setHoverId] = useState<string | null>(null)

  // ID do título em confirmação de cancelamento inline na linha
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null)

  // Reseta confirmação quando a lista muda (ex: após filtro ou operação)
  useEffect(() => { setConfirmandoId(null) }, [titulos])

  return (
    <div style={{
      width:        '100%',
      overflowX:    'auto',
      border:       '1px solid #dde8f0',
      borderRadius: '8px',
      fontFamily:   'Tahoma, Geneva, sans-serif',
    }}>
      <table style={{
        width:           '100%',
        borderCollapse:  'collapse',
        fontSize:        '11px',
        tableLayout:     'fixed',
        minWidth:        '860px', // Scroll horizontal abaixo desse tamanho
      }}>

        {/* ── Cabeçalho ── */}
        <thead>
          <tr style={{
            background:      '#1a6094',
            color:           '#ffffff',
            fontSize:        '10px',
            textTransform:   'uppercase',
            letterSpacing:   '0.02em',
          }}>
            <th style={thStyle('7%')}>Vencimento</th>
            <th style={thStyle('6%')}>Nº Doc.</th>
            <th style={thStyle('9%')}>Nome Fantasia</th>
            <th style={thStyle('9%')}>CNPJ / CPF</th>
            <th style={thStyle('16%')}>Nome / Razão Social</th>
            <th style={thStyle('8%')}>Cidade / UF</th>
            <th style={thStyle('8%')}>Dt. Process.</th>
            <th style={thStyle('15%')}>Nosso Número</th>
            <th style={thStyle('6%', true)}>Valor</th>
            <th style={thStyle('7%', true)}>Status</th>
            <th style={thStyle('7%', true)}>Ações</th>
          </tr>
        </thead>

        {/* ── Corpo ── */}
        <tbody>
          {titulos.length === 0 ? (
            // Estado vazio
            <tr>
              <td colSpan={11} style={{
                textAlign:  'center',
                padding:    '32px',
                color:      '#5a84a6',
                fontSize:   '12px',
              }}>
                Nenhum título encontrado.
              </td>
            </tr>
          ) : (
            titulos.map((titulo, index) => {
              const isHover     = hoverId === titulo.id
              const isAlternado = index % 2 !== 0
              const isCancelado = titulo.status === 'cancelado'
              const isVencido   = isTituloVencido(titulo)
              const isNearDue   = isTituloNearVencimento(titulo)
              const isPago      = titulo.status === 'pago' || titulo.status === 'recebido_pix_ted'

              // Determina cor de fundo da linha baseado no estado
              let bgRow: string
              if (isVencido)        bgRow = '#fff5f5'         // Vermelho claro para vencido
              else if (isNearDue)   bgRow = '#fffde7'         // Âmbar claro para near-due
              else if (isHover)     bgRow = '#edf4fb'         // Hover
              else if (isAlternado) bgRow = '#f7fafc'         // Alternado
              else                  bgRow = '#ffffff'         // Normal

              // Cor do texto para cancelados — tudo cinza
              const textColor = isCancelado ? '#bbb' : '#2c4a60'

              return (
                <tr
                  key={titulo.id}
                  onMouseEnter={() => setHoverId(titulo.id)}
                  onMouseLeave={() => setHoverId(null)}
                  style={{
                    background:    bgRow,
                    borderBottom:  '1px solid #e8f0f7',
                    transition:    'background 0.1s',
                    opacity:       isCancelado ? 0.7 : 1,
                  }}
                >
                  {/* Vencimento — colorido por estado */}
                  <td style={{
                    ...tdBase(textColor),
                    fontWeight: isVencido ? 700 : isNearDue ? 600 : 400,
                    color:      isVencido ? '#c0392b'
                              : isNearDue ? '#b07d00'
                              : isCancelado ? '#bbb'
                              : '#2c4a60',
                  }}>
                    {formatarDataBR(titulo.data_vencimento)}
                  </td>

                  {/* Nº Doc. — bold e azul */}
                  <td style={{ ...tdBase(textColor), fontWeight: 700, color: isCancelado ? '#bbb' : '#1a6094' }}>
                    {titulo.numero_documento}
                  </td>

                  {/* Nome Fantasia — itálico, secundário */}
                  <td style={{
                    ...tdBase(textColor),
                    fontStyle:    'italic',
                    fontSize:     '10px',
                    color:        isCancelado ? '#bbb' : '#5a84a6',
                    overflow:     'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace:   'nowrap',
                  }}>
                    {titulo.cliente_fantasia ?? '—'}
                  </td>

                  {/* CNPJ / CPF — monospace pequeno */}
                  <td style={{
                    ...tdBase(textColor),
                    fontFamily: '\'Courier New\', monospace',
                    fontSize:   '10px',
                    color:      isCancelado ? '#bbb' : '#7a9db8',
                  }}>
                    {formatarCnpjCpf(titulo.cliente_cpf_cnpj)}
                  </td>

                  {/* Nome / Razão Social — truncado */}
                  <td style={{
                    ...tdBase(textColor),
                    overflow:     'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace:   'nowrap',
                  }}>
                    {titulo.cliente_nome}
                  </td>

                  {/* Cidade / UF */}
                  <td style={tdBase(textColor)}>
                    {titulo.cliente_municipio && titulo.cliente_uf
                      ? `${titulo.cliente_municipio} / ${titulo.cliente_uf}`
                      : titulo.cliente_municipio ?? '—'}
                  </td>

                  {/* Dt. Processamento */}
                  <td style={tdBase(textColor)}>
                    {formatarDataBR(titulo.data_processamento)}
                  </td>

                  {/* Nosso Número — Courier New bold azul */}
                  <td style={{
                    ...tdBase(textColor),
                    fontFamily:    '\'Courier New\', monospace',
                    fontSize:      '12px',
                    fontWeight:    700,
                    color:         isCancelado ? '#bbb' : '#1a5276',
                    letterSpacing: '0.04em',
                    whiteSpace:    'nowrap',
                    overflow:      'hidden',
                    textOverflow:  'ellipsis',
                  }}>
                    {titulo.nosso_numero
                      ? formatarNossoNumero(titulo.nosso_numero)
                      : <span style={{ color: '#c5d8e8', fontStyle: 'italic', fontSize: '10px' }}>—</span>}
                  </td>

                  {/* Valor — bold alinhado à direita */}
                  <td style={{
                    ...tdBase(textColor),
                    textAlign:  'right',
                    fontWeight: 700,
                    color:      isCancelado ? '#bbb' : '#1a6094',
                  }}>
                    {formatarMoeda(titulo.valor)}
                  </td>

                  {/* Status — badge colorido */}
                  <td style={{ ...tdBase(textColor), textAlign: 'center' }}>
                    <StatusBadge status={titulo.status} cancelado={isCancelado} />
                  </td>

                  {/* Ações */}
                  <td style={{ ...tdBase(textColor), textAlign: 'center' }}>
                    {confirmandoId === titulo.id ? (
                      // Confirmação inline de cancelamento
                      <div style={{ display: 'flex', gap: '3px', justifyContent: 'center' }}>
                        <button
                          onClick={() => { onCancelar(titulo); setConfirmandoId(null) }}
                          style={{ ...btnAcao, color: '#dc2626', fontSize: '10px', width: 'auto', padding: '2px 5px' }}
                          onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = '#fef2f2')}
                          onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = 'none')}
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => setConfirmandoId(null)}
                          style={{ ...btnAcao, fontSize: '10px', width: 'auto', padding: '2px 5px' }}
                          onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = '#e0ecf7')}
                          onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = 'none')}
                        >
                          Não
                        </button>
                      </div>
                    ) : (
                      // Botões normais de ação
                      <div style={{ display: 'flex', gap: '3px', justifyContent: 'center' }}>

                        {/* Visualizar — sempre visível */}
                        <button
                          onClick={() => onVisualizar(titulo)}
                          title="Visualizar título"
                          style={btnAcao}
                          onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = '#e0ecf7')}
                          onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = 'none')}
                        >
                          <i className="ti ti-eye" aria-hidden="true" />
                        </button>

                        {/* Editar — desabilitado para pago (RET) e cancelado */}
                        <button
                          onClick={() => { if (!isPago && !isCancelado) onEditar(titulo) }}
                          title={isPago ? 'Título pago não pode ser editado' : isCancelado ? 'Título cancelado' : 'Editar título'}
                          style={{
                            ...btnAcao,
                            opacity:  isPago || isCancelado ? 0.35 : 1,
                            cursor:   isPago || isCancelado ? 'not-allowed' : 'pointer',
                          }}
                          onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => { if (!isPago && !isCancelado) e.currentTarget.style.background = '#e0ecf7' }}
                          onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = 'none')}
                        >
                          <i className="ti ti-pencil" aria-hidden="true" />
                        </button>

                        {/* Cancelar — oculto para já cancelados */}
                        {!isCancelado && (
                          <button
                            onClick={() => setConfirmandoId(titulo.id)}
                            title="Cancelar título"
                            style={{ ...btnAcao, color: '#dc2626' }}
                            onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = '#fef2f2')}
                            onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = 'none')}
                          >
                            <i className="ti ti-ban" aria-hidden="true" />
                          </button>
                        )}
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
// StatusBadge
// Badge pill colorido para cada status do título
// ============================================================
function StatusBadge({ status, cancelado }: { status: string; cancelado: boolean }) {
  const cores = STATUS_CORES[status as keyof typeof STATUS_CORES]
  const label = STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status

  return (
    <span style={{
      display:      'inline-block',
      padding:      '2px 7px',
      borderRadius: '10px',
      fontSize:     '10px',
      fontWeight:   700,
      background:   cancelado ? '#f1f1f1' : (cores?.bg ?? '#f0f4f7'),
      color:        cancelado ? '#bbb' : (cores?.text ?? '#5a84a6'),
      whiteSpace:   'nowrap',
    }}>
      {label}
    </span>
  )
}

// ── Estilos utilitários ────────────────────────────────────

function thStyle(width?: string, centered?: boolean): React.CSSProperties {
  return {
    padding:    '7px 8px',
    fontWeight: 700,
    textAlign:  centered ? 'center' : 'left',
    whiteSpace: 'nowrap',
    ...(width ? { width } : {}),
  }
}

function tdBase(color: string): React.CSSProperties {
  return {
    padding:       '5px 5px',
    color,
    whiteSpace:    'nowrap',
    verticalAlign: 'middle',
  }
}

const btnAcao: React.CSSProperties = {
  display:        'inline-flex',
  alignItems:     'center',
  justifyContent: 'center',
  width:          '22px',
  height:         '22px',
  background:     'none',
  border:         'none',
  cursor:         'pointer',
  padding:        '2px',
  borderRadius:   '3px',
  fontSize:       '13px',
  color:          '#1a6094',
}
