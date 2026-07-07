// ============================================================
// components/despesas/DespesasFiltros.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Despesas
// Função: Barra de filtros colapsável — busca textual, categoria
//         financeira, origem (empresarial/pessoal_socio), vencimento
//         de/até e status. Réplica visual de ReceitasFiltros.tsx.
// Conecta com: app/despesas/page.tsx (onFiltrosChange, filtros)
//              types/despesas.ts (FiltrosDespesas, CATEGORIA_FINANCEIRA_LABELS,
//              ORIGEM_TIPO_LABELS, STATUS_PAGAMENTO_LABELS)
// ============================================================

'use client'

import { useEffect, useRef, useState } from 'react'
import type { FiltrosDespesas } from '@/types/despesas'
import { CATEGORIA_FINANCEIRA_LABELS, ORIGEM_TIPO_LABELS, STATUS_PAGAMENTO_LABELS } from '@/types/despesas'

interface DespesasFiltrosProps {
  filtros: FiltrosDespesas
  onFiltrosChange: (filtros: FiltrosDespesas) => void
  onLimpar: () => void
}

export default function DespesasFiltros({
  filtros,
  onFiltrosChange,
  onLimpar,
}: DespesasFiltrosProps) {

  const [aberto, setAberto] = useState(false)
  const [inputBusca, setInputBusca] = useState(filtros.busca)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Mantém o input local sincronizado se o filtro for limpo externamente —
  // ajuste feito DURANTE o render (padrão recomendado pelo React), evitando
  // o erro react-hooks/set-state-in-effect
  const [buscaAnterior, setBuscaAnterior] = useState(filtros.busca)
  if (filtros.busca !== buscaAnterior) {
    setBuscaAnterior(filtros.busca)
    setInputBusca(filtros.busca)
  }

  // Limpa o debounce pendente ao desmontar, evitando setState após unmount
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  // Debounce de 300ms na busca textual, mesmo padrão de ReceitasFiltros
  function handleBusca(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setInputBusca(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onFiltrosChange({ ...filtros, busca: val })
    }, 300)
  }

  const selectStyle: React.CSSProperties = {
    height: '30px', padding: '0 8px', fontSize: '12px',
    fontFamily: 'Tahoma, Geneva, sans-serif', color: '#3a6080',
    background: '#ffffff', border: '1px solid #dde8f0',
    borderRadius: '4px', cursor: 'pointer', outline: 'none',
  }

  const inputStyle: React.CSSProperties = {
    height: '30px', padding: '0 8px', fontSize: '12px',
    fontFamily: 'Tahoma, Geneva, sans-serif', color: '#3a6080',
    background: '#ffffff', border: '1px solid #dde8f0',
    borderRadius: '4px', outline: 'none',
  }

  return (
    <div style={{ marginBottom: '10px', fontFamily: 'Tahoma, Geneva, sans-serif' }}>
      {/* Linha principal: busca + toggle filtros */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          type="text"
          value={inputBusca}
          onChange={handleBusca}
          placeholder="Buscar por favorecido, CNPJ/CPF ou Nº documento..."
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          onClick={() => setAberto((v: boolean) => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            height: '30px', padding: '0 10px', fontSize: '12px',
            fontFamily: 'Tahoma, Geneva, sans-serif', fontWeight: 600,
            background: aberto ? '#e0ecf7' : '#ffffff',
            color: '#3a6080', border: '1px solid #dde8f0',
            borderRadius: '4px', cursor: 'pointer',
          }}
        >
          <i className={`ti ${aberto ? 'ti-filter-off' : 'ti-filter'}`} style={{ fontSize: '13px' }} />
          Filtros
          <i className={`ti ${aberto ? 'ti-chevron-up' : 'ti-chevron-down'}`} style={{ fontSize: '11px' }} />
        </button>
        <button
          onClick={onLimpar}
          title="Limpar todos os filtros"
          style={{
            height: '30px', padding: '0 10px', fontSize: '12px',
            fontFamily: 'Tahoma, Geneva, sans-serif', fontWeight: 600,
            background: '#ffffff', color: '#3a6080',
            border: '1px solid #dde8f0', borderRadius: '4px', cursor: 'pointer',
          }}
        >
          Limpar
        </button>
      </div>

      {/* Painel colapsável */}
      {aberto && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center',
          marginTop: '8px', padding: '10px 12px',
          background: '#f7fafc', border: '1px solid #dde8f0', borderRadius: '6px',
        }}>

          {/* Categoria financeira — 8 fixas */}
          <select
            value={filtros.categoriaFinanceira}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onFiltrosChange({ ...filtros, categoriaFinanceira: e.target.value })}
            style={{ ...selectStyle, maxWidth: '220px' }}
          >
            <option value="">Todas as categorias</option>
            {Object.entries(CATEGORIA_FINANCEIRA_LABELS).map(([valor, label]) => (
              <option key={valor} value={valor}>{label}</option>
            ))}
          </select>

          {/* Origem — empresarial x pessoal_socio */}
          <select
            value={filtros.origemTipo}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onFiltrosChange({ ...filtros, origemTipo: e.target.value })}
            style={selectStyle}
          >
            <option value="">Empresarial + Pessoal</option>
            {Object.entries(ORIGEM_TIPO_LABELS).map(([valor, label]) => (
              <option key={valor} value={valor}>{label}</option>
            ))}
          </select>

          {/* Vencimento de */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '11px', color: '#5a84a6' }}>Vencimento de</span>
            <input
              type="date"
              value={filtros.vencimentoDe}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onFiltrosChange({ ...filtros, vencimentoDe: e.target.value })}
              style={inputStyle}
            />
          </div>

          {/* Vencimento até */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '11px', color: '#5a84a6' }}>até</span>
            <input
              type="date"
              value={filtros.vencimentoAte}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onFiltrosChange({ ...filtros, vencimentoAte: e.target.value })}
              style={inputStyle}
            />
          </div>

          {/* Status de pagamento */}
          <select
            value={filtros.status}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onFiltrosChange({ ...filtros, status: e.target.value })}
            style={selectStyle}
          >
            <option value="">Todos os status</option>
            {Object.entries(STATUS_PAGAMENTO_LABELS).map(([valor, label]) => (
              <option key={valor} value={valor}>{label}</option>
            ))}
          </select>

        </div>
      )}
    </div>
  )
}
