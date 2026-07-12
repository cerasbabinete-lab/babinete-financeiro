// ============================================================
// components/pagar/ContasAPagarHeader.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Pagar
// Função: Header desktop — título, contador, botões de import
//         (Relatório BB / Comprovante) e ícone de manutenção do
//         roster. Réplica do padrão visual de ContasReceberHeader.tsx,
//         com o pipeline de upload disparado por props (mesmo padrão
//         "desktop import pipeline vive no Header" já documentado
//         no projeto) — a lógica de fato (base64/fetch) mora em
//         app/pagar/page.tsx, que passa os handlers como props.
// Conecta com: app/pagar/page.tsx
// ============================================================

'use client'

import { useRef } from 'react'

interface ContasAPagarHeaderProps {
  totalTitulos:        number
  importando:          boolean
  onSelecionarRelatorio:  (file: File) => void
  onSelecionarComprovante: (file: File) => void
  onAbrirRoster:        () => void
}

export default function ContasAPagarHeader({
  totalTitulos,
  importando,
  onSelecionarRelatorio,
  onSelecionarComprovante,
  onAbrirRoster,
}: ContasAPagarHeaderProps) {
  const inputRelatorioRef  = useRef<HTMLInputElement>(null)
  const inputComprovanteRef = useRef<HTMLInputElement>(null)

  const btnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '6px',
    border: '1px solid #1a6094', background: '#ffffff', color: '#1a6094',
    borderRadius: '6px', padding: '8px 14px', fontSize: '12px', fontFamily: 'Tahoma, Geneva, sans-serif',
    cursor: importando ? 'not-allowed' : 'pointer', opacity: importando ? 0.6 : 1,
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', padding: '4px 0 12px', fontFamily: 'Tahoma, Geneva, sans-serif' }}>
      <div>
        <div style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a' }}>Contas a Pagar</div>
        <div style={{ fontSize: '11px', color: '#7a8a99' }}>{totalTitulos} título(s)</div>
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button disabled={importando} onClick={() => inputRelatorioRef.current?.click()} style={btnStyle}>
          <i className="ti ti-file-invoice" /> Importar Relatório BB
        </button>
        <input ref={inputRelatorioRef} type="file" accept="application/pdf" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onSelecionarRelatorio(f); e.target.value = '' }} />

        <button disabled={importando} onClick={() => inputComprovanteRef.current?.click()} style={btnStyle}>
          <i className="ti ti-receipt" /> Importar Comprovante
        </button>
        <input ref={inputComprovanteRef} type="file" accept="application/pdf,text/plain" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onSelecionarComprovante(f); e.target.value = '' }} />

        <button onClick={onAbrirRoster} title="Manutenção do roster de beneficiários" style={{ ...btnStyle, padding: '8px 10px' }}>
          <i className="ti ti-users-group" />
        </button>
      </div>
    </div>
  )
}
