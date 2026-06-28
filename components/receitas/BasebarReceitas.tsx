// ============================================================
// components/receitas/BasebarReceitas.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Receitas
// Função: Basebar mobile fixa no rodapé — específica do módulo Receitas
//         5 botões: Importar XML | Backup | Restaurar | Exportar | Nova Receita
//         Drawer.tsx está congelado — variante específica criada aqui
// Conecta com: app/receitas/page.tsx
//              receitasService.ts (fazerBackup, lerArquivoBackup, restaurarBackup)
//              ExportDropdownReceitas.tsx (dropdown mobile)
// ============================================================

'use client'

import { useRef, useState } from 'react'
import { fazerBackup, lerArquivoBackup, restaurarBackup } from '@/lib/receitasService'
import type { Receita } from '@/types/receitas'
import ExportDropdownReceitas from './ExportDropdownReceitas'

interface BasebarReceitasProps {
  receitas: Receita[]
  usuario?: string
  onImportarXml: () => void
  onNovaReceita: () => void
  onRestaurado: () => void
  onErro: (msg: string) => void
  onSucesso: (msg: string) => void
}

export default function BasebarReceitas({
  receitas,
  usuario,
  onImportarXml,
  onNovaReceita,
  onRestaurado,
  onErro,
  onSucesso,
}: BasebarReceitasProps) {

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
      await restaurarBackup(dados)
      onSucesso(`Backup restaurado: ${dados.length} registros.`)
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
    }}>

      {/* Importar XML */}
      <button onClick={onImportarXml} style={btnStyle}>
        <i className="ti ti-file-import" style={{ fontSize: '20px', color: '#1a6094' }} aria-hidden="true" />
        <span style={{ ...labelStyle, color: '#1a6094', fontWeight: 700 }}>Importar</span>
      </button>

      {/* Backup */}
      <button onClick={handleBackup} disabled={loadingBackup} style={btnStyle}>
        <i className="ti ti-database" style={{ fontSize: '20px', color: '#1a6094' }} aria-hidden="true" />
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
        <ExportDropdownReceitas receitas={receitas} usuario={usuario ?? ''} mobile />
      </div>

      {/* Nova Receita */}
      <button onClick={onNovaReceita} style={btnStyle}>
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
  borderRadius: '8px', minWidth: '52px',
}

const labelStyle: React.CSSProperties = {
  fontSize: '8px', fontWeight: 600, textTransform: 'uppercase',
  color: '#3a6080', fontFamily: 'Tahoma, Geneva, sans-serif',
  letterSpacing: '0.03em', whiteSpace: 'nowrap',
}
