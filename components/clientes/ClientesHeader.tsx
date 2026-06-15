// ============================================================
// components/clientes/ClientesHeader.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Clientes
// Função: Header da tela desktop — título, contador de clientes
//         ativos e botões Backup, Restaurar, Exportar, Novo Cliente
//         Backup: salva no Supabase Storage (bucket backups)
//         Restaurar: exibe modal com lista de backups clicáveis
// Conecta com: app/clientes/page.tsx (callbacks e totalAtivos)
//              clientesService.ts (fazerBackup, listarBackups, baixarBackup, restaurarBackup)
//              ExportDropdown.tsx (dropdown CSV/Excel)
// ============================================================

'use client'

import { useState } from 'react'
import { fazerBackup, listarBackups, baixarBackup, restaurarBackup } from '@/lib/clientesService'
import type { Cliente } from '@/types/clientes'
import ExportDropdown from './ExportDropdown'

// ============================================================
// Props
// ============================================================
interface ClientesHeaderProps {
  totalAtivos: number
  clientes: Cliente[]
  usuario: string
  onNovoCliente: () => void
  onRestaurado: () => void
}

// ============================================================
// ClientesHeader
// ============================================================
export default function ClientesHeader({
  totalAtivos,
  clientes,
  usuario,
  onNovoCliente,
  onRestaurado,
}: ClientesHeaderProps) {

  // Estado de loading para backup e restore
  const [loadingBackup, setLoadingBackup] = useState(false)
  const [loadingRestore, setLoadingRestore] = useState(false)

  // Estado do modal de restaurar
  const [modalRestaurar, setModalRestaurar] = useState(false)
  const [arquivosBackup, setArquivosBackup] = useState<string[]>([])
  const [arquivoSelecionado, setArquivoSelecionado] = useState<string | null>(null)
  const [carregandoLista, setCarregandoLista] = useState(false)

  // ============================================================
  // handleBackup
  // Salva backup completo da tabela clientes no Supabase Storage
  // ============================================================
  async function handleBackup() {
    setLoadingBackup(true)
    try {
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
  // handleAbrirModalRestaurar
  // Busca lista de backups do Storage e abre o modal de seleção
  // ============================================================
  async function handleAbrirModalRestaurar() {
    setCarregandoLista(true)
    setModalRestaurar(true)
    setArquivoSelecionado(null)
    try {
      // Busca lista de arquivos disponíveis no bucket backups
      const arquivos = await listarBackups()
      setArquivosBackup(arquivos)
    } catch (err: unknown) {
      alert('Erro ao carregar lista de backups.')
      console.error(err)
      setModalRestaurar(false)
    } finally {
      setCarregandoLista(false)
    }
  }

  // ============================================================
  // handleConfirmarRestaurar
  // Baixa o arquivo selecionado e faz o upsert na tabela
  // ============================================================
  async function handleConfirmarRestaurar() {
    if (!arquivoSelecionado) return

    // Confirmação obrigatória antes de sobrescrever dados
    const confirmar = confirm(
      `Restaurar o backup "${arquivoSelecionado}"?\n\nOs registros existentes serão atualizados ou criados (upsert por ID). Esta ação não pode ser desfeita.`
    )
    if (!confirmar) return

    setModalRestaurar(false)
    setLoadingRestore(true)
    try {
      // Baixa o arquivo do Storage e restaura os dados na tabela
      const dados = await baixarBackup(arquivoSelecionado)
      await restaurarBackup(dados)
      alert(`Backup restaurado com sucesso! ${dados.length} registros processados.`)
      onRestaurado()
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
    <>
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
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#1a6094' }}>
            Carteira de Clientes
          </span>
          <span style={{ fontSize: '11px', color: '#5a84a6' }}>
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
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '5px 10px', fontSize: '12px', fontWeight: 700,
              fontFamily: 'Tahoma, Geneva, sans-serif',
              background: '#1a6094', color: '#ffffff',
              border: '1px solid #1a6094', borderRadius: '5px',
              cursor: loadingBackup ? 'wait' : 'pointer',
              opacity: loadingBackup ? 0.7 : 1,
            }}
          >
            <i className="ti ti-database-export" style={{ fontSize: '14px' }} aria-hidden="true" />
            {loadingBackup ? 'Gerando...' : 'Backup'}
          </button>

          {/* Restaurar */}
          <button
            onClick={handleAbrirModalRestaurar}
            disabled={loadingRestore}
            title="Restaurar backup da nuvem"
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '5px 10px', fontSize: '12px', fontWeight: 700,
              fontFamily: 'Tahoma, Geneva, sans-serif',
              background: '#ffffff', color: '#3a6080',
              border: '1px solid #c4d8eb', borderRadius: '5px',
              cursor: loadingRestore ? 'wait' : 'pointer',
              opacity: loadingRestore ? 0.7 : 1,
            }}
          >
            <i className="ti ti-restore" style={{ fontSize: '14px' }} aria-hidden="true" />
            {loadingRestore ? 'Restaurando...' : 'Restaurar'}
          </button>

          {/* Exportar CSV / Excel */}
          <ExportDropdown clientes={clientes} usuario={usuario} />

          {/* Novo Cliente */}
          <button
            onClick={onNovoCliente}
            title="Cadastrar novo cliente"
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '5px 10px', fontSize: '12px', fontWeight: 700,
              fontFamily: 'Tahoma, Geneva, sans-serif',
              background: '#1a6094', color: '#ffffff',
              border: '1px solid #1a6094', borderRadius: '5px',
              cursor: 'pointer',
            }}
          >
            <i className="ti ti-user-plus" style={{ fontSize: '14px' }} aria-hidden="true" />
            Novo Cliente
          </button>

        </div>
      </div>

      {/* ============================================================ */}
      {/* Modal de seleção de backup                                    */}
      {/* Exibe lista de backups disponíveis no Supabase Storage        */}
      {/* Usuário clica no arquivo desejado e confirma                  */}
      {/* ============================================================ */}
      {modalRestaurar && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Tahoma, Geneva, sans-serif',
          }}
          onClick={e => { if (e.target === e.currentTarget) setModalRestaurar(false) }}
        >
          <div
            style={{
              background: '#ffffff', borderRadius: '8px',
              width: '100%', maxWidth: '520px',
              maxHeight: '80vh', display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header do modal */}
            <div
              style={{
                background: '#1a6094', padding: '10px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexShrink: 0,
              }}
            >
              <span style={{ color: '#ffffff', fontSize: '13px', fontWeight: 700 }}>
                Restaurar Backup
              </span>
              <button
                onClick={() => setModalRestaurar(false)}
                style={{ background: 'transparent', border: 'none', color: '#ffffff', fontSize: '18px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Corpo — lista de backups */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '12px 16px' }}>
              {carregandoLista ? (
                // Estado de carregamento
                <div style={{ textAlign: 'center', padding: '32px', color: '#5a84a6', fontSize: '12px' }}>
                  Carregando backups...
                </div>
              ) : arquivosBackup.length === 0 ? (
                // Nenhum backup encontrado
                <div style={{ textAlign: 'center', padding: '32px', color: '#5a84a6', fontSize: '12px' }}>
                  Nenhum backup encontrado na nuvem.
                </div>
              ) : (
                // Lista de arquivos — clique seleciona
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <p style={{ fontSize: '11px', color: '#5a84a6', margin: '0 0 8px' }}>
                    Clique no backup que deseja restaurar:
                  </p>
                  {arquivosBackup.map(nome => (
                    <button
                      key={nome}
                      onClick={() => setArquivoSelecionado(nome)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '8px 12px', fontSize: '11px',
                        fontFamily: 'Tahoma, Geneva, sans-serif',
                        textAlign: 'left', width: '100%',
                        background: arquivoSelecionado === nome ? '#edf4fb' : '#ffffff',
                        border: arquivoSelecionado === nome
                          ? '1px solid #1a6094'
                          : '1px solid #dde8f0',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        color: '#3a6080',
                      }}
                    >
                      <i
                        className="ti ti-file-type-json"
                        style={{ fontSize: '16px', color: '#1a6094', flexShrink: 0 }}
                        aria-hidden="true"
                      />
                      {nome}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Footer com botões */}
            <div
              style={{
                borderTop: '1px solid #dde8f0', padding: '10px 16px',
                display: 'flex', justifyContent: 'flex-end', gap: '8px',
                flexShrink: 0, background: '#f7fafc',
              }}
            >
              <button
                onClick={() => setModalRestaurar(false)}
                style={{
                  padding: '6px 16px', fontSize: '12px', fontWeight: 700,
                  fontFamily: 'Tahoma, Geneva, sans-serif',
                  background: '#ffffff', color: '#3a6080',
                  border: '1px solid #c4d8eb', borderRadius: '5px', cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmarRestaurar}
                disabled={!arquivoSelecionado}
                style={{
                  padding: '6px 16px', fontSize: '12px', fontWeight: 700,
                  fontFamily: 'Tahoma, Geneva, sans-serif',
                  background: arquivoSelecionado ? '#1a6094' : '#a0b8cc',
                  color: '#ffffff',
                  border: 'none', borderRadius: '5px',
                  cursor: arquivoSelecionado ? 'pointer' : 'not-allowed',
                }}
              >
                <i className="ti ti-restore" style={{ fontSize: '13px', marginRight: '5px' }} aria-hidden="true" />
                Restaurar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
