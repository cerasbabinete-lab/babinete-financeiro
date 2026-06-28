// ============================================================
// components/receitas/ReceitasFiltros.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Receitas
// Função: Barra de filtros colapsável — busca textual, datas,
//         prazo, forma de pagamento e transportadora
// Conecta com: app/receitas/page.tsx (onFiltrosChange, filtros)
//              types/receitas.ts (FiltrosReceitas)
//              receitasService.ts (buscarTransportadoras)
// ============================================================

'use client'

import { useEffect, useRef, useState } from 'react'
import type { FiltrosReceitas, Transportadora } from '@/types/receitas'

interface ReceitasFiltrosProps {
  filtros: FiltrosReceitas
  transportadoras: Transportadora[]
  onFiltrosChange: (filtros: FiltrosReceitas) => void
  onLimpar: () => void
}

const PRAZOS = [
  { value: '',        label: 'Todos os prazos' },
  { value: '0',       label: 'À vista (0)' },
  { value: '15DD',    label: '15DD' },
  { value: '30DD',    label: '30DD' },
  { value: '30/60DD', label: '30/60DD' },
  { value: '25/50/75DD', label: '25/50/75DD' },
  { value: '30/60/90DD', label: '30/60/90DD' },
]

export default function ReceitasFiltros({
  filtros,
  transportadoras,
  onFiltrosChange,
  onLimpar,
}: ReceitasFiltrosProps) {

  const [aberto, setAberto] = useState(false)
  const [inputBusca, setInputBusca] = useState(filtros.busca)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setInputBusca(filtros.busca) }, [filtros.busca])

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

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
          placeholder="Buscar por nome, CNPJ/CPF ou Nº NF..."
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

          {/* Data emissão de */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '11px', color: '#5a84a6' }}>Emissão de</span>
            <input
              type="date"
              value={filtros.dataEmissaoDe}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onFiltrosChange({ ...filtros, dataEmissaoDe: e.target.value })}
              style={inputStyle}
            />
          </div>

          {/* Data emissão até */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '11px', color: '#5a84a6' }}>até</span>
            <input
              type="date"
              value={filtros.dataEmissaoAte}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onFiltrosChange({ ...filtros, dataEmissaoAte: e.target.value })}
              style={inputStyle}
            />
          </div>

          {/* Prazo */}
          <select
            value={filtros.prazo}
            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onFiltrosChange({ ...filtros, prazo: e.target.value })}
            style={selectStyle}
          >
            {PRAZOS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>

          {/* Forma de pagamento */}
          <select
            value={filtros.formaPagamento}
            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onFiltrosChange({ ...filtros, formaPagamento: e.target.value })}
            style={selectStyle}
          >
            <option value="">Todas as formas</option>
            <option value="Boleto">Boleto</option>
            <option value="À vista">À vista</option>
          </select>

          {/* Transportadora */}
          <select
            value={filtros.transportadoraId}
            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onFiltrosChange({ ...filtros, transportadoraId: e.target.value })}
            style={{ ...selectStyle, maxWidth: '200px' }}
          >
            <option value="">Todas as transportadoras</option>
            {transportadoras.map(t => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>

        </div>
      )}
    </div>
  )
}
