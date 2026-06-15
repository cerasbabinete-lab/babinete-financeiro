// ============================================================
// components/layout/Basebar.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Global
// Função: Basebar mobile fixa no rodapé — 4 botões:
//         Backup (ti-database), Restaurar (ti-restore),
//         Exportar (ti-database-import), Novo Cliente (ti-user-plus)
// Conecta com: app/clientes/page.tsx
//              clientesService.ts (fazerBackup, lerArquivoBackup, restaurarBackup)
//              ExportDropdown.tsx (exportar CSV/Excel)
// ============================================================

'use client'

import { useRef, useState } from 'react'
import { fazerBackup, lerArquivoBackup, restaurarBackup } from '@/lib/clientesService'
import type { Cliente } from '@/types/clientes'
import ExportDropdown from '@/components/clientes/ExportDropdown'

// ============================================================
// Props
// ============================================================
interface BasebarProps {
  clientes: Cliente[]
  usuario: string        // 1º nome do usuário logado — usado no nome do backup
  onNovoCliente: () => void
  onRestaurado: () => void
}

// ============================================================
// Basebar
// ============================================================
export default function Basebar({ clientes, usuario, onNovoCliente, onRestaurado }: BasebarProps) {

  const inputRestaurarRef = useRef<HTMLInputElement>(null)
  const [loadingBackup, setLoadingBackup] = useState(false)
  const [loadingRestore, setLoadingRestore] = useState(false)

  // ============================================================
  // handleBackup
  // ============================================================
  async function handleBackup() {
    setLoadingBackup(true)
    try {
      // Passa o 1º nome do usuário logado para incluir no nome do arquivo de backup
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
      // Narrows err para acessar .message com segurança — evita any implícito
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      alert(`Erro ao restaurar: ${msg}`)
    } finally {
      setLoadingRestore(false)
      e.target.value = ''
    }
  }

  // ============================================================
  // Render
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
        // padding shorthand define 10px bottom; paddingBottom usa calc() para
        // somar o safe-area-inset (iPhones com home bar) ao padding base
        // Em Android e desktop, env() resolve para 0px → resultado = 10px
        padding: '6px 0 0',
        paddingBottom: 'calc(10px + env(safe-area-inset-bottom))',
        zIndex: 100,
        fontFamily: 'Tahoma, Geneva, sans-serif',
      }}
    >
      {/* Backup — ti-database */}
      <button
        onClick={handleBackup}
        disabled={loadingBackup}
        style={btnStyle}
      >
        <i className="ti ti-database" style={{ fontSize: '20px', color: '#1a6094' }} aria-hidden="true" />
        <span style={labelStyle}>{loadingBackup ? '...' : 'Backup'}</span>
      </button>

      {/* Restaurar — ti-restore */}
      <button
        onClick={handleRestaurarClick}
        disabled={loadingRestore}
        style={btnStyle}
      >
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

      {/* Exportar — ti-table-export via ExportDropdown mobile */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <ExportDropdown clientes={clientes} mobile />
      </div>

      {/* Novo Cliente — ti-user-plus */}
      <button
        onClick={onNovoCliente}
        style={{ ...btnStyle, color: '#1a6094' }}
      >
        <i className="ti ti-user-plus" style={{ fontSize: '20px', color: '#1a6094' }} aria-hidden="true" />
        <span style={{ ...labelStyle, color: '#1a6094', fontWeight: 700 }}>Novo</span>
      </button>
    </footer>
  )
}

// ============================================================
// Estilos auxiliares
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
