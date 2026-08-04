// ============================================================
// components/relatorios/RelatorioUiComum.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Peças de UI reaproveitadas pelos 6 relatórios — cartão
//         de resumo, barra de filtro de período + botões de
//         exportação (com slot para filtros extras específicos de
//         cada relatório, ex: dimensão da Curva ABC, lado do
//         Extrato Consolidado), e os estilos-base (input, botão,
//         célula de tabela) usados em todas as telas.
// Conecta com: usado por todos os componentes de relatório
//              (Fases 3+) — Faturamento (Fase 2) tem sua própria
//              cópia inline, não foi retrofitado por já estar
//              validado e em produção
// ============================================================

'use client'

import type { ReactNode } from 'react'

// ============================================================
// CartaoResumoUi
// ============================================================
export function CartaoResumoUi({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div style={{ flex: '1 1 200px', background: '#eaf2f9', borderRadius: '8px', padding: '12px 14px' }}>
      <div style={{ fontSize: '10px', color: '#5a84a6', marginBottom: '4px' }}>{rotulo}</div>
      <div style={{ fontSize: '17px', fontWeight: 700, color: '#1a6094' }}>{valor}</div>
    </div>
  )
}

// ============================================================
// BarraFiltroExportar
// Data inicial/final + botão Gerar + botões de exportação PDF/Excel,
// com um slot `filtrosExtras` pros campos específicos de cada
// relatório (renderizados entre a Data final e o botão Gerar)
// ============================================================
export function BarraFiltroExportar({
  dataInicial,
  dataFinal,
  onChangeDataInicial,
  onChangeDataFinal,
  onGerar,
  onExportarPdf,
  onExportarXlsx,
  exportando,
  podeExportar,
  filtrosExtras,
}: {
  dataInicial: string
  dataFinal: string
  onChangeDataInicial: (v: string) => void
  onChangeDataFinal: (v: string) => void
  onGerar: () => void
  onExportarPdf: () => void
  onExportarXlsx: () => void
  exportando: 'pdf' | 'xlsx' | null
  podeExportar: boolean
  filtrosExtras?: ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        gap: '10px',
        marginBottom: '16px',
        padding: '12px',
        background: '#ffffff',
        border: '1px solid #dde8f0',
        borderRadius: '8px',
      }}
    >
      <div>
        <label style={estilosRelatorio.rotuloFiltro}>Data inicial</label>
        <input type="date" value={dataInicial} onChange={e => onChangeDataInicial(e.target.value)} style={estilosRelatorio.input} />
      </div>
      <div>
        <label style={estilosRelatorio.rotuloFiltro}>Data final</label>
        <input type="date" value={dataFinal} onChange={e => onChangeDataFinal(e.target.value)} style={estilosRelatorio.input} />
      </div>

      {filtrosExtras}

      <button onClick={onGerar} style={estilosRelatorio.botaoPrimario}>
        <i className="ti ti-refresh" aria-hidden="true" /> Gerar
      </button>

      <div style={{ flex: 1 }} />

      <button onClick={onExportarPdf} disabled={exportando !== null || !podeExportar} style={estilosRelatorio.botaoSecundario}>
        <i className="ti ti-file-type-pdf" aria-hidden="true" /> {exportando === 'pdf' ? 'Gerando...' : 'Exportar PDF'}
      </button>
      <button onClick={onExportarXlsx} disabled={exportando !== null || !podeExportar} style={estilosRelatorio.botaoSecundario}>
        <i className="ti ti-file-type-xls" aria-hidden="true" /> {exportando === 'xlsx' ? 'Gerando...' : 'Exportar Excel'}
      </button>
    </div>
  )
}

// ============================================================
// FaixaErro — mensagem de erro padrão (filtro inválido, falha de
// carregamento ou de exportação)
// ============================================================
export function FaixaErro({ mensagem }: { mensagem: string }) {
  return (
    <div style={{ padding: '10px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', color: '#dc2626', fontSize: '11px', marginBottom: '16px' }}>
      {mensagem}
    </div>
  )
}

// ============================================================
// AvisoDestaque — versão de TELA de desenharAvisoDestacado()
// (lib/relatorios/pdfBuilder.ts) e do parâmetro avisoExtra de
// gerarBufferExcel() (lib/relatorios/excelBuilder.ts). Cor âmbar de
// atenção, deliberadamente diferente de FaixaErro (que é vermelho de
// erro) — este componente não indica que algo deu errado, indica um
// aviso de leitura sobre um dado que está correto mas pode ser mal
// interpretado (primeiro uso: Seção 2.7, AVISO_RECEITA_DESPESA).
// Genérico — qualquer relatório futuro pode reaproveitar.
// ============================================================
export function AvisoDestaque({ mensagem }: { mensagem: string }) {
  return (
    <div style={{ padding: '10px 12px', background: '#fdf6e8', border: '1px solid #e8d5a3', borderRadius: '6px', color: '#7a5c1e', fontSize: '11px', fontStyle: 'italic', marginBottom: '16px' }}>
      {mensagem}
    </div>
  )
}

// ============================================================
// Estilos compartilhados
// ============================================================
export const estilosRelatorio = {
  rotuloFiltro: {
    display: 'block',
    fontSize: '10px',
    color: '#5a84a6',
    marginBottom: '3px',
  } as React.CSSProperties,

  input: {
    height: '28px',
    padding: '0 8px',
    fontSize: '12px',
    fontFamily: 'Tahoma, Geneva, sans-serif',
    color: '#3a6080',
    background: '#ffffff',
    border: '1px solid #dde8f0',
    borderRadius: '4px',
    outline: 'none',
  } as React.CSSProperties,

  select: {
    height: '28px',
    padding: '0 8px',
    fontSize: '12px',
    fontFamily: 'Tahoma, Geneva, sans-serif',
    color: '#3a6080',
    background: '#ffffff',
    border: '1px solid #dde8f0',
    borderRadius: '4px',
    outline: 'none',
    cursor: 'pointer',
  } as React.CSSProperties,

  botaoPrimario: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    height: '28px',
    padding: '0 12px',
    background: '#1a6094',
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '11px',
    fontFamily: 'Tahoma, Geneva, sans-serif',
    cursor: 'pointer',
  } as React.CSSProperties,

  botaoSecundario: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    height: '28px',
    padding: '0 12px',
    background: '#ffffff',
    color: '#1a6094',
    border: '1px solid #1a6094',
    borderRadius: '4px',
    fontSize: '11px',
    fontFamily: 'Tahoma, Geneva, sans-serif',
    cursor: 'pointer',
  } as React.CSSProperties,

  th: {
    padding: '8px 10px',
    fontSize: '10px',
    fontWeight: 700,
    textTransform: 'uppercase',
    textAlign: 'left',
  } as React.CSSProperties,

  td: {
    padding: '7px 10px',
    color: '#2c4a60',
  } as React.CSSProperties,
}

// ============================================================
// CabecalhoRota — botão "Voltar" + título, usado no topo de cada
// tela de relatório (app/relatorios/[slug]/page.tsx)
// ============================================================
export function CabecalhoRota({ titulo, onVoltar }: { titulo: string; onVoltar: () => void }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <button
        onClick={onVoltar}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: '#5a84a6', fontSize: '11px', fontFamily: 'Tahoma, Geneva, sans-serif', cursor: 'pointer', padding: 0, marginBottom: '8px' }}
      >
        <i className="ti ti-arrow-left" aria-hidden="true" /> Voltar para Relatórios
      </button>
      <div style={{ fontSize: '16px', fontWeight: 700, color: '#1a6094' }}>{titulo}</div>
    </div>
  )
}
