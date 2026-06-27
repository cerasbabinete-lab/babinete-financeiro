// ============================================================
// components/clientes/BasebarClientes.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Clientes
// Função: Basebar mobile fixa no rodapé — específica do módulo
//         Clientes, com suporte a "usuario" no nome do arquivo
//         de backup. Criada como componente separado porque o
//         Basebar.tsx global está congelado ("não alterar") por
//         decisão do usuário — qualquer ajuste no comportamento
//         de Clientes passa a viver aqui, não no componente global.
//         Mesmo visual e comportamento do Basebar.tsx original —
//         4 botões: Backup, Restaurar, Exportar, Novo Cliente
// Conecta com: app/clientes/page.tsx
//              clientesService.ts (fazerBackup, lerArquivoBackup, restaurarBackup)
//              ExportDropdown.tsx (versão de clientes)
// ============================================================

'use client'

import { useRef, useState } from 'react'
import { fazerBackup, lerArquivoBackup, restaurarBackup } from '@/lib/clientesService'
import type { Cliente } from '@/types/clientes'
import ExportDropdown from './ExportDropdown'

// ============================================================
// Props
// ============================================================
interface BasebarClientesProps {
  clientes: Cliente[]
  usuario?: string                 // Usado no nome do arquivo de backup
  onNovoCliente: () => void
  onRestaurado: () => void
}

// ============================================================
// BasebarClientes
// ============================================================
export default function BasebarClientes({
  clientes,
  usuario,
  onNovoCliente,
  onRestaurado,
}: BasebarClientesProps) {

  const inputRestaurarRef = useRef<HTMLInputElement>(null)
  const [loadingBackup, setLoadingBackup] = useState(false)
  const [loadingRestore, setLoadingRestore] = useState(false)

  // ============================================================
  // handleBackup
  // ============================================================
  async function handleBackup() {
    setLoadingBackup(true)
    try {
      await fazerBackup(usuario)
    } catch {
      alert('Erro ao gerar backup.')
    } finally {
      setLoadingBackup(false)
    }
  }

  // ============================================================
  // handleRestaurarClick
  // ============================================================
  function handleRestaurarClick() {
    inputRestaurarRef.current?.click()
  }

  // ============================================================
  // handleArquivoSelecionado
  // ============================================================
  async function handleArquivoSelecionado(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const confirmar = confirm(
      `Restaurar backup "${file.name}"?\n\nOs registros existentes serão atualizados ou criados. Esta ação não pode ser desfeita.`
    )
    if (!confirmar) {
      e.target.value = ''
      return
    }

    setLoadingRestore(true)
    try {
      const dados = await lerArquivoBackup(file)
      await restaurarBackup(dados)
      alert(`Backup restaurado! ${dados.length} registros processados.`)
      onRestaurado()
    } catch (err: unknown) {
      alert(`Erro ao restaurar: ${err instanceof Error ? err.message : 'Erro desconhecido'}`)
    } finally {
      setLoadingRestore(false)
      e.target.value = ''
    }
  }

  // ============================================================
  // Render — mesmo layout visual do Basebar.tsx original
  // ============================================================
  return (
    <footer
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: '#ffffff',
        borderTop: '1px solid #c4d8eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        padding: '6px 0 10px',
        zIndex: 100,
        fontFamily: 'Tahoma, Geneva, sans-serif',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* Backup — ti-database */}
      <button onClick={handleBackup} disabled={loadingBackup} style={btnStyle}>
        <i className="ti ti-database" style={{ fontSize: '20px', color: '#1a6094' }} aria-hidden="true" />
        <span style={labelStyle}>{loadingBackup ? '...' : 'Backup'}</span>
      </button>

      {/* Restaurar — ti-restore */}
      <button onClick={handleRestaurarClick} disabled={loadingRestore} style={btnStyle}>
        <i className="ti ti-restore" style={{ fontSize: '20px', color: '#1a6094' }} aria-hidden="true" />
        <span style={labelStyle}>{loadingRestore ? '...' : 'Restaurar'}</span>
      </button>

      {/* Input file oculto */}
      <input
        ref={inputRestaurarRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleArquivoSelecionado}
      />

      {/* Exportar — ti-database-import via ExportDropdown mobile */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <ExportDropdown clientes={clientes} usuario={usuario ?? ''} mobile />
      </div>

      {/* Novo Cliente — ti-user-plus */}
      <button onClick={onNovoCliente} style={{ ...btnStyle, color: '#1a6094' }}>
        <i className="ti ti-user-plus" style={{ fontSize: '20px', color: '#1a6094' }} aria-hidden="true" />
        <span style={{ ...labelStyle, color: '#1a6094', fontWeight: 700 }}>Novo</span>
      </button>
    </footer>
  )
}

// ============================================================
// Estilos auxiliares — idênticos ao Basebar.tsx original
// ============================================================
const btnStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '3px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: '4px 8px',
  borderRadius: '8px',
  minWidth: '56px',
}

const labelStyle: React.CSSProperties = {
  fontSize: '8px',
  fontWeight: 600,
  textTransform: 'uppercase',
  color: '#3a6080',
  fontFamily: 'Tahoma, Geneva, sans-serif',
  letterSpacing: '0.03em',
  whiteSpace: 'nowrap',
}
