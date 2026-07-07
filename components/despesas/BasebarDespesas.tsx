// ============================================================
// components/despesas/BasebarDespesas.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Despesas
// Função: Basebar mobile fixa no rodapé — específica do módulo Despesas
//         3 botões: Importar XML | Importar Documento (IA) | Nova Despesa
//         Drawer.tsx está congelado — variante específica criada aqui,
//         mesmo padrão já usado por BasebarReceitas.tsx / BasebarContasReceber.tsx
// Conecta com: app/despesas/page.tsx
// ============================================================

'use client'

interface BasebarDespesasProps {
  onImportarXml: () => void
  onImportarDocumento: () => void
  onNovaDespesa: () => void
}

export default function BasebarDespesas({
  onImportarXml,
  onImportarDocumento,
  onNovaDespesa,
}: BasebarDespesasProps) {

  return (
    <footer style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: '#ffffff', borderTop: '1px solid #c4d8eb',
      display: 'flex', alignItems: 'center', justifyContent: 'space-around',
      padding: '6px 0', paddingBottom: 'env(safe-area-inset-bottom)',
      zIndex: 100, fontFamily: 'Tahoma, Geneva, sans-serif',
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
  borderRadius: '8px', minWidth: '52px',
}

const labelStyle: React.CSSProperties = {
  fontSize: '8px', fontWeight: 600, textTransform: 'uppercase',
  color: '#3a6080', fontFamily: 'Tahoma, Geneva, sans-serif',
  letterSpacing: '0.03em', whiteSpace: 'nowrap',
}
