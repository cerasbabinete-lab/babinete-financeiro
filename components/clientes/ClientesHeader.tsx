// ============================================================
// components/clientes/ClientesHeader.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Clientes
// Função: Header da tela desktop — título, contador de clientes
//         ativos e botões Backup, Restaurar, Exportar, Novo Cliente
// Conecta com: app/clientes/page.tsx (callbacks e totalAtivos)
//              clientesService.ts (fazerBackup, lerArquivoBackup, restaurarBackup)
//              ExportDropdown.tsx (dropdown CSV/Excel)
// ============================================================

'use client'

import { useRef, useState } from 'react'
import { fazerBackup, lerArquivoBackup, restaurarBackup } from '@/lib/clientesService'
import type { Cliente } from '@/types/clientes' // ModoModal removido — não usado neste componente
import ExportDropdown from './ExportDropdown'

// ============================================================
// Props
// ============================================================
interface ClientesHeaderProps {
  totalAtivos: number              // Contador exibido ao lado do título
  clientes: Cliente[]              // Lista atual filtrada (para exportar)
  onNovoCliente: () => void        // Abre modal no modo 'novo'
  onRestaurado: () => void         // Callback após restore — recarrega lista
}

// ============================================================
// ClientesHeader
// Renderiza apenas em desktop (mobile usa Basebar.tsx)
// ============================================================
export default function ClientesHeader({
  totalAtivos,
  clientes,
  onNovoCliente,
  onRestaurado,
}: ClientesHeaderProps) {

  // Ref para o input file oculto do Restaurar
  const inputRestaurarRef = useRef<HTMLInputElement>(null)

  // Estado de loading para feedback durante backup/restore
  const [loadingBackup, setLoadingBackup] = useState(false)
  const [loadingRestore, setLoadingRestore] = useState(false)

  // ============================================================
  // handleBackup
  // Dispara download do JSON completo da tabela clientes
  // ============================================================
  async function handleBackup() {
    setLoadingBackup(true)
    try {
      await fazerBackup()
    } catch (err) {
      alert('Erro ao gerar backup. Tente novamente.')
      console.error(err)
    } finally {
      setLoadingBackup(false)
    }
  }

  // ============================================================
  // handleRestaurarClick
  // Abre o seletor de arquivo (input file oculto)
  // ============================================================
  function handleRestaurarClick() {
    inputRestaurarRef.current?.click()
  }

  // ============================================================
  // handleArquivoSelecionado
  // Lê o arquivo JSON e executa o upsert após confirmação
  // ============================================================
  async function handleArquivoSelecionado(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Confirmação obrigatória antes de sobrescrever dados
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
      onRestaurado() // Recarrega a lista na página pai
    } catch (err: unknown) {
      // Narrows err para acessar .message com segurança — evita any implícito
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      alert(`Erro ao restaurar: ${msg}`)
      console.error(err)
    } finally {
      setLoadingRestore(false)
      e.target.value = '' // Reseta o input para permitir selecionar o mesmo arquivo novamente
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
      {/* Título + contador */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
        <span
          style={{
            fontSize: '15px',
            fontWeight: 700,
            color: '#1a6094',
          }}
        >
          Carteira de Clientes
        </span>
        <span
          style={{
            fontSize: '11px',
            color: '#5a84a6',
          }}
        >
          {totalAtivos} clientes ativos
        </span>
      </div>

      {/* Botões de ação */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>

        {/* Backup */}
        <button
          onClick={handleBackup}
          disabled={loadingBackup}
          title="Exportar backup completo da tabela clientes"
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
          <i className="ti ti-database-export" style={{ fontSize: '14px' }} aria-hidden="true" />
          {loadingBackup ? 'Gerando...' : 'Backup'}
        </button>

        {/* Restaurar */}
        <button
          onClick={handleRestaurarClick}
          disabled={loadingRestore}
          title="Restaurar backup da tabela clientes"
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

        {/* Exportar CSV / Excel — componente dropdown */}
        <ExportDropdown clientes={clientes} />

        {/* Novo Cliente */}
        <button
          onClick={onNovoCliente}
          title="Cadastrar novo cliente"
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
          Novo Cliente
        </button>

      </div>
    </div>
  )
}
