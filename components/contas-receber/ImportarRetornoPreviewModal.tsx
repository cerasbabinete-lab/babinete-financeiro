// ============================================================
// components/contas-receber/ImportarRetornoPreviewModal.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Receber
// Função: Modal de prévia exibido ANTES de aplicar uma importação
//         de Retorno (.RET ou .XLS) — lista título por título o
//         que vai mudar (Status atual → Novo status) e os títulos
//         não encontrados, exigindo confirmação explícita do
//         usuário antes de qualquer gravação no banco
// Conecta com: ContasReceberHeader.tsx (abre após gerarPreviewImportacao())
//              contasReceberService.ts (ItemPreviewImportacao)
//              types/contasReceber.ts (STATUS_LABELS, STATUS_CORES)
// Sem alert() ou confirm() — confirmação via botões inline na modal
// ============================================================

'use client'

import type { ItemPreviewImportacao } from '@/lib/contasReceberService'
import { STATUS_LABELS, STATUS_CORES } from '@/types/contasReceber'
import type { StatusTitulo } from '@/types/contasReceber'

interface ImportarRetornoPreviewModalProps {
  origem:         'ret' | 'xls'              // Tipo de arquivo importado — usado só no título da modal
  nomeArquivo:    string                     // Nome do arquivo selecionado — exibido para contexto
  mudancas:       ItemPreviewImportacao[]    // Títulos cujo status vai mudar
  naoEncontrados: ItemPreviewImportacao[]    // Linhas do arquivo sem título correspondente no sistema
  confirmando:    boolean                    // true enquanto a importação está sendo aplicada
  onConfirmar:    () => void                 // Aplica de fato as mudanças (chama processarRegistros*)
  onCancelar:     () => void                 // Fecha a modal sem aplicar nada
}

