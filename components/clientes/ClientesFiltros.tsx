// ============================================================
// components/clientes/ClientesFiltros.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Clientes
// Função: Barra de busca + dropdowns de Lista e Status
//         Filtros em tempo real com debounce de 300ms na busca
// Conecta com: app/clientes/page.tsx (onFiltrosChange, filtros)
//              types/clientes.ts (FiltrosClientes)
// ============================================================

'use client'

import { useEffect, useRef, useState } from 'react' // useCallback removido — não usado neste componente
import type { FiltrosClientes } from '@/types/clientes'

// ============================================================
// Props
// ============================================================
interface ClientesFiltrosProps {
  filtros: FiltrosClientes                          // Estado atual dos filtros
  onFiltrosChange: (filtros: FiltrosClientes) => void // Callback ao alterar qualquer filtro
}

// ============================================================
// ClientesFiltros
// ============================================================
export default function ClientesFiltros({ filtros, onFiltrosChange }: ClientesFiltrosProps) {

  // Ref para o timer do debounce da busca textual
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Estado local do input de busca — necessário para input controlado
  // defaultValue causaria desync se filtros.busca for resetado externamente
  // (ex: futuro botão "Limpar filtros" não refletiria no campo visual)
  const [inputValue, setInputValue] = useState(filtros.busca)

  // Sincroniza inputValue com filtros.busca quando resetado externamente
  // (ex: botão "Limpar filtros" no pai zera filtros.busca para '')
  useEffect(() => {
    // setState síncrono aqui é o padrão correto para sincronizar estado
    // derivado de props — sem este efeito o campo visual fica desincronizado
    setInputValue(filtros.busca) // eslint-disable-line react-hooks/set-state-in-effect
  }, [filtros.busca])

  // ============================================================
  // handleBusca
  // Aplica debounce de 300ms antes de disparar o filtro
  // Evita query a cada tecla digitada
  // ============================================================
  function handleBusca(e: React.ChangeEvent<HTMLInputElement>) {
    const valor = e.target.value
    // Atualiza o estado local imediatamente (input controlado — sem lag visual)
    setInputValue(valor)
    // Dispara o filtro com debounce de 300ms para evitar query a cada tecla
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onFiltrosChange({ ...filtros, busca: valor })
    }, 300)
  }

  // ============================================================
  // handleLista
  // Atualiza filtro de lista imediatamente (sem debounce)
  // ============================================================
  function handleLista(e: React.ChangeEvent<HTMLSelectElement>) {
    onFiltrosChange({ ...filtros, lista: e.target.value })
  }

  // ============================================================
  // handleStatus
  // Atualiza filtro de status imediatamente (sem debounce)
  // ============================================================
  function handleStatus(e: React.ChangeEvent<HTMLSelectElement>) {
    const novoStatus = e.target.value
    // Quando muda para inativos, reseta lista para 'todas'
    // Inativos sempre têm nomelista='0' — nunca pertencem às listas 1-4/VAREJO
    const novaLista = novoStatus === 'inativos' ? 'todas' : filtros.lista
    onFiltrosChange({ ...filtros, status: novoStatus, lista: novaLista })
  }

  // Limpa o debounce ao desmontar o componente
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // ============================================================
  // Estilos reutilizáveis
  // ============================================================
  const selectStyle: React.CSSProperties = {
    height: '30px',
    padding: '0 8px',
    fontSize: '12px',
    fontFamily: 'Tahoma, Geneva, sans-serif',
    color: '#3a6080',
    background: '#ffffff',
    border: '1px solid #dde8f0',
    borderRadius: '4px',
    cursor: 'pointer',
    outline: 'none',
  }

  // ============================================================
  // Render
  // ============================================================
  return (
    <div
      style={{
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
        marginBottom: '10px',
        fontFamily: 'Tahoma, Geneva, sans-serif',
      }}
    >
      {/* Search bar — ocupa o espaço restante */}
      <input
        type="text"
        value={inputValue}
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

      {/* Dropdown — Lista */}
      <select
        value={filtros.lista}
        onChange={handleLista}
        style={selectStyle}
        aria-label="Filtrar por lista"
      >
        <option value="todas">Todas as listas</option>
        {/* Desabilitados quando inativos: inativos têm nomelista='0', nunca nas listas 1-4/VAREJO */}
        <option value="1"     disabled={filtros.status === 'inativos'}>Lista 1</option>
        <option value="2"     disabled={filtros.status === 'inativos'}>Lista 2</option>
        <option value="3"     disabled={filtros.status === 'inativos'}>Lista 3</option>
        <option value="4"     disabled={filtros.status === 'inativos'}>Lista 4</option>
        <option value="VAREJO" disabled={filtros.status === 'inativos'}>Varejo</option>
      </select>

      {/* Dropdown — Status */}
      <select
        value={filtros.status}
        onChange={handleStatus}
        style={selectStyle}
        aria-label="Filtrar por status"
      >
        <option value="ativos">Ativos</option>
        <option value="inativos">Inativos</option>
        <option value="todos">Todos</option>
      </select>
    </div>
  )
}
