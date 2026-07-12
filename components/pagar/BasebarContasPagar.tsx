// ============================================================
// components/pagar/BasebarContasPagar.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Pagar
// Função: Barra inferior mobile — mesmos 3 botões do Header desktop
//         (Importar Relatório, Importar Comprovante, Roster), em
//         layout de barra fixa. Mesma convenção do projeto: cada
//         módulo tem seu próprio Basebar (Basebar.tsx global está
//         congelado/morto, nunca reutilizado).
// Conecta com: app/pagar/page.tsx (handlers passados como props,
//              pipeline mobile vive em page.tsx, mesmo padrão já
//              documentado no projeto)
// ============================================================

'use client'

import { useRef } from 'react'

interface BasebarContasPagarProps {
  importando:              boolean
  onSelecionarRelatorio:   (file: File) => void
  onSelecionarComprovante: (file: File) => void
  onAbrirRoster:           () => void
}

export default function BasebarContasPagar({ importando, onSelecionarRelatorio, onSelecionarComprovante, onAbrirRoster }: BasebarContasPagarProps) {
  const inputRelatorioRef   = useRef<HTMLInputElement>(null)
  const inputComprovanteRef = useRef<HTMLInputElement>(null)

  const itemStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
    border: 'none', background: 'transparent', color: '#1a6094', fontSize: '9px',
    fontFamily: 'Tahoma, Geneva, sans-serif', cursor: importando ? 'not-allowed' : 'pointer', opacity: importando ? 0.5 : 1,
  }

  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#ffffff', borderTop: '1px solid #dde8f0', display: 'flex', justifyContent: 'space-around', padding: '8px 0', zIndex: 20 }}>
      <button disabled={importando} onClick={() => inputRelatorioRef.current?.click()} style={itemStyle}>
        <i className="ti ti-file-invoice" style={{ fontSize: '20px' }} />
        Relatório BB
      </button>
      <input ref={inputRelatorioRef} type="file" accept="application/pdf" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onSelecionarRelatorio(f); e.target.value = '' }} />

      <button disabled={importando} onClick={() => inputComprovanteRef.current?.click()} style={itemStyle}>
        <i className="ti ti-receipt" style={{ fontSize: '20px' }} />
        Comprovante
      </button>
      <input ref={inputComprovanteRef} type="file" accept="application/pdf,text/plain" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onSelecionarComprovante(f); e.target.value = '' }} />

      <button onClick={onAbrirRoster} style={itemStyle}>
        <i className="ti ti-users-group" style={{ fontSize: '20px' }} />
        Roster
      </button>
    </div>
  )
}