export default function ImportarRetornoPreviewModal({
  origem,
  nomeArquivo,
  mudancas,
  naoEncontrados,
  confirmando,
  onConfirmar,
  onCancelar,
}: ImportarRetornoPreviewModalProps) {

  // Rótulo legível da origem do arquivo, usado no título da modal
  const labelOrigem = origem === 'ret' ? 'RET (CNAB 240)' : 'XLS (Relatório BB)'

  // Não há nenhuma mudança real a aplicar — só títulos não encontrados
  // ou nenhuma linha processável no arquivo
  const semMudancas = mudancas.length === 0

  // ── Estilos compartilhados (mesmo padrão visual do ContasReceberModal) ──
  const overlayStyle: React.CSSProperties = {
    position:   'fixed', inset: 0,
    background: 'rgba(0,0,0,0.45)', zIndex: 500, // Acima do modal de detalhes (400)
    display:    'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'Tahoma, Geneva, sans-serif',
  }
  const painelStyle: React.CSSProperties = {
    background: '#ffffff', borderRadius: '8px',
    width: '640px', maxWidth: '96vw', maxHeight: '88vh',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  }
  const headerStyle: React.CSSProperties = {
    background: '#1a6094', padding: '12px 16px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  }
  const sectionTitleStyle: React.CSSProperties = {
    fontSize: '10px', fontWeight: 700, color: '#1a6094',
    textTransform: 'uppercase', letterSpacing: '0.04em',
    marginBottom: '8px', fontFamily: 'Tahoma, Geneva, sans-serif',
  }
  const btnPrimary: React.CSSProperties = {
    padding: '6px 14px', fontSize: '12px', fontWeight: 700,
    fontFamily: 'Tahoma, Geneva, sans-serif',
    background: '#1a6094', color: '#fff', border: 'none',
    borderRadius: '5px', cursor: 'pointer',
  }
  const btnOutline: React.CSSProperties = {
    ...btnPrimary, background: '#fff', color: '#3a6080', border: '1px solid #c4d8eb',
  }

  return (
    // Overlay — fecha ao clicar fora apenas se não estiver confirmando (evita fechar no meio do processamento)
    <div style={overlayStyle}>
      <div style={painelStyle}>

        {/* ── Header azul ── */}
        <div style={headerStyle}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>
            Prévia da Importação — {labelOrigem}
          </span>
          <button
            onClick={onCancelar}
            disabled={confirmando}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: confirmando ? 'not-allowed' : 'pointer', fontSize: '18px', lineHeight: 1, opacity: confirmando ? 0.5 : 1 }}
          >
            ✕
          </button>
        </div>

        {/* ── Corpo scrollável ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>

          {/* Nome do arquivo — contexto */}
          <div style={{ fontSize: '11px', color: '#5a84a6', marginBottom: '14px' }}>
            Arquivo: <strong style={{ color: '#2c4a60' }}>{nomeArquivo}</strong>
          </div>

          {/* ── Mensagem quando não há nenhuma mudança a aplicar ── */}
          {semMudancas && naoEncontrados.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: '#5a84a6', fontSize: '12px' }}>
              Nenhum registro processável foi encontrado neste arquivo.
            </div>
          )}

          {/* ── SEÇÃO: Mudanças a aplicar ── */}
          {mudancas.length > 0 && (
            <div style={{ marginBottom: '18px' }}>
              <div style={sectionTitleStyle}>
                Alterações a Aplicar ({mudancas.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {mudancas.map(item => (
                  <div
                    key={item.nossoNumero}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 10px', background: '#f7fafc', border: '1px solid #dde8f0',
                      borderRadius: '5px', fontSize: '12px',
                    }}
                  >
                    <span style={{ fontWeight: 700, color: '#1a6094' }}>
                      {item.numeroDocumento}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <StatusBadge status={item.statusAtual} />
                      <span style={{ color: '#7a9db8' }}>→</span>
                      <StatusBadge status={item.statusNovo} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── SEÇÃO: Não encontrados ── */}
          {naoEncontrados.length > 0 && (
            <div>
              <div style={sectionTitleStyle}>
                Não Encontrados no Sistema ({naoEncontrados.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {naoEncontrados.map(item => (
                  <div
                    key={item.nossoNumero}
                    style={{
                      padding: '6px 10px', background: '#fef9f5', border: '1px solid #f5dcc4',
                      borderRadius: '5px', fontSize: '11px', color: '#9a6a2d',
                    }}
                  >
                    {item.numeroDocumento !== '—' ? `${item.numeroDocumento} — ` : ''}
                    Nosso Número {item.nossoNumero} não corresponde a nenhum título cadastrado.
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: '10px 16px', borderTop: '1px solid #eef3f7',
          display: 'flex', justifyContent: 'flex-end', gap: '8px',
        }}>
          <button onClick={onCancelar} disabled={confirmando} style={{ ...btnOutline, opacity: confirmando ? 0.6 : 1 }}>
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            disabled={confirmando || semMudancas}
            title={semMudancas ? 'Não há alterações para aplicar' : undefined}
            style={{
              ...btnPrimary,
              opacity:  (confirmando || semMudancas) ? 0.6 : 1,
              cursor:   (confirmando || semMudancas) ? 'not-allowed' : 'pointer',
            }}
          >
            {confirmando ? 'Aplicando...' : `Confirmar e Aplicar (${mudancas.length})`}
          </button>
        </div>

      </div>
    </div>
  )
}

// ============================================================
// StatusBadge
// Badge pill colorido reutilizando STATUS_LABELS/STATUS_CORES —
// mesma fonte de cores usada em ContasReceberTabela.tsx, para a
// prévia exibir exatamente as mesmas cores da listagem principal
// ============================================================
function StatusBadge({ status }: { status: StatusTitulo }) {
  const cores = STATUS_CORES[status]
  const label = STATUS_LABELS[status]
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '10px',
      fontSize: '10px', fontWeight: 700,
      background: cores?.bg ?? '#f0f4f7', color: cores?.text ?? '#5a84a6',
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}
