// ============================================================
// components/fornecedores/FornecedoresFiltros.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Fornecedores
// Função: Barra de busca — SEM dropdowns de filtro
//         (não existe Lista nem Status neste módulo)
// Conecta com: app/fornecedores/page.tsx (onFiltrosChange, filtros)
//              types/fornecedores.ts (FiltrosFornecedores)
// ============================================================

'use client'

import { useEffect, useRef } from 'react'
import type { FiltrosFornecedores } from '@/types/fornecedores'

// ============================================================
// Props
// ============================================================
interface FornecedoresFiltrosProps {
  filtros: FiltrosFornecedores
  onFiltrosChange: (filtros: FiltrosFornecedores) => void
}

// ============================================================
// FornecedoresFiltros
// ============================================================
export default function FornecedoresFiltros({ filtros, onFiltrosChange }: FornecedoresFiltrosProps) {

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ============================================================
  // handleBusca
  // Debounce de 300ms — mesmo padrão do módulo Clientes
  // ============================================================
  function handleBusca(e: React.ChangeEvent<HTMLInputElement>) {
    const valor = e.target.value
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onFiltrosChange({ busca: valor })
    }, 300)
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // ============================================================
  // Render — apenas o input de busca, sem dropdowns
  // ============================================================
  return (
    <div
      style={{
        display: 'flex',
        marginBottom: '10px',
        fontFamily: 'Tahoma, Geneva, sans-serif',
      }}
    >
      <input
        type="text"
        defaultValue={filtros.busca}
        onChange={handleBusca}
        placeholder="Buscar por nome, CNPJ ou cidade..."
        style={{
          flex: 1,
          height: '30px',
          padding: '0 10px',
          fontSize: '12px',
          fontFamily: 'Tahoma, Geneva, sans-serif',
          color: '#3a6080',
          background: '#ffffff',
          border: '1px solid #dde8f0',
          borderRadius: '4px',
          outline: 'none',
        }}
      />
    </div>
  )
}
