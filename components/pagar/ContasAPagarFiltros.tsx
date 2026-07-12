// ============================================================
// components/pagar/ContasAPagarFiltros.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Pagar
// Função: Barra de filtros — busca textual, período de vencimento,
//         status. Réplica funcional do padrão de ContasReceberFiltros.tsx.
// Conecta com: app/pagar/page.tsx
// ============================================================

'use client'

import type { FiltrosContasAPagar } from '@/types/contasAPagar'
import { STATUS_LABELS_PAGAR } from '@/types/contasAPagar'

interface ContasAPagarFiltrosProps {
  filtros:      FiltrosContasAPagar
  onChange:     (filtros: FiltrosContasAPagar) => void
}

export default function ContasAPagarFiltros({ filtros, onChange }: ContasAPagarFiltrosProps) {
  const inputStyle: React.CSSProperties = {
    border: '1px solid #dde8f0', borderRadius: '6px', padding: '7px 10px', fontSize: '12px',
    fontFamily: 'Tahoma, Geneva, sans-serif', color: '#1a1a1a', background: '#ffffff', outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', padding: '10px 0', fontFamily: 'Tahoma, Geneva, sans-serif' }}>
      <input
        type="text"
        placeholder="Buscar favorecido, CNPJ/CPF, doc. ou nosso número..."
        value={filtros.busca}
        onChange={(e) => onChange({ ...filtros, busca: e.target.value })}
        style={{ ...inputStyle, flex: '1 1 240px', minWidth: '200px' }}
      />
      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#5a6b7a' }}>
        Vencimento de
        <input type="date" value={filtros.vencimentoDe} onChange={(e) => onChange({ ...filtros, vencimentoDe: e.target.value })} style={inputStyle} />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#5a6b7a' }}>
        até
        <input type="date" value={filtros.vencimentoAte} onChange={(e) => onChange({ ...filtros, vencimentoAte: e.target.value })} style={inputStyle} />
      </label>
      <select value={filtros.status} onChange={(e) => onChange({ ...filtros, status: e.target.value })} style={inputStyle}>
        <option value="">Todos os status</option>
        {Object.entries(STATUS_LABELS_PAGAR).map(([valor, label]) => (
          <option key={valor} value={valor}>{label}</option>
        ))}
      </select>
      {(filtros.busca || filtros.vencimentoDe || filtros.vencimentoAte || filtros.status) && (
        <button
          onClick={() => onChange({ busca: '', vencimentoDe: '', vencimentoAte: '', status: '' })}
          style={{ border: 'none', background: 'transparent', color: '#1a6094', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline' }}
        >
          Limpar filtros
        </button>
      )}
    </div>
  )
}
