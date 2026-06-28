// ============================================================
// components/receitas/ReceitasMobileList.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Receitas
// Função: Lista mobile de receitas em cards
//         Cada card: Emissão, Nome, Valor, Prazos, Forma Pgto
//         Toque no card → bottom-sheet com ações
// Conecta com: app/receitas/page.tsx
//              receitasService.ts (calcularPrazos, calcularFormaPagamento,
//                                  formatarMoeda, formatarDataBR)
//              types/receitas.ts (Receita)
// ============================================================

'use client'

import { useState, useEffect } from 'react'
import type { Receita } from '@/types/receitas'
import {
  calcularPrazos,
  calcularFormaPagamento,
  formatarMoeda,
  formatarDataBR,
} from '@/lib/receitasService'

interface ReceitasMobileListProps {
  receitas: Receita[]
  onEditar: (receita: Receita) => void
  onVisualizar: (receita: Receita) => void
  onExcluir: (receita: Receita) => void
}

export default function ReceitasMobileList({
  receitas,
  onEditar,
  onVisualizar,
  onExcluir,
}: ReceitasMobileListProps) {

  const [sheetId, setSheetId] = useState<string | null>(null)
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null)

  // Reseta bottom-sheet e confirmação quando a lista muda (ex: após filtro ou exclusão)
  // Evita estados obsoletos aparecendo ao limpar filtros
  useEffect(() => { setSheetId(null); setConfirmandoId(null) }, [receitas])

  if (receitas.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 16px', color: '#5a84a6', fontSize: '12px', fontFamily: 'Tahoma, Geneva, sans-serif' }}>
        Nenhuma receita encontrada.
      </div>
    )
  }

  const receitaSheet = receitas.find(r => r.id === sheetId) ?? null

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', fontFamily: 'Tahoma, Geneva, sans-serif', paddingBottom: '80px' }}>
        {receitas.map(receita => {
          const duplicatas = receita.duplicatas ?? []
          const prazos     = calcularPrazos(receita.data_emissao, duplicatas)
          const formaPgto  = calcularFormaPagamento(duplicatas)
          const isBoleto   = formaPgto === 'Boleto'

          return (
            <div
              key={receita.id}
              onClick={() => { setSheetId(receita.id); setConfirmandoId(null) }}
              style={{
                background: '#ffffff', borderBottom: '1px solid #e8f0f7',
                padding: '10px 16px', cursor: 'pointer',
              }}
            >
              {/* Linha 1: data + valor */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                <span style={{ fontSize: '10px', color: '#5a84a6' }}>
                  {formatarDataBR(receita.data_emissao)} · NF {receita.numero_nf}
                </span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#1a6094' }}>
                  {formatarMoeda(receita.valor_nf)}
                </span>
              </div>

              {/* Linha 2: nome */}
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#2c4a60', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {receita.cliente_nome ?? '—'}
              </div>

              {/* Linha 3: prazos + forma pgto */}
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', color: '#5a84a6' }}>{prazos}</span>
                <span style={{
                  display: 'inline-block', padding: '1px 6px', borderRadius: '8px',
                  fontSize: '9px', fontWeight: 700,
                  background: isBoleto ? '#dbeafe' : '#eaf3de',
                  color: isBoleto ? '#1e40af' : '#3b6d11',
                }}>
                  {formaPgto}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Bottom-sheet de ações */}
      {sheetId && receitaSheet && (
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
              {receitaSheet.cliente_nome ?? '—'}
            </div>
            <div style={{ fontSize: '11px', color: '#5a84a6', marginBottom: '16px' }}>
              NF {receitaSheet.numero_nf} · {formatarDataBR(receitaSheet.data_emissao)} · {formatarMoeda(receitaSheet.valor_nf)}
            </div>

            {/* Confirmação de exclusão inline */}
            {confirmandoId === sheetId ? (
              <div style={{ marginBottom: '12px', padding: '10px', background: '#fef2f2', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: '#a32d2d', fontWeight: 700, marginBottom: '8px' }}>
                  Confirmar exclusão desta receita?
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => { onExcluir(receitaSheet); setSheetId(null); setConfirmandoId(null) }}
                    style={{ flex: 1, padding: '8px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                  >Excluir</button>
                  <button
                    onClick={() => setConfirmandoId(null)}
                    style={{ flex: 1, padding: '8px', background: '#f0f4f7', color: '#3a6080', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                  >Cancelar</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button onClick={() => { onVisualizar(receitaSheet); setSheetId(null) }} style={sheetBtnStyle('#1a6094', '#ffffff')}>
                  <i className="ti ti-eye" style={{ fontSize: '16px' }} aria-hidden="true" />
                  Visualizar
                </button>
                <button onClick={() => { onEditar(receitaSheet); setSheetId(null) }} style={sheetBtnStyle('#f0f4f7', '#3a6080')}>
                  <i className="ti ti-writing" style={{ fontSize: '16px' }} aria-hidden="true" />
                  Editar
                </button>
                <button onClick={() => setConfirmandoId(sheetId)} style={sheetBtnStyle('#fef2f2', '#dc2626')}>
                  <i className="ti ti-trash" style={{ fontSize: '16px' }} aria-hidden="true" />
                  Excluir
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
