// ============================================================
// components/contas-receber/ContasReceberFiltros.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Receber
// Função: Barra de filtros colapsável — busca textual,
//         período de vencimento e status
// Conecta com: app/receber/page.tsx (onFiltrosChange, filtros)
//              types/contasReceber.ts (FiltrosContasReceber, STATUS_LABELS)
// ============================================================

'use client'

import { useEffect, useRef, useState } from 'react'
import type { FiltrosContasReceber } from '@/types/contasReceber'
import { STATUS_LABELS } from '@/types/contasReceber'

interface ContasReceberFiltrosProps {
  filtros:          FiltrosContasReceber            // Estado atual dos filtros
  onFiltrosChange:  (f: FiltrosContasReceber) => void // Callback ao mudar qualquer filtro
  onLimpar:         () => void                       // Reseta todos os filtros
}

// ── Opções de status para o dropdown ──
const OPCOES_STATUS = [
  { value: '',                label: 'Todos os status' },
  { value: 'em_aberto',       label: STATUS_LABELS.em_aberto },
  { value: 'pago',            label: STATUS_LABELS.pago },
  { value: 'recebido_pix_ted', label: STATUS_LABELS.recebido_pix_ted },
  { value: 'protestado',      label: STATUS_LABELS.protestado },
  { value: 'enviado_cartorio', label: STATUS_LABELS.enviado_cartorio },
  { value: 'cancelado',       label: STATUS_LABELS.cancelado },
]

export default function ContasReceberFiltros({
  filtros,
  onFiltrosChange,
  onLimpar,
}: ContasReceberFiltrosProps) {

  // Estado do painel expandido/colapsado
  const [aberto, setAberto] = useState(false)

  // Estado local do input de busca (debounce para não disparar a cada tecla)
  const [inputBusca, setInputBusca] = useState(filtros.busca)

  // Ref para o timeout de debounce
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sincroniza inputBusca quando filtros.busca muda externamente (ex: limpar)
  // L-2 FIX: cancela debounce pendente ANTES de setar o novo valor
  // Sem isso, um timeout agendado poderia restaurar o texto após o limpar
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current) // Cancela timeout pendente
    setInputBusca(filtros.busca)                               // Sincroniza com valor externo
  }, [filtros.busca])

  // Limpa o debounce ao desmontar para evitar setState em componente desmontado
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  // Atualiza busca com debounce de 300ms
  function handleBusca(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setInputBusca(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onFiltrosChange({ ...filtros, busca: val })
    }, 300)
  }

  // ── Estilos reutilizáveis ─────────────────────────────────
  const inputStyle: React.CSSProperties = {
    height:     '28px',
    padding:    '0 8px',
    fontSize:   '12px',
    fontFamily: 'Tahoma, Geneva, sans-serif',
    color:      '#3a6080',
    background: '#ffffff',
    border:     '1px solid #dde8f0',
    borderRadius: '4px',
    outline:    'none',
  }

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
  }

  const btnToggleStyle: React.CSSProperties = {
    display:      'flex',
    alignItems:   'center',
    gap:          '4px',
    padding:      '0 10px',
    height:       '28px',
    fontSize:     '12px',
    fontWeight:   600,
    fontFamily:   'Tahoma, Geneva, sans-serif',
    background:   aberto ? '#e8f3fc' : '#f0f4f7',
    color:        '#3a6080',
    border:       '1px solid #c4d8eb',
    borderRadius: '4px',
    cursor:       'pointer',
  }

  const btnLimparStyle: React.CSSProperties = {
    ...btnToggleStyle,
    background: 'transparent',
    border:     '1px solid #dde8f0',
    color:      '#7a9db8',
  }

  return (
    <div style={{ marginBottom: '10px', fontFamily: 'Tahoma, Geneva, sans-serif' }}>

      {/* ── Linha principal: busca + toggle ── */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: aberto ? '8px' : 0 }}>

        {/* Campo de busca textual */}
        <input
          type="text"
          value={inputBusca}
          onChange={handleBusca}
          placeholder="Buscar por nome, CNPJ/CPF, Nº doc ou Nosso Número..."
          style={{ ...inputStyle, flex: 1, minWidth: '220px' }}
        />

        {/* Botão toggle do painel de filtros */}
        <button onClick={() => setAberto((v: boolean) => !v)} style={btnToggleStyle}>
          <i className={`ti ${aberto ? 'ti-filter-off' : 'ti-filter'}`} style={{ fontSize: '13px' }} aria-hidden="true" />
          Filtros
          <i className={`ti ${aberto ? 'ti-chevron-up' : 'ti-chevron-down'}`} style={{ fontSize: '11px' }} aria-hidden="true" />
        </button>

        {/* Botão Limpar — visível sempre */}
        <button onClick={onLimpar} title="Limpar todos os filtros" style={btnLimparStyle}>
          <i className="ti ti-x" style={{ fontSize: '12px' }} aria-hidden="true" />
          Limpar
        </button>

      </div>

      {/* ── Painel expandido: filtros adicionais ── */}
      {aberto && (
        <div style={{
          display:     'flex',
          gap:         '10px',
          flexWrap:    'wrap',
          alignItems:  'center',
          padding:     '10px 12px',
          background:  '#f7fafc',
          border:      '1px solid #dde8f0',
          borderRadius: '6px',
        }}>

          {/* Vencimento De */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <label style={{ fontSize: '11px', color: '#5a84a6', whiteSpace: 'nowrap' }}>
              Vencimento de
            </label>
            <input
              type="date"
              value={filtros.vencimentoDe}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onFiltrosChange({ ...filtros, vencimentoDe: e.target.value })}
              style={{ ...inputStyle, width: '130px' }}
            />
          </div>

          {/* Vencimento Até */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <label style={{ fontSize: '11px', color: '#5a84a6', whiteSpace: 'nowrap' }}>
              até
            </label>
            <input
              type="date"
              value={filtros.vencimentoAte}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onFiltrosChange({ ...filtros, vencimentoAte: e.target.value })}
              style={{ ...inputStyle, width: '130px' }}
            />
          </div>

          {/* Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <label style={{ fontSize: '11px', color: '#5a84a6', whiteSpace: 'nowrap' }}>
              Status
            </label>
            <select
              value={filtros.status}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onFiltrosChange({ ...filtros, status: e.target.value })}
              style={{ ...selectStyle, width: '160px' }}
            >
              {OPCOES_STATUS.map(op => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
          </div>

        </div>
      )}
    </div>
  )
}
