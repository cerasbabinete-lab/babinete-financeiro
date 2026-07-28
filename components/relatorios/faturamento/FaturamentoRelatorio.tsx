// ============================================================
// components/relatorios/faturamento/FaturamentoRelatorio.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Tela completa do relatório 2.1 (Faturamento por período) —
//         filtro de intervalo de datas, cartões de resumo, gráfico
//         de evolução mensal, tabela detalhada e exportação PDF/Excel.
//         Busca os dados direto via gerarRelatorioFaturamento() com
//         o client do browser (mesma convenção de leitura simples
//         usada em todos os outros módulos) — só a exportação PDF/
//         Excel passa pela rota de API (pages/api/relatorios/
//         faturamento.ts), porque precisa ser montada no servidor.
// Conecta com: lib/relatorios/faturamento.ts, lib/relatorios/
//              formatadores.ts, components/relatorios/GraficoSvg.tsx,
//              components/relatorios/DisclaimerRodape.tsx,
//              app/relatorios/faturamento/page.tsx
// Referência: Especificacao_Modulo_Relatorios.md, Seção 2.1
// ============================================================

'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { gerarRelatorioFaturamento } from '@/lib/relatorios/faturamento'
import { formatarMoeda, formatarMesBR } from '@/lib/relatorios/formatadores'
import type { RelatorioFaturamento } from '@/types/relatorios'

import GraficoSvg from '@/components/relatorios/GraficoSvg'
import DisclaimerRodape from '@/components/relatorios/DisclaimerRodape'

// ============================================================
// datasPadrao()
// Default de tela: últimos 6 meses até hoje — não há recomendação
// da spec sobre o intervalo inicial, escolha de UX razoável;
// usuário ajusta livremente depois
// ============================================================
function datasPadrao(): { dataInicial: string; dataFinal: string } {
  const hoje = new Date()
  const dataFinal = hoje.toISOString().slice(0, 10)
  const seisMesesAtras = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1)
  const dataInicial = seisMesesAtras.toISOString().slice(0, 10)
  return { dataInicial, dataFinal }
}

