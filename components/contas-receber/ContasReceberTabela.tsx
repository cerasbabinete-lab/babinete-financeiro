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
// Conecta com: app/receber/page.tsx
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
  onBaixar:     (t: ContaReceber) => void  // Trigger confirmação de baixa inline (botão "Baixar" na linha)
}

export default function ContasReceberTabela({
  titulos,
  onVisualizar,
  onEditar,
  onCancelar,
  onBaixar,
}: ContasReceberTabelaProps) {

  // ID do título com hover ativo — para highlight de linha
  const [hoverId, setHoverId] = useState<string | null>(null)

  // Ação em confirmação inline na linha — guarda o id do título E qual
  // ação está sendo confirmada ('cancelar' ou 'baixar'), já que as duas
  // usam o mesmo padrão visual de "trocar os botões por Sim/Não"
  const [acaoConfirmando, setAcaoConfirmando] = useState<{ id: string; tipo: 'cancelar' | 'baixar' } | null>(null)

  // Reseta confirmação quando a lista muda (ex: após filtro ou operação)
  useEffect(() => { setAcaoConfirmando(null) }, [titulos])

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
              const isEmAberto  = titulo.status === 'em_aberto' // Único status que mostra o botão "Baixar" inline

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

                  {/* Status — badge colorido; em_aberto assume cor da urgência */}
                  <td style={{ ...tdBase(textColor), textAlign: 'center' }}>
                    <StatusBadge
                      status={titulo.status}
                      cancelado={isCancelado}
                      isVencido={isVencido}
                      isNearDue={isNearDue}
                    />
                  </td>

                  {/* Ações */}
                  <td style={{ ...tdBase(textColor), textAlign: 'center' }}>
                    {acaoConfirmando?.id === titulo.id ? (
                      // Confirmação inline — texto e ação variam conforme acaoConfirmando.tipo
                      <div style={{ display: 'flex', gap: '3px', justifyContent: 'center', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px', color: '#5a84a6', marginRight: '2px', whiteSpace: 'nowrap' }}>
                          {acaoConfirmando.tipo === 'baixar' ? 'Confirma baixa?' : 'Confirma cancelar?'}
                        </span>
                        <button
                          onClick={() => {
                            if (acaoConfirmando.tipo === 'baixar') onBaixar(titulo)
                            else onCancelar(titulo)
                            setAcaoConfirmando(null)
                          }}
                          style={{
                            ...btnAcao,
                            color: acaoConfirmando.tipo === 'baixar' ? '#28a745' : '#dc2626',
                            fontSize: '10px', width: 'auto', padding: '2px 5px',
                          }}
                          onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = acaoConfirmando.tipo === 'baixar' ? '#eaf7ee' : '#fef2f2')}
                          onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = 'none')}
                        >
                          Sim
                        </button>
                        <button
                          onClick={() => setAcaoConfirmando(null)}
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

                        {/* Editar — liberado para todos os status, inclusive pago (C: editável mesmo após baixa) — exceto cancelado */}
                        <button
                          onClick={() => { if (!isCancelado) onEditar(titulo) }}
                          title={isCancelado ? 'Título cancelado' : 'Editar título'}
                          style={{
                            ...btnAcao,
                            opacity:  isCancelado ? 0.35 : 1,
                            cursor:   isCancelado ? 'not-allowed' : 'pointer',
                          }}
                          onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => { if (!isCancelado) e.currentTarget.style.background = '#e0ecf7' }}
                          onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = 'none')}
                        >
                          <i className="ti ti-pencil" aria-hidden="true" />
                        </button>

                        {/* Baixar — botão inline, só visível para títulos em_aberto (Pergunta 1-2 do brainstorm) */}
                        {isEmAberto && (
                          <button
                            onClick={() => setAcaoConfirmando({ id: titulo.id, tipo: 'baixar' })}
                            title="Baixar título"
                            style={{ ...btnAcao, color: '#28a745' }}
                            onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = '#eaf7ee')}
                            onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = 'none')}
                          >
                            <i className="ti ti-check" aria-hidden="true" />
                          </button>
                        )}

                        {/* Cancelar — oculto para já cancelados */}
                        {!isCancelado && (
                          <button
                            onClick={() => setAcaoConfirmando({ id: titulo.id, tipo: 'cancelar' })}
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
// Quando status = 'em_aberto': cor reflete urgência (vencido=vermelho, near-due=âmbar, normal=azul)
// ============================================================
function StatusBadge({
  status,
  cancelado,
  isVencido = false,
  isNearDue = false,
}: {
  status:     string
  cancelado:  boolean
  isVencido?: boolean
  isNearDue?: boolean
}) {
  const label = STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status

  // Para 'em_aberto': sobrescreve cor baseado na urgência do vencimento
  // Outros status usam as cores fixas do STATUS_CORES
  let bg:   string
  let text: string

  if (cancelado) {
    bg   = '#f1f1f1'
    text = '#bbb'
  } else if (status === 'em_aberto' && isVencido) {
    // Atrasado — vermelho (mesma paleta da linha)
    bg   = '#fde8e8'
    text = '#c0392b'
  } else if (status === 'em_aberto' && isNearDue) {
    // Próximo do vencimento — âmbar (mesma paleta da linha)
    bg   = '#fff8e1'
    text = '#b07d00'
  } else {
    // Status normal — usa cores fixas do tipo
    const cores = STATUS_CORES[status as keyof typeof STATUS_CORES]
    bg   = cores?.bg   ?? '#f0f4f7'
    text = cores?.text ?? '#5a84a6'
  }

  return (
    <span style={{
      display:      'inline-block',
      padding:      '2px 7px',
      borderRadius: '10px',
      fontSize:     '10px',
      fontWeight:   700,
      background:   bg,
      color:        text,
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
