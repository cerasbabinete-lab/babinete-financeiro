// ============================================================
// components/despesas/DespesasHeader.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Despesas
// Função: Header da tela desktop — título, contador e botões
//         "Importar XML" (NFS-e / NF-e de compra) e "Importar
//         Documento" (Gemini) à esquerda, "Nova Despesa" (manual)
//         à direita. Réplica visual de ReceitasHeader.tsx.
// Conecta com: app/despesas/page.tsx (callbacks e totalDespesas)
// Sem alert() / confirm() — erros e confirmações via callbacks
// ============================================================

'use client'

// ============================================================
// Props
// ============================================================
interface DespesasHeaderProps {
  totalDespesas: number            // Contador exibido ao lado do título
  onImportarXml: () => void        // Abre o file picker de import XML (NFS-e / NF-e compra)
  onImportarDocumento: () => void  // Abre o file picker de import via IA (PDF/imagem/TXT/DOC/XLS/XLSX)
  onNovaDespesa: () => void        // Abre modal no modo 'novo' (lançamento manual)
}

// ============================================================
// DespesasHeader
// Renderiza apenas em desktop (mobile usa BasebarDespesas.tsx)
// ============================================================
export default function DespesasHeader({
  totalDespesas,
  onImportarXml,
  onImportarDocumento,
  onNovaDespesa,
}: DespesasHeaderProps) {

  // Estilo base compartilhado pelos 3 botões — evita repetição de objeto
  const botaoBase: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 14px',
    fontSize: '12px',
    fontWeight: 700,
    fontFamily: 'Tahoma, Geneva, sans-serif',
    borderRadius: '5px',
    cursor: 'pointer',
    border: '1px solid #1a6094',
  }

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
      {/* Esquerda: título + contador + botões de importação */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>

        {/* Título + contador */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#1a6094' }}>
            Despesas
          </span>
          <span style={{ fontSize: '11px', color: '#5a84a6' }}>
            {totalDespesas} {totalDespesas === 1 ? 'registro' : 'registros'}
          </span>
        </div>

        {/* Importar XML — NFS-e ou NF-e de compra, auto-detectado no client */}
        <button
          onClick={onImportarXml}
          title="Importar NFS-e ou NF-e de compra (XML)"
          style={{ ...botaoBase, background: '#1a6094', color: '#ffffff' }}
        >
          <i className="ti ti-file-import" style={{ fontSize: '14px' }} aria-hidden="true" />
          Importar XML
        </button>

        {/* Importar Documento — pipeline Gemini, aceita PDF/imagem/TXT/DOC/XLS/XLSX */}
        <button
          onClick={onImportarDocumento}
          title="Importar documento via IA (PDF, imagem, TXT, DOC, XLS, XLSX)"
          style={{ ...botaoBase, background: '#ffffff', color: '#1a6094' }}
        >
          <i className="ti ti-sparkles" style={{ fontSize: '14px' }} aria-hidden="true" />
          Importar Documento
        </button>

      </div>

      {/* Direita: Nova Despesa (lançamento manual, sem documento) */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <button
          onClick={onNovaDespesa}
          title="Cadastrar nova despesa manualmente"
          style={{ ...botaoBase, background: '#1a6094', color: '#ffffff' }}
        >
          <i className="ti ti-plus" style={{ fontSize: '14px' }} aria-hidden="true" />
          Nova Despesa
        </button>
      </div>
    </div>
  )
}
