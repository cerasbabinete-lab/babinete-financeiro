// ============================================================
// components/contas-receber/ContasReceberMobileList.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Receber
// Função: Lista mobile de títulos em cards
//         Toque no card → bottom-sheet com ações
//         Cards coloridos por estado (vencido, near-due, cancelado)
// Conecta com: app/receber/page.tsx
//              contasReceberService.ts (formatadores, isTitulo*)
//              types/contasReceber.ts (ContaReceber, STATUS_LABELS, STATUS_CORES)
// ============================================================

'use client'

import { useEffect, useState } from 'react'
import type { ContaReceber } from '@/types/contasReceber'
import { STATUS_LABELS, STATUS_CORES } from '@/types/contasReceber'
import {
  formatarMoeda,
  formatarDataBR,
  isTituloVencido,
  isTituloNearVencimento,
} from '@/lib/contasReceberService'

interface ContasReceberMobileListProps {
  titulos:      ContaReceber[]
  onVisualizar: (t: ContaReceber) => void
  onEditar:     (t: ContaReceber) => void
  onCancelar:   (t: ContaReceber) => void
}

export default function ContasReceberMobileList({
  titulos,
  onVisualizar,
  onEditar,
  onCancelar,
}: ContasReceberMobileListProps) {

  // ID do título com bottom-sheet aberto
  const [sheetId, setSheetId] = useState<string | null>(null)

  // ID do título em confirmação de cancelamento no sheet
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null)

  // Reseta ao mudar a lista (filtro, operação, etc.)
  useEffect(() => { setSheetId(null); setConfirmandoId(null) }, [titulos])

  if (titulos.length === 0) {
    return (
      <div style={{
        textAlign:  'center',
        padding:    '32px 16px',
        color:      '#5a84a6',
        fontSize:   '12px',
        fontFamily: 'Tahoma, Geneva, sans-serif',
      }}>
        Nenhum título encontrado.
      </div>
    )
  }

  // Título do bottom-sheet ativo
  const tituloSheet = titulos.find(t => t.id === sheetId) ?? null

  return (
    <>
      {/* ── Lista de cards ── */}
      <div style={{
        display:        'flex',
        flexDirection:  'column',
        gap:            '1px',
        fontFamily:     'Tahoma, Geneva, sans-serif',
        paddingBottom:  '80px', // Espaço para a Basebar
      }}>
        {titulos.map(titulo => {
          const isVencido  = isTituloVencido(titulo)
          const isNearDue  = isTituloNearVencimento(titulo)
          const isCancelado = titulo.status === 'cancelado'
          const cores      = STATUS_CORES[titulo.status as keyof typeof STATUS_CORES]
          const label      = STATUS_LABELS[titulo.status as keyof typeof STATUS_LABELS]

          // Cor da borda esquerda do card por estado
          const borderColor = isVencido   ? '#c0392b'
                            : isNearDue   ? '#b07d00'
                            : isCancelado ? '#bbb'
                            : '#dde8f0'

          return (
            <div
              key={titulo.id}
              onClick={() => { setSheetId(titulo.id); setConfirmandoId(null) }}
              style={{
                background:   '#ffffff',
                borderBottom: '1px solid #e8f0f7',
                borderLeft:   `3px solid ${borderColor}`,
                padding:      '10px 16px 10px 13px',
                cursor:       'pointer',
                opacity:      isCancelado ? 0.65 : 1,
              }}
            >
              {/* Linha 1: vencimento + valor */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                <span style={{
                  fontSize:   '10px',
                  fontWeight: isVencido ? 700 : 400,
                  color:      isVencido ? '#c0392b' : isNearDue ? '#b07d00' : '#5a84a6',
                }}>
                  {formatarDataBR(titulo.data_vencimento)} · {titulo.numero_documento}
                </span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: isCancelado ? '#bbb' : '#1a6094' }}>
                  {formatarMoeda(titulo.valor)}
                </span>
              </div>

              {/* Linha 2: nome */}
              <div style={{
                fontSize:     '12px',
                fontWeight:   700,
                color:        isCancelado ? '#bbb' : '#2c4a60',
                marginBottom: '4px',
                overflow:     'hidden',
                textOverflow: 'ellipsis',
                whiteSpace:   'nowrap',
              }}>
                {titulo.cliente_nome}
              </div>

              {/* Linha 3: status + cidade */}
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span style={{
                  display:      'inline-block',
                  padding:      '1px 6px',
                  borderRadius: '8px',
                  fontSize:     '9px',
                  fontWeight:   700,
                  background:   isCancelado ? '#f1f1f1' : (cores?.bg ?? '#f0f4f7'),
                  color:        isCancelado ? '#bbb' : (cores?.text ?? '#5a84a6'),
                }}>
                  {label}
                </span>
                {titulo.cliente_municipio && (
                  <span style={{ fontSize: '10px', color: '#7a9db8' }}>
                    {titulo.cliente_municipio}{titulo.cliente_uf ? ` / ${titulo.cliente_uf}` : ''}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Bottom-sheet de ações ── */}
      {sheetId && tituloSheet && (
        <>
          {/* Overlay escuro */}
          <div
            onClick={() => { setSheetId(null); setConfirmandoId(null) }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 300 }}
          />

          {/* Painel */}
          <div style={{
            position:     'fixed',
            bottom:       0,
            left:         0,
            right:        0,
            background:   '#ffffff',
            borderRadius: '16px 16px 0 0',
            padding:      '16px',
            zIndex:       301,
            fontFamily:   'Tahoma, Geneva, sans-serif',
          }}>
            {/* Handle visual */}
            <div style={{ width: '36px', height: '4px', background: '#dde8f0', borderRadius: '2px', margin: '0 auto 16px' }} />

            {/* Info do título */}
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#1a6094', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tituloSheet.cliente_nome}
            </div>
            <div style={{ fontSize: '11px', color: '#5a84a6', marginBottom: '16px' }}>
              {tituloSheet.numero_documento} · {formatarDataBR(tituloSheet.data_vencimento)} · {formatarMoeda(tituloSheet.valor)}
            </div>

            {/* Confirmação de cancelamento inline */}
            {confirmandoId === sheetId ? (
              <div style={{ marginBottom: '12px', padding: '10px', background: '#fef2f2', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: '#a32d2d', fontWeight: 700, marginBottom: '8px' }}>
                  Confirmar cancelamento deste título?
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => { onCancelar(tituloSheet); setSheetId(null); setConfirmandoId(null) }}
                    style={{ flex: 1, padding: '8px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Cancelar Título
                  </button>
                  <button
                    onClick={() => setConfirmandoId(null)}
                    style={{ flex: 1, padding: '8px', background: '#f0f4f7', color: '#3a6080', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Voltar
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>

                {/* Visualizar — sempre disponível */}
                <button
                  onClick={() => { onVisualizar(tituloSheet); setSheetId(null) }}
                  style={sheetBtn('#1a6094', '#ffffff')}
                >
                  <i className="ti ti-eye" style={{ fontSize: '16px' }} aria-hidden="true" />
                  Visualizar
                </button>

                {/* Editar — desabilitado para pago e cancelado */}
                {tituloSheet.status !== 'pago' && tituloSheet.status !== 'cancelado' && (
                  <button
                    onClick={() => { onEditar(tituloSheet); setSheetId(null) }}
                    style={sheetBtn('#f0f4f7', '#3a6080')}
                  >
                    <i className="ti ti-pencil" style={{ fontSize: '16px' }} aria-hidden="true" />
                    Editar
                  </button>
                )}

                {/* Cancelar — apenas para não cancelados */}
                {tituloSheet.status !== 'cancelado' && (
                  <button
                    onClick={() => setConfirmandoId(sheetId)}
                    style={sheetBtn('#fef2f2', '#dc2626')}
                  >
                    <i className="ti ti-ban" style={{ fontSize: '16px' }} aria-hidden="true" />
                    Cancelar Título
                  </button>
                )}

              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}

// Estilo dos botões do bottom-sheet
function sheetBtn(bg: string, color: string): React.CSSProperties {
  return {
    display:     'flex',
    alignItems:  'center',
    gap:         '10px',
    width:       '100%',
    padding:     '12px 16px',
    fontSize:    '13px',
    fontWeight:  600,
    fontFamily:  'Tahoma, Geneva, sans-serif',
    background:  bg,
    color,
    border:      'none',
    borderRadius: '8px',
    cursor:      'pointer',
  }
}
