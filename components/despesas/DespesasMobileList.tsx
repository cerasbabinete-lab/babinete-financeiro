// ============================================================
// components/despesas/DespesasMobileList.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Despesas
// Função: Lista mobile de despesas em cards
//         Cada card: Emissão, Favorecido, Valor, Categoria, Origem
//         Toque no card → bottom-sheet com ações (Editar/Cancelar)
// Conecta com: app/despesas/page.tsx
//              lib/despesasService.ts (formatarMoeda, formatarDataBR)
//              types/despesas.ts (Despesa, CATEGORIA_FINANCEIRA_LABELS, ORIGEM_TIPO_LABELS)
// ============================================================

'use client'

import { useState } from 'react'
import type { Despesa } from '@/types/despesas'
import { CATEGORIA_FINANCEIRA_LABELS, ORIGEM_TIPO_LABELS } from '@/types/despesas'
import { formatarMoeda, formatarDataBR } from '@/lib/despesasService'

interface DespesasMobileListProps {
  despesas: Despesa[]
  onEditar: (despesa: Despesa) => void
  onExcluir: (despesa: Despesa) => void
}

export default function DespesasMobileList({
  despesas,
  onEditar,
  onExcluir,
}: DespesasMobileListProps) {

  const [sheetId, setSheetId] = useState<string | null>(null)
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null)

  // Reseta bottom-sheet e confirmação quando a lista muda (ex: após filtro) —
  // ajuste feito DURANTE o render (padrão recomendado pelo React), evitando
  // o erro react-hooks/set-state-in-effect
  const [despesasAnterior, setDespesasAnterior] = useState(despesas)
  if (despesas !== despesasAnterior) {
    setDespesasAnterior(despesas)
    setSheetId(null)
    setConfirmandoId(null)
  }

  if (despesas.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 16px', color: '#5a84a6', fontSize: '12px', fontFamily: 'Tahoma, Geneva, sans-serif' }}>
        Nenhuma despesa encontrada.
      </div>
    )
  }

  const despesaSheet = despesas.find(d => d.id === sheetId) ?? null

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', fontFamily: 'Tahoma, Geneva, sans-serif', paddingBottom: '80px' }}>
        {despesas.map(despesa => {
          const isPessoal = despesa.origem_tipo === 'pessoal_socio'

          return (
            <div
              key={despesa.id}
              onClick={() => { setSheetId(despesa.id); setConfirmandoId(null) }}
              style={{
                background: '#ffffff', borderBottom: '1px solid #e8f0f7',
                padding: '10px 16px', cursor: 'pointer',
              }}
            >
              {/* Linha 1: data + valor */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                <span style={{ fontSize: '10px', color: '#5a84a6' }}>
                  {despesa.documento_data_emissao ? formatarDataBR(despesa.documento_data_emissao) : '—'}
                  {despesa.documento_numero ? ` · Doc ${despesa.documento_numero}` : ''}
                </span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#1a6094' }}>
                  {formatarMoeda(despesa.valor_total)}
                </span>
              </div>

              {/* Linha 2: favorecido */}
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#2c4a60', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {despesa.favorecido_nome}
                {despesa.fornecedor_auto_criado && (
                  <i className="ti ti-alert-triangle" style={{ marginLeft: '5px', color: '#c98a1e', fontSize: '11px' }} aria-hidden="true" />
                )}
              </div>

              {/* Linha 3: categoria + origem */}
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', color: '#5a84a6' }}>{CATEGORIA_FINANCEIRA_LABELS[despesa.categoria_financeira]}</span>
                <span style={{
                  display: 'inline-block', padding: '1px 6px', borderRadius: '8px',
                  fontSize: '9px', fontWeight: 700,
                  background: isPessoal ? '#fce7f3' : '#dbeafe',
                  color: isPessoal ? '#9d174d' : '#1e40af',
                }}>
                  {ORIGEM_TIPO_LABELS[despesa.origem_tipo]}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Bottom-sheet de ações */}
      {sheetId && despesaSheet && (
        <>
          {/* Overlay */}
          <div
            onClick={() => { setSheetId(null); setConfirmandoId(null) }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 300 }}
          />

          {/* Painel */}
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            background: '#ffffff', borderRadius: '16px 16px 0 0',
            padding: '16px', zIndex: 301,
            fontFamily: 'Tahoma, Geneva, sans-serif',
          }}>
            {/* Handle */}
            <div style={{ width: '36px', height: '4px', background: '#dde8f0', borderRadius: '2px', margin: '0 auto 16px' }} />

            {/* Título */}
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#1a6094', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {despesaSheet.favorecido_nome}
            </div>
            <div style={{ fontSize: '11px', color: '#5a84a6', marginBottom: '16px' }}>
              {despesaSheet.documento_numero ? `Doc ${despesaSheet.documento_numero} · ` : ''}
              {formatarMoeda(despesaSheet.valor_total)}
            </div>

            {/* Confirmação de cancelamento inline */}
            {confirmandoId === sheetId ? (
              <div style={{ marginBottom: '12px', padding: '10px', background: '#fef2f2', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: '#a32d2d', fontWeight: 700, marginBottom: '8px' }}>
                  Confirmar cancelamento desta despesa?
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => { onExcluir(despesaSheet); setSheetId(null); setConfirmandoId(null) }}
                    style={{ flex: 1, padding: '8px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                  >Cancelar Despesa</button>
                  <button
                    onClick={() => setConfirmandoId(null)}
                    style={{ flex: 1, padding: '8px', background: '#f0f4f7', color: '#3a6080', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                  >Voltar</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button onClick={() => { onEditar(despesaSheet); setSheetId(null) }} style={sheetBtnStyle('#1a6094', '#ffffff')}>
                  <i className="ti ti-writing" style={{ fontSize: '16px' }} aria-hidden="true" />
                  Editar
                </button>
                <button onClick={() => setConfirmandoId(sheetId)} style={sheetBtnStyle('#fef2f2', '#dc2626')}>
                  <i className="ti ti-trash" style={{ fontSize: '16px' }} aria-hidden="true" />
                  Cancelar Despesa
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}

function sheetBtnStyle(bg: string, color: string): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: '10px',
    width: '100%', padding: '12px 16px', fontSize: '13px', fontWeight: 600,
    fontFamily: 'Tahoma, Geneva, sans-serif',
    background: bg, color, border: 'none', borderRadius: '8px', cursor: 'pointer',
  }
}
