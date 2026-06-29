// ============================================================
// components/contas-receber/BasebarContasReceber.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Receber
// Função: Basebar mobile fixa no rodapé — específica do módulo
//         7 botões: TXT BB | REM | RET | Backup | Restaurar | Exportar | Novo
//         Processos de import delegados a handlers via props (page.tsx)
// Conecta com: app/receber/page.tsx
//              contasReceberService.ts (fazerBackup, lerArquivoBackup, restaurarBackup)
//              ExportDropdownContasReceber.tsx (dropdown mobile)
// ============================================================

'use client'

import { useRef, useState } from 'react'
import { fazerBackup, lerArquivoBackup, restaurarBackup } from '@/lib/contasReceberService'
import type { ContaReceber } from '@/types/contasReceber'
import ExportDropdownContasReceber from './ExportDropdownContasReceber'

interface BasebarContasReceberProps {
  titulos:            ContaReceber[]
  usuario?:           string
  onImportarTxtBb:    (file: File) => Promise<void>  // Handler no page.tsx
  onImportarRem:      (file: File) => Promise<void>  // Handler no page.tsx
  onImportarRet:      (file: File) => Promise<void>  // Handler no page.tsx
  onNovoLancamento:   () => void
  onRestaurado:       () => void
  onErro:             (msg: string) => void
  onSucesso:          (msg: string) => void
}

export default function BasebarContasReceber({
  titulos,
  usuario,
  onImportarTxtBb,
  onImportarRem,
  onImportarRet,
  onNovoLancamento,
  onRestaurado,
  onErro,
  onSucesso,
}: BasebarContasReceberProps) {

  // ── Refs para file pickers ocultos ────────────────────────
  const refTxtBb   = useRef<HTMLInputElement>(null)
  const refRem     = useRef<HTMLInputElement>(null)
  const refRet     = useRef<HTMLInputElement>(null)
  const refRestaur = useRef<HTMLInputElement>(null)

  // ── Loading states ────────────────────────────────────────
  const [loadingTxtBb,  setLoadingTxtBb]  = useState(false)
  const [loadingRem,    setLoadingRem]    = useState(false)
  const [loadingRet,    setLoadingRet]    = useState(false)
  const [loadingBackup, setLoadingBackup] = useState(false)
  const [loadingRestaur, setLoadingRestaur] = useState(false)

  // ── Import TXT BB ─────────────────────────────────────────
  async function handleTxtBb(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoadingTxtBb(true)
    try {
      await onImportarTxtBb(file)
    } finally {
      setLoadingTxtBb(false)
      e.target.value = ''
    }
  }

  // ── Import REM ────────────────────────────────────────────
  async function handleRem(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoadingRem(true)
    try {
      await onImportarRem(file)
    } finally {
      setLoadingRem(false)
      e.target.value = ''
    }
  }

  // ── Import RET ────────────────────────────────────────────
  async function handleRet(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoadingRet(true)
    try {
      await onImportarRet(file)
    } finally {
      setLoadingRet(false)
      e.target.value = ''
    }
  }

  // ── Backup ────────────────────────────────────────────────
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

  // ── Restaurar ─────────────────────────────────────────────
  async function handleRestaurar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoadingRestaur(true)
    try {
      const dados = await lerArquivoBackup(file)
      await restaurarBackup(dados)
      onSucesso(`Backup restaurado: ${dados.length} registros.`)
      onRestaurado()
    } catch (err: unknown) {
      onErro(err instanceof Error ? err.message : 'Erro ao restaurar backup')
    } finally {
      setLoadingRestaur(false)
      e.target.value = ''
    }
  }

  return (
    <footer style={{
      position:   'fixed',
      bottom:     0,
      left:       0,
      right:      0,
      background: '#ffffff',
      borderTop:  '1px solid #c4d8eb',
      display:    'flex',
      alignItems: 'center',
      justifyContent: 'space-around',
      padding:    '6px 0',
      // Respeita safe-area em iPhones com notch/home bar
      paddingBottom: 'env(safe-area-inset-bottom)',
      zIndex:     100,
      fontFamily: 'Tahoma, Geneva, sans-serif',
    }}>

      {/* TXT BB */}
      <button onClick={() => refTxtBb.current?.click()} disabled={loadingTxtBb} style={btnStyle}>
        <i className="ti ti-file-import" style={{ fontSize: '20px', color: '#1a6094' }} aria-hidden="true" />
        <span style={{ ...labelStyle, color: '#1a6094', fontWeight: 700 }}>
          {loadingTxtBb ? '...' : 'TXT BB'}
        </span>
      </button>

      {/* REM */}
      <button onClick={() => refRem.current?.click()} disabled={loadingRem} style={btnStyle}>
        <i className="ti ti-file-upload" style={{ fontSize: '20px', color: '#1a6094' }} aria-hidden="true" />
        <span style={labelStyle}>{loadingRem ? '...' : 'REM'}</span>
      </button>

      {/* RET */}
      <button onClick={() => refRet.current?.click()} disabled={loadingRet} style={btnStyle}>
        <i className="ti ti-file-download" style={{ fontSize: '20px', color: '#1a6094' }} aria-hidden="true" />
        <span style={labelStyle}>{loadingRet ? '...' : 'RET'}</span>
      </button>

      {/* Backup */}
      <button onClick={handleBackup} disabled={loadingBackup} style={btnStyle}>
        <i className="ti ti-database-export" style={{ fontSize: '20px', color: '#1a6094' }} aria-hidden="true" />
        <span style={labelStyle}>{loadingBackup ? '...' : 'Backup'}</span>
      </button>

      {/* Restaurar */}
      <button onClick={() => refRestaur.current?.click()} disabled={loadingRestaur} style={btnStyle}>
        <i className="ti ti-restore" style={{ fontSize: '20px', color: '#1a6094' }} aria-hidden="true" />
        <span style={labelStyle}>{loadingRestaur ? '...' : 'Restaurar'}</span>
      </button>

      {/* Exportar — dropdown mobile */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <ExportDropdownContasReceber titulos={titulos} usuario={usuario ?? ''} mobile />
      </div>

      {/* Novo Lançamento */}
      <button onClick={onNovoLancamento} style={btnStyle}>
        <i className="ti ti-plus" style={{ fontSize: '20px', color: '#1a6094' }} aria-hidden="true" />
        <span style={{ ...labelStyle, color: '#1a6094', fontWeight: 700 }}>Novo</span>
      </button>

      {/* File pickers ocultos */}
      <input ref={refTxtBb}   type="file" accept=".txt"       style={{ display: 'none' }} onChange={handleTxtBb} />
      <input ref={refRem}     type="file" accept=".rem,.txt"  style={{ display: 'none' }} onChange={handleRem} />
      <input ref={refRet}     type="file" accept=".ret,.txt"  style={{ display: 'none' }} onChange={handleRet} />
      <input ref={refRestaur} type="file" accept=".json"      style={{ display: 'none' }} onChange={handleRestaurar} />

    </footer>
  )
}

// ── Estilos compartilhados ─────────────────────────────────

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
