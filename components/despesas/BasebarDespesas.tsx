// ============================================================
// components/despesas/BasebarDespesas.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Despesas
// Função: Basebar mobile fixa no rodapé — específica do módulo Despesas
//         6 botões: Importar XML | Importar Documento (IA) | Backup |
//         Restaurar | Exportar | Nova Despesa
//         FEATURE (a pedido do usuário): Backup/Restaurar/Exportar
//         adicionados para replicar o mesmo padrão já existente em
//         BasebarReceitas.tsx / BasebarContasReceber.tsx
//         Drawer.tsx está congelado — variante específica criada aqui,
//         mesmo padrão já usado por BasebarReceitas.tsx / BasebarContasReceber.tsx
// Conecta com: app/despesas/page.tsx
//              despesasService.ts (fazerBackup, lerArquivoBackup, restaurarBackup)
//              ExportDropdownDespesas.tsx (dropdown mobile)
// ============================================================

'use client'

import { useRef, useState } from 'react'
import { fazerBackup, lerArquivoBackup, restaurarBackup } from '@/lib/despesasService'
import type { Despesa } from '@/types/despesas'
import ExportDropdownDespesas from './ExportDropdownDespesas'

interface BasebarDespesasProps {
  despesas: Despesa[]
  usuario?: string
  onImportarXml: () => void
  onImportarDocumento: () => void
  onNovaDespesa: () => void
  onRestaurado: () => void
  onErro: (msg: string) => void
  onSucesso: (msg: string) => void
}

export default function BasebarDespesas({
  despesas,
  usuario,
  onImportarXml,
  onImportarDocumento,
  onNovaDespesa,
  onRestaurado,
  onErro,
  onSucesso,
}: BasebarDespesasProps) {

  const inputRestaurarRef = useRef<HTMLInputElement>(null)
  const [loadingBackup,  setLoadingBackup]  = useState(false)
  const [loadingRestore, setLoadingRestore] = useState(false)

  async function handleBackup() {
    setLoadingBackup(true)
    try {
      await fazerBackup(usuario)
    } catch (err: unknown) {
      onErro(err instanceof Error ? err.message : 'Erro ao gerar backup')
    } finally {
      setLoadingBackup(false)
    }
  }

  async function handleArquivoSelecionado(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoadingRestore(true)
    try {
      const dados = await lerArquivoBackup(file)
      const { processados } = await restaurarBackup(dados)
      onSucesso(`Backup restaurado: ${processados} registros processados.`)
      onRestaurado()
    } catch (err: unknown) {
      onErro(err instanceof Error ? err.message : 'Erro ao restaurar backup')
    } finally {
      setLoadingRestore(false)
      e.target.value = ''
    }
  }

  return (
    <footer style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: '#ffffff', borderTop: '1px solid #c4d8eb',
      display: 'flex', alignItems: 'center', justifyContent: 'space-around',
      padding: '6px 0', paddingBottom: 'env(safe-area-inset-bottom)',
      zIndex: 100, fontFamily: 'Tahoma, Geneva, sans-serif',
      overflowX: 'auto',
    }}>

      {/* Importar XML — NFS-e ou NF-e de compra */}
      <button onClick={onImportarXml} style={btnStyle}>
        <i className="ti ti-file-import" style={{ fontSize: '20px', color: '#1a6094' }} aria-hidden="true" />
        <span style={{ ...labelStyle, color: '#1a6094', fontWeight: 700 }}>XML</span>
      </button>

      {/* Importar Documento — pipeline Gemini */}
      <button onClick={onImportarDocumento} style={btnStyle}>
        <i className="ti ti-sparkles" style={{ fontSize: '20px', color: '#1a6094' }} aria-hidden="true" />
        <span style={{ ...labelStyle, color: '#1a6094', fontWeight: 700 }}>Documento</span>
      </button>

      {/* Backup */}
      <button onClick={handleBackup} disabled={loadingBackup} style={btnStyle}>
        <i className="ti ti-database-export" style={{ fontSize: '20px', color: '#1a6094' }} aria-hidden="true" />
        <span style={labelStyle}>{loadingBackup ? '...' : 'Backup'}</span>
      </button>

      {/* Restaurar */}
      <button onClick={() => inputRestaurarRef.current?.click()} disabled={loadingRestore} style={btnStyle}>
        <i className="ti ti-restore" style={{ fontSize: '20px', color: '#1a6094' }} aria-hidden="true" />
        <span style={labelStyle}>{loadingRestore ? '...' : 'Restaurar'}</span>
      </button>

      <input ref={inputRestaurarRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleArquivoSelecionado} />

      {/* Exportar */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <ExportDropdownDespesas despesas={despesas} usuario={usuario ?? ''} mobile />
      </div>

      {/* Nova Despesa — lançamento manual */}
      <button onClick={onNovaDespesa} style={btnStyle}>
        <i className="ti ti-plus" style={{ fontSize: '20px', color: '#1a6094' }} aria-hidden="true" />
        <span style={{ ...labelStyle, color: '#1a6094', fontWeight: 700 }}>Nova</span>
      </button>

    </footer>
  )
}

const btnStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  justifyContent: 'center', gap: '3px', background: 'transparent',
  border: 'none', cursor: 'pointer', padding: '4px 8px',
  borderRadius: '8px', minWidth: '52px', flexShrink: 0,
}

const labelStyle: React.CSSProperties = {
  fontSize: '8px', fontWeight: 600, textTransform: 'uppercase',
  color: '#3a6080', fontFamily: 'Tahoma, Geneva, sans-serif',
  letterSpacing: '0.03em', whiteSpace: 'nowrap',
}
