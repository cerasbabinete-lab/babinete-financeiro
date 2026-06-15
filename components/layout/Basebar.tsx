// ============================================================
// components/layout/Basebar.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Global
// Função: Basebar mobile fixa no rodapé — 4 botões:
//         Backup, Restaurar, Exportar, Novo Cliente
//         Restaurar: exibe modal com lista de backups clicáveis
// Conecta com: app/clientes/page.tsx
//              clientesService.ts (fazerBackup, listarBackups, baixarBackup, restaurarBackup)
//              ExportDropdown.tsx (exportar CSV/Excel)
// ============================================================

'use client'

import { useState } from 'react'
import { fazerBackup, listarBackups, baixarBackup, restaurarBackup } from '@/lib/clientesService'
import type { Cliente } from '@/types/clientes'
import ExportDropdown from '@/components/clientes/ExportDropdown'

// ============================================================
// Props
// ============================================================
interface BasebarProps {
  clientes: Cliente[]
  usuario: string
  onNovoCliente: () => void
  onRestaurado: () => void
}

// ============================================================
// Basebar
// ============================================================
export default function Basebar({ clientes, usuario, onNovoCliente, onRestaurado }: BasebarProps) {

  const [loadingBackup, setLoadingBackup] = useState(false)
  const [loadingRestore, setLoadingRestore] = useState(false)
  const [modalRestaurar, setModalRestaurar] = useState(false)
  const [arquivosBackup, setArquivosBackup] = useState<string[]>([])
  const [arquivoSelecionado, setArquivoSelecionado] = useState<string | null>(null)
  const [carregandoLista, setCarregandoLista] = useState(false)

  // ============================================================
  // handleBackup
  // ============================================================
  async function handleBackup() {
    setLoadingBackup(true)
    try {
      await fazerBackup(usuario)
      alert('Backup realizado com sucesso! O arquivo foi salvo na nuvem.')
    } catch {
      alert('Erro ao gerar backup.')
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

    const confirmar = confirm(
      `Restaurar o backup "${arquivoSelecionado}"?\n\nOs registros existentes serão atualizados ou criados. Esta ação não pode ser desfeita.`
    )
    if (!confirmar) return

    setModalRestaurar(false)
    setLoadingRestore(true)
    try {
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
      <footer
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: '#ffffff', borderTop: '1px solid #c4d8eb',
          display: 'flex', alignItems: 'center', justifyContent: 'space-around',
          padding: '6px 0 0',
          paddingBottom: 'calc(10px + env(safe-area-inset-bottom))',
          zIndex: 100, fontFamily: 'Tahoma, Geneva, sans-serif',
        }}
      >
        {/* Backup */}
        <button onClick={handleBackup} disabled={loadingBackup} style={btnStyle}>
          <i className="ti ti-database" style={{ fontSize: '20px', color: '#1a6094' }} aria-hidden="true" />
          <span style={labelStyle}>{loadingBackup ? '...' : 'Backup'}</span>
        </button>

        {/* Restaurar */}
        <button onClick={handleAbrirModalRestaurar} disabled={loadingRestore} style={btnStyle}>
          <i className="ti ti-restore" style={{ fontSize: '20px', color: '#1a6094' }} aria-hidden="true" />
          <span style={labelStyle}>{loadingRestore ? '...' : 'Restaurar'}</span>
        </button>

        {/* Exportar — ti-table-export via ExportDropdown mobile */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <ExportDropdown clientes={clientes} usuario={usuario} mobile />
        </div>

        {/* Novo Cliente */}
        <button onClick={onNovoCliente} style={{ ...btnStyle, color: '#1a6094' }}>
          <i className="ti ti-user-plus" style={{ fontSize: '20px', color: '#1a6094' }} aria-hidden="true" />
          <span style={{ ...labelStyle, color: '#1a6094', fontWeight: 700 }}>Novo</span>
        </button>
      </footer>

      {/* ============================================================ */}
      {/* Modal de seleção de backup — mobile                          */}
      {/* ============================================================ */}
      {modalRestaurar && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 200,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            fontFamily: 'Tahoma, Geneva, sans-serif',
          }}
          onClick={e => { if (e.target === e.currentTarget) setModalRestaurar(false) }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '12px 12px 0 0',
              width: '100%',
              maxHeight: '70vh',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
              paddingBottom: 'env(safe-area-inset-bottom)',
            }}
          >
            {/* Header */}
            <div
              style={{
                background: '#1a6094', padding: '12px 16px',
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

            {/* Lista de backups */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '12px 16px' }}>
              {carregandoLista ? (
                <div style={{ textAlign: 'center', padding: '32px', color: '#5a84a6', fontSize: '12px' }}>
                  Carregando backups...
                </div>
              ) : arquivosBackup.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', color: '#5a84a6', fontSize: '12px' }}>
                  Nenhum backup encontrado na nuvem.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <p style={{ fontSize: '11px', color: '#5a84a6', margin: '0 0 8px' }}>
                    Toque no backup que deseja restaurar:
                  </p>
                  {arquivosBackup.map(nome => (
                    <button
                      key={nome}
                      onClick={() => setArquivoSelecionado(nome)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '10px 12px', fontSize: '11px',
                        fontFamily: 'Tahoma, Geneva, sans-serif',
                        textAlign: 'left', width: '100%',
                        background: arquivoSelecionado === nome ? '#edf4fb' : '#ffffff',
                        border: arquivoSelecionado === nome
                          ? '1px solid #1a6094'
                          : '1px solid #dde8f0',
                        borderRadius: '6px',
                        cursor: 'pointer', color: '#3a6080',
                      }}
                    >
                      <i
                        className="ti ti-file-type-json"
                        style={{ fontSize: '18px', color: '#1a6094', flexShrink: 0 }}
                        aria-hidden="true"
                      />
                      <span style={{ wordBreak: 'break-all' }}>{nome}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                borderTop: '1px solid #dde8f0', padding: '10px 16px',
                display: 'flex', gap: '8px', flexShrink: 0, background: '#f7fafc',
              }}
            >
              <button
                onClick={() => setModalRestaurar(false)}
                style={{
                  flex: 1, padding: '10px', fontSize: '12px', fontWeight: 700,
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
                  flex: 1, padding: '10px', fontSize: '12px', fontWeight: 700,
                  fontFamily: 'Tahoma, Geneva, sans-serif',
                  background: arquivoSelecionado ? '#1a6094' : '#a0b8cc',
                  color: '#ffffff', border: 'none', borderRadius: '5px',
                  cursor: arquivoSelecionado ? 'pointer' : 'not-allowed',
                }}
              >
                Restaurar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ============================================================
// Estilos auxiliares
// ============================================================
const btnStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
  gap: '3px', background: 'transparent', border: 'none',
  cursor: 'pointer', padding: '4px 8px',
  borderRadius: '8px', minWidth: '56px',
}

const labelStyle: React.CSSProperties = {
  fontSize: '8px', fontWeight: 600,
  textTransform: 'uppercase', color: '#3a6080',
  fontFamily: 'Tahoma, Geneva, sans-serif',
  letterSpacing: '0.03em', whiteSpace: 'nowrap',
}