// ============================================================
// FaturamentoRelatorio
// ============================================================
export default function FaturamentoRelatorio() {
  const [filtros, setFiltros] = useState(datasPadrao())
  const [filtrosAplicados, setFiltrosAplicados] = useState(filtros)
  const [relatorio, setRelatorio] = useState<RelatorioFaturamento | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [exportando, setExportando] = useState<'pdf' | 'xlsx' | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const r = await gerarRelatorioFaturamento(filtrosAplicados)
      setRelatorio(r)
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao gerar relatório')
    } finally {
      setCarregando(false)
    }
  }, [filtrosAplicados])

  useEffect(() => { carregar() }, [carregar]) // eslint-disable-line react-hooks/set-state-in-effect

  function handleGerar() {
    setFiltrosAplicados(filtros)
  }

  // ============================================================
  // handleExportar
  // Busca o PDF/Excel via fetch autenticado (Bearer token da sessão
  // atual) e força o download/abertura no browser — mesmo padrão de
  // blob + URL.createObjectURL já usado em ReceitasModal.tsx (DANFE)
  // ============================================================
  async function handleExportar(formato: 'pdf' | 'xlsx') {
    setExportando(formato)
    setErro('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Sessão expirada — faça login novamente.')

      const params = new URLSearchParams({
        dataInicial: filtrosAplicados.dataInicial,
        dataFinal: filtrosAplicados.dataFinal,
        formato,
      })
      const res = await fetch(`/api/relatorios/faturamento?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        const corpo = await res.json().catch(() => ({}))
        throw new Error(corpo.erro ?? 'Erro ao exportar relatório')
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const nomeArquivo = `faturamento_${filtrosAplicados.dataInicial}_a_${filtrosAplicados.dataFinal}.${formato}`

      if (formato === 'pdf') {
        window.open(url, '_blank')
      } else {
        const a = document.createElement('a')
        a.href = url
        a.download = nomeArquivo
        document.body.appendChild(a)
        a.click()
        a.remove()
      }
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao exportar relatório')
    } finally {
      setExportando(null)
    }
  }

  return (
    <div style={{ fontFamily: 'Tahoma, Geneva, sans-serif' }}>

      {/* Filtro de período + exportação */}
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
          <label style={rotuloFiltroStyle}>Data inicial</label>
          <input
            type="date"
            value={filtros.dataInicial}
            onChange={e => setFiltros(f => ({ ...f, dataInicial: e.target.value }))}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={rotuloFiltroStyle}>Data final</label>
          <input
            type="date"
            value={filtros.dataFinal}
            onChange={e => setFiltros(f => ({ ...f, dataFinal: e.target.value }))}
            style={inputStyle}
          />
        </div>
        <button onClick={handleGerar} style={botaoPrimarioStyle}>
          <i className="ti ti-refresh" aria-hidden="true" /> Gerar
        </button>

        <div style={{ flex: 1 }} />

        <button onClick={() => handleExportar('pdf')} disabled={exportando !== null || !relatorio} style={botaoSecundarioStyle}>
          <i className="ti ti-file-type-pdf" aria-hidden="true" /> {exportando === 'pdf' ? 'Gerando...' : 'Exportar PDF'}
        </button>
        <button onClick={() => handleExportar('xlsx')} disabled={exportando !== null || !relatorio} style={botaoSecundarioStyle}>
          <i className="ti ti-file-type-xls" aria-hidden="true" /> {exportando === 'xlsx' ? 'Gerando...' : 'Exportar Excel'}
        </button>
      </div>

      {erro && (
        <div style={{ padding: '10px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', color: '#dc2626', fontSize: '11px', marginBottom: '16px' }}>
          {erro}
        </div>
      )}

      {carregando ? (
        <div style={{ padding: '32px', textAlign: 'center', color: '#5a84a6', fontSize: '12px' }}>
          Carregando relatório...
        </div>
      ) : relatorio && (
        <>
          {/* Cartões de resumo */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
            <CartaoResumoUi rotulo="Receita bruta" valor={formatarMoeda(relatorio.totalizador.receitaBruta)} />
            <CartaoResumoUi rotulo="Ticket médio" valor={formatarMoeda(relatorio.totalizador.ticketMedio)} />
            <CartaoResumoUi rotulo="Clientes novos" valor={relatorio.totalizador.clientesNovosTotal.toLocaleString('pt-BR')} />
            <CartaoResumoUi rotulo="Clientes recorrentes" valor={relatorio.totalizador.clientesRecorrentesTotal.toLocaleString('pt-BR')} />
          </div>

          {/* Gráfico */}
          <div style={{ background: '#ffffff', border: '1px solid #dde8f0', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
            <GraficoSvg dados={relatorio.grafico} titulo="Evolução mensal da receita bruta" />
          </div>

          {/* Tabela detalhada */}
          <div style={{ background: '#ffffff', border: '1px solid #dde8f0', borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ background: '#1a6094', color: '#ffffff' }}>
                  <th style={thStyle}>Mês</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Receita bruta</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Notas</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Ticket médio</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Novos</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Recorrentes</th>
                </tr>
              </thead>
              <tbody>
                {relatorio.meses.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#5a84a6' }}>
                      Nenhuma receita no período selecionado.
                    </td>
                  </tr>
                ) : (
                  relatorio.meses.map((m, i) => (
                    <tr key={m.mes} style={{ background: i % 2 !== 0 ? '#f7fafc' : '#ffffff', borderBottom: '1px solid #e8f0f7' }}>
                      <td style={tdStyle}>{formatarMesBR(m.mes)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{formatarMoeda(m.receitaBruta)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{m.quantidadeNotas}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{formatarMoeda(m.ticketMedio)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{m.clientesNovos}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{m.clientesRecorrentes}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <DisclaimerRodape />
        </>
      )}
    </div>
  )
}

// ============================================================
// CartaoResumoUi — pequeno subcomponente visual, específico desta
// tela (a versão PDF equivalente é desenharCartoesResumo, em
// lib/relatorios/pdfBuilder.ts — mesma informação, tecnologias diferentes)
// ============================================================
function CartaoResumoUi({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div style={{ flex: '1 1 200px', background: '#eaf2f9', borderRadius: '8px', padding: '12px 14px' }}>
      <div style={{ fontSize: '10px', color: '#5a84a6', marginBottom: '4px' }}>{rotulo}</div>
      <div style={{ fontSize: '17px', fontWeight: 700, color: '#1a6094' }}>{valor}</div>
    </div>
  )
}

// ============================================================
// Estilos auxiliares
// ============================================================
const rotuloFiltroStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '10px',
  color: '#5a84a6',
  marginBottom: '3px',
}

const inputStyle: React.CSSProperties = {
  height: '28px',
  padding: '0 8px',
  fontSize: '12px',
  fontFamily: 'Tahoma, Geneva, sans-serif',
  color: '#3a6080',
  background: '#ffffff',
  border: '1px solid #dde8f0',
  borderRadius: '4px',
  outline: 'none',
}

const botaoPrimarioStyle: React.CSSProperties = {
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
}

const botaoSecundarioStyle: React.CSSProperties = {
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
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: '10px',
  fontWeight: 700,
  textTransform: 'uppercase',
  textAlign: 'left',
}

const tdStyle: React.CSSProperties = {
  padding: '7px 10px',
  color: '#2c4a60',
}
