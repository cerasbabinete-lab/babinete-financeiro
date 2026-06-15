// ============================================================
// components/clientes/ClientesHeader.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Clientes
// Função: Header da tela desktop — título, contador de clientes
//         ativos e botões Backup, Restaurar, Exportar, Novo Cliente
//         Backup: salva no Supabase Storage (bucket backups)
//         Restaurar: lista backups do Storage, usuário escolhe qual restaurar
// Conecta com: app/clientes/page.tsx (callbacks e totalAtivos)
//              clientesService.ts (fazerBackup, listarBackups, baixarBackup, restaurarBackup)
//              ExportDropdown.tsx (dropdown CSV/Excel)
// ============================================================

'use client'

import { useState } from 'react'
import { fazerBackup, listarBackups, baixarBackup, restaurarBackup } from '@/lib/clientesService'
import type { Cliente } from '@/types/clientes' // ModoModal removido — não usado neste componente
import ExportDropdown from './ExportDropdown'

// ============================================================
// Props
// ============================================================
interface ClientesHeaderProps {
  totalAtivos: number              // Contador exibido ao lado do título
  clientes: Cliente[]              // Lista atual filtrada (para exportar)
  usuario: string                  // 1º nome do usuário logado — usado no nome do backup
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
  usuario,
  onNovoCliente,
  onRestaurado,
}: ClientesHeaderProps) {

  // Estado de loading para feedback durante backup/restore
  const [loadingBackup, setLoadingBackup] = useState(false)
  const [loadingRestore, setLoadingRestore] = useState(false)

  // ============================================================
  // handleBackup
  // Salva backup completo da tabela clientes no Supabase Storage
  // ============================================================
  async function handleBackup() {
    setLoadingBackup(true)
    try {
      // Passa o 1º nome do usuário logado para incluir no nome do arquivo de backup
      await fazerBackup(usuario)
      alert('Backup realizado com sucesso! O arquivo foi salvo na nuvem.')
    } catch (err: unknown) {
      alert('Erro ao gerar backup. Tente novamente.')
      console.error(err)
    } finally {
      setLoadingBackup(false)
    }
  }

  // ============================================================
  // handleRestaurar
  // Lista backups disponíveis no Supabase Storage e deixa o
  // usuário escolher qual restaurar via prompt com lista numerada
  // ============================================================
  async function handleRestaurar() {
    setLoadingRestore(true)
    try {
      // Busca lista de arquivos disponíveis no bucket backups
      const arquivos = await listarBackups()

      if (arquivos.length === 0) {
        alert('Nenhum backup encontrado na nuvem.')
        return
      }

      // Monta lista numerada para exibir ao usuário
      const lista = arquivos
        .map((nome, i) => `${i + 1}. ${nome}`)
        .join('\n')

      // Exibe lista e pede escolha via prompt
      const escolha = prompt(
        `Backups disponíveis na nuvem:\n\n${lista}\n\nDigite o número do backup que deseja restaurar:`
      )

      // Usuário cancelou ou não digitou nada
      if (!escolha) return

      const indice = parseInt(escolha.trim()) - 1

      // Valida se o número digitado é válido
      if (isNaN(indice) || indice < 0 || indice >= arquivos.length) {
        alert('Número inválido. Tente novamente.')
        return
      }

      const nomeArquivo = arquivos[indice]

      // Confirmação obrigatória antes de sobrescrever dados
      const confirmar = confirm(
        `Restaurar o backup "${nomeArquivo}"?\n\nOs registros existentes serão atualizados ou criados (upsert por ID). Esta ação não pode ser desfeita.`
      )
      if (!confirmar) return

      // Baixa o arquivo do Storage e restaura os dados
      const dados = await baixarBackup(nomeArquivo)
      await restaurarBackup(dados)
      alert(`Backup restaurado com sucesso! ${dados.length} registros processados.`)
      onRestaurado() // Recarrega a lista na página pai
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      alert(`Erro ao restaurar: ${msg}`)
      console.error(err)
    } finally {
      setLoadingRestore(false)
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
          title="Salvar backup completo na nuvem"
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
          onClick={handleRestaurar}
          disabled={loadingRestore}
          title="Restaurar backup da nuvem"
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
