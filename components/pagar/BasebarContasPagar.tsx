// ============================================================
// components/pagar/BasebarContasPagar.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Pagar
// Função: Barra inferior mobile — Relatório BB | Comprovante | Boleto |
//         Roster | Backup | Restaurar | Exportar
//         QA fix (20/08/2026, a pedido do Maycon): reescrito pra usar
//         os TOKENS DE ESTILO exatos de BasebarContasReceber.tsx
//         (btnStyle + labelStyle separados, legenda 8px maiúscula com
//         letter-spacing, ícone 20px na cor #1a6094 explícita) — a
//         versão anterior usava um único itemStyle com fontSize 9px
//         sem uppercase, visualmente diferente do resto do sistema.
//         Mesma convenção do projeto: cada módulo tem seu próprio
//         Basebar (Basebar.tsx global está congelado/morto).
// Conecta com: app/pagar/page.tsx (handlers via props)
//              lib/contasAPagarService.ts (fazerBackup, lerArquivoBackup, restaurarBackup)
//              ExportDropdownContasAPagar.tsx (dropdown mobile)
// ============================================================

'use client'

import { useRef, useState } from 'react'
import { fazerBackup, lerArquivoBackup, restaurarBackup } from '@/lib/contasAPagarService'
import type { ContaAPagar } from '@/types/contasAPagar'
import ExportDropdownContasAPagar from './ExportDropdownContasAPagar'

interface BasebarContasPagarProps {
  importando:              boolean
  onSelecionarRelatorio:   (file: File) => void
  onSelecionarComprovante: (file: File) => void
  onSelecionarBoleto:      (file: File) => void
  onAbrirRoster:           () => void
  titulos:                 ContaAPagar[]
  usuario?:                string
  onRestaurado:            () => void
  onErro:                  (msg: string) => void
  onSucesso:               (msg: string) => void
}

export default function BasebarContasPagar({
  importando,
  onSelecionarRelatorio,
  onSelecionarComprovante,
  onSelecionarBoleto,
  onAbrirRoster,
  titulos,
  usuario,
  onRestaurado,
  onErro,
  onSucesso,
}: BasebarContasPagarProps) {

  // ── Refs para file pickers ocultos ────────────────────────
  const inputRelatorioRef   = useRef<HTMLInputElement>(null)
  const inputComprovanteRef = useRef<HTMLInputElement>(null)
  const inputBoletoRef      = useRef<HTMLInputElement>(null)
  const inputRestaurarRef   = useRef<HTMLInputElement>(null)

  // ── Loading states ────────────────────────────────────────
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
      position:       'fixed',
      bottom:         0,
      left:           0,
      right:          0,
      background:     '#ffffff',
      borderTop:      '1px solid #c4d8eb',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'space-around',
      padding:        '6px 0',
      paddingBottom:  'env(safe-area-inset-bottom)',
      zIndex:         100,
      fontFamily:     'Tahoma, Geneva, sans-serif',
      overflowX:      'auto',
    }}>

      {/* Importar Relatório BB */}
      <button disabled={importando} onClick={() => inputRelatorioRef.current?.click()} style={btnStyle}>
        <i className="ti ti-file-invoice" style={{ fontSize: '20px', color: '#1a6094' }} aria-hidden="true" />
        <span style={labelStyle}>Relatório</span>
      </button>
      <input ref={inputRelatorioRef} type="file" accept="application/pdf" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onSelecionarRelatorio(f); e.target.value = '' }} />

      {/* Importar Comprovante */}
      <button disabled={importando} onClick={() => inputComprovanteRef.current?.click()} style={btnStyle}>
        <i className="ti ti-receipt" style={{ fontSize: '20px', color: '#1a6094' }} aria-hidden="true" />
        <span style={labelStyle}>Comprovante</span>
      </button>
      <input ref={inputComprovanteRef} type="file" accept="application/pdf,text/plain" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onSelecionarComprovante(f); e.target.value = '' }} />

      {/* Importar Boleto */}
      <button disabled={importando} onClick={() => inputBoletoRef.current?.click()} style={btnStyle}>
        <i className="ti ti-barcode" style={{ fontSize: '20px', color: '#1a6094' }} aria-hidden="true" />
        <span style={labelStyle}>Boleto</span>
      </button>
      <input ref={inputBoletoRef} type="file" accept="application/pdf" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onSelecionarBoleto(f); e.target.value = '' }} />

      {/* Roster */}
      <button onClick={onAbrirRoster} style={btnStyle}>
        <i className="ti ti-users-group" style={{ fontSize: '20px', color: '#1a6094' }} aria-hidden="true" />
        <span style={labelStyle}>Roster</span>
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

      {/* Exportar — dropdown mobile */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <ExportDropdownContasAPagar titulos={titulos} usuario={usuario ?? ''} mobile />
      </div>

    </footer>
  )
}

// ── Estilos compartilhados — mesmos tokens exatos de
// BasebarContasReceber.tsx / BasebarDespesas.tsx ──
const btnStyle: React.CSSProperties = {
  display:        'flex',
  flexDirection:  'column',
  alignItems:     'center',
  justifyContent: 'center',
  gap:            '3px',
  background:     'transparent',
  border:         'none',
  cursor:         'pointer',
  padding:        '4px 6px',
  borderRadius:   '8px',
  minWidth:       '44px',
  flexShrink:     0,
}

const labelStyle: React.CSSProperties = {
  fontSize:      '8px',
  fontWeight:    600,
  textTransform: 'uppercase',
  color:         '#3a6080',
  fontFamily:    'Tahoma, Geneva, sans-serif',
  letterSpacing: '0.03em',
  whiteSpace:    'nowrap',
}
