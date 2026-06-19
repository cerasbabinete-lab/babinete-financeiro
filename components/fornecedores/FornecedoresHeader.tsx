// ============================================================
// components/fornecedores/FornecedoresHeader.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Fornecedores
// Função: Header desktop — título, contador (sem "ativos") e
//         botões Backup, Restaurar, Exportar, Novo Fornecedor
//         Clone de ClientesHeader.tsx sem qualificador de status
// Conecta com: app/fornecedores/page.tsx
//              fornecedoresService.ts (fazerBackup, lerArquivoBackup, restaurarBackup)
//              ExportDropdown.tsx (reutilizado do módulo Clientes)
// ============================================================

'use client'

import { useRef, useState } from 'react'
import { fazerBackup, lerArquivoBackup, restaurarBackup } from '@/lib/fornecedoresService'
import type { Fornecedor } from '@/types/fornecedores'
import ExportDropdown from './ExportDropdown'

// ============================================================
// Props
// ============================================================
interface FornecedoresHeaderProps {
  total: number                       // Contador exibido ao lado do título — sem "ativos"
  fornecedores: Fornecedor[]          // Lista atual filtrada (para exportar)
  usuario?: string                    // Usuário logado — usado no nome do arquivo de backup
  onNovoFornecedor: () => void        // Abre modal no modo 'novo'
  onRestaurado: () => void            // Callback após restore — recarrega lista
}

// ============================================================
// FornecedoresHeader
// ============================================================
export default function FornecedoresHeader({
  total,
  fornecedores,
  usuario,
  onNovoFornecedor,
  onRestaurado,
}: FornecedoresHeaderProps) {

  const inputRestaurarRef = useRef<HTMLInputElement>(null)
  const [loadingBackup, setLoadingBackup] = useState(false)
  const [loadingRestore, setLoadingRestore] = useState(false)

  // ============================================================
  // handleBackup
  // Dispara download do JSON completo da tabela fornecedores
  // Inclui o nome do usuário logado no nome do arquivo
  // ============================================================
  async function handleBackup() {
    setLoadingBackup(true)
    try {
      await fazerBackup(usuario)
    } catch (err) {
      alert('Erro ao gerar backup. Tente novamente.')
      console.error(err)
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
      `Restaurar backup "${file.name}"?\n\nOs registros existentes serão atualizados ou criados (upsert por ID). Esta ação não pode ser desfeita.`
    )
    if (!confirmar) {
      e.target.value = ''
      return
    }

    setLoadingRestore(true)
    try {
      const dados = await lerArquivoBackup(file)
      await restaurarBackup(dados)
      alert(`Backup restaurado com sucesso! ${dados.length} registros processados.`)
      onRestaurado()
    } catch (err: any) {
      alert(`Erro ao restaurar: ${err.message}`)
      console.error(err)
    } finally {
      setLoadingRestore(false)
      e.target.value = ''
    }
  }

  // ============================================================
  // Render
  // ============================================================
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '12px',
        fontFamily: 'Tahoma, Geneva, sans-serif',
      }}
    >
      {/* Título + contador — sem "ativos" */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
        <span
          style={{
            fontSize: '15px',
            fontWeight: 700,
            color: '#1a6094',
          }}
        >
          Carteira de Fornecedores
        </span>
        <span
          style={{
            fontSize: '11px',
            color: '#5a84a6',
          }}
        >
          {total} fornecedores
        </span>
      </div>

      {/* Botões de ação */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>

        {/* Backup */}
        <button
          onClick={handleBackup}
          disabled={loadingBackup}
          title="Exportar backup completo da tabela fornecedores"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '5px 10px',
            fontSize: '12px',
            fontWeight: 700,
            fontFamily: 'Tahoma, Geneva, sans-serif',
            background: '#1a6094',
            color: '#ffffff',
            border: '1px solid #1a6094',
            borderRadius: '5px',
            cursor: loadingBackup ? 'wait' : 'pointer',
            opacity: loadingBackup ? 0.7 : 1,
          }}
        >
          <i className="ti ti-database" style={{ fontSize: '14px' }} aria-hidden="true" />
          {loadingBackup ? 'Gerando...' : 'Backup'}
        </button>

        {/* Restaurar */}
        <button
          onClick={handleRestaurarClick}
          disabled={loadingRestore}
          title="Restaurar backup da tabela fornecedores"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '5px 10px',
            fontSize: '12px',
            fontWeight: 700,
            fontFamily: 'Tahoma, Geneva, sans-serif',
            background: '#ffffff',
            color: '#3a6080',
            border: '1px solid #c4d8eb',
            borderRadius: '5px',
            cursor: loadingRestore ? 'wait' : 'pointer',
            opacity: loadingRestore ? 0.7 : 1,
          }}
        >
          <i className="ti ti-restore" style={{ fontSize: '14px' }} aria-hidden="true" />
          {loadingRestore ? 'Restaurando...' : 'Restaurar'}
        </button>

        {/* Input file oculto para Restaurar */}
        <input
          ref={inputRestaurarRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleArquivoSelecionado}
        />

        {/* Exportar CSV / Excel — componente dropdown reutilizado */}
        <ExportDropdown fornecedores={fornecedores} />

        {/* Novo Fornecedor */}
        <button
          onClick={onNovoFornecedor}
          title="Cadastrar novo fornecedor"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '5px 10px',
            fontSize: '12px',
            fontWeight: 700,
            fontFamily: 'Tahoma, Geneva, sans-serif',
            background: '#1a6094',
            color: '#ffffff',
            border: '1px solid #1a6094',
            borderRadius: '5px',
            cursor: 'pointer',
          }}
        >
          <i className="ti ti-user-plus" style={{ fontSize: '14px' }} aria-hidden="true" />
          Novo Fornecedor
        </button>

      </div>
    </div>
  )
}
