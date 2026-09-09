// ============================================================
// components/relatorios/rankingProdutos/RankingGeralSecao.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Seção 1 do relatório Ranking de Produtos (2.10) —
//         listagem de TODOS os produtos vendidos no período,
//         ordenável por Quantidade ou Valor (clique no cabeçalho,
//         local, sem refazer consulta), sem limite de linhas.
//         Período, gráfico e exportação INDEPENDENTES da Seção 2
//         (drill-down) — decisão explícita de Maycon.
// Conecta com: lib/relatorios/rankingProdutos.ts
// ============================================================

'use client'

import { useCallback, useEffect, useState } from 'react'
import { gerarRankingGeralProdutos, gerarGraficoMesAMesRankingGeral, compararPeriodosRankingGeral } from '@/lib/relatorios/rankingProdutos'
import { formatarMoeda } from '@/lib/relatorios/formatadores'
import type { RelatorioRankingGeralProdutos, DadosGrafico } from '@/types/relatorios'
import GraficoSvg from '@/components/relatorios/GraficoSvg'
import ComparacaoPeriodosProdutos from '@/components/relatorios/rankingProdutos/ComparacaoPeriodosProdutos'
import { useExportarRelatorio } from '@/components/relatorios/useExportarRelatorio'
import { BarraFiltroExportar, FaixaErro, estilosRelatorio } from '@/components/relatorios/RelatorioUiComum'

type CriterioOrdenacao = 'quantidade' | 'valor'

function datasPadraoUltimos6Meses(): { dataInicial: string; dataFinal: string } {
  const hoje = new Date()
  const dataFinal = hoje.toISOString().slice(0, 10)
  const seiseMesesAtras = new Date(hoje)
  seiseMesesAtras.setMonth(seiseMesesAtras.getMonth() - 6)
  return { dataInicial: seiseMesesAtras.toISOString().slice(0, 10), dataFinal }
}

export default function RankingGeralSecao() {
  const [filtros, setFiltros] = useState(datasPadraoUltimos6Meses())
  const [filtrosAplicados, setFiltrosAplicados] = useState(datasPadraoUltimos6Meses())
  const [relatorio, setRelatorio] = useState<RelatorioRankingGeralProdutos | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [ordenacao, setOrdenacao] = useState<{ criterio: CriterioOrdenacao; crescente: boolean }>({ criterio: 'quantidade', crescente: false })
  const [incluirGraficoExport, setIncluirGraficoExport] = useState(true)

  const [modoGrafico, setModoGrafico] = useState<'mes_a_mes' | 'comparar'>('mes_a_mes')
  const [metricaGrafico, setMetricaGrafico] = useState<'quantidade' | 'valor'>('quantidade')
  const [anoGrafico, setAnoGrafico] = useState(new Date().getFullYear())
  const [grafico, setGrafico] = useState<DadosGrafico | null>(null)

  const { exportar, exportando, erroExportacao } = useExportarRelatorio('/api/relatorios/ranking-produtos')

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      setRelatorio(await gerarRankingGeralProdutos(filtrosAplicados))
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao gerar ranking')
    } finally {
      setCarregando(false)
    }
  }, [filtrosAplicados])

  useEffect(() => { carregar() }, [carregar]) // eslint-disable-line react-hooks/set-state-in-effect

  useEffect(() => {
    gerarGraficoMesAMesRankingGeral(anoGrafico, metricaGrafico).then(setGrafico).catch(() => {})
  }, [anoGrafico, metricaGrafico])

  function ordenarPor(criterio: CriterioOrdenacao) {
    setOrdenacao(o => ({ criterio, crescente: o.criterio === criterio ? !o.crescente : false }))
  }

  const itensOrdenados = relatorio
    ? [...relatorio.itens].sort((a, b) => {
        const diff = ordenacao.criterio === 'quantidade' ? a.quantidade - b.quantidade : a.valor - b.valor
        return ordenacao.crescente ? diff : -diff
      })
    : []

  const nomeArquivo = `ranking_produtos_geral_${filtrosAplicados.dataInicial}_a_${filtrosAplicados.dataFinal}`
  const paramsExport: Record<string, string> = {
    secao: 'ranking',
    dataInicial: filtrosAplicados.dataInicial,
    dataFinal: filtrosAplicados.dataFinal,
    incluirGrafico: String(incluirGraficoExport),
    anoGrafico: String(anoGrafico),
    metricaGrafico,
  }

  function seta(criterio: CriterioOrdenacao) {
    if (ordenacao.criterio !== criterio) return ''
    return ordenacao.crescente ? ' ▲' : ' ▼'
  }

  return (
    <div>
      <BarraFiltroExportar
        dataInicial={filtros.dataInicial}
        dataFinal={filtros.dataFinal}
        onChangeDataInicial={v => setFiltros(f => ({ ...f, dataInicial: v }))}
        onChangeDataFinal={v => setFiltros(f => ({ ...f, dataFinal: v }))}
        onGerar={() => setFiltrosAplicados(filtros)}
        onExportarPdf={() => exportar('pdf', paramsExport, nomeArquivo)}
        onExportarXlsx={() => exportar('xlsx', paramsExport, nomeArquivo)}
        exportando={exportando}
        podeExportar={!!relatorio}
        opcoesExportacaoExtras={
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#5a84a6', cursor: 'pointer' }}>
            <input type="checkbox" checked={incluirGraficoExport} onChange={e => setIncluirGraficoExport(e.target.checked)} />
            Incluir gráfico
          </label>
        }
      />

      {(erro || erroExportacao) && <FaixaErro mensagem={erro || erroExportacao} />}

      {carregando ? (
        <div style={{ padding: '32px', textAlign: 'center', color: '#5a84a6', fontSize: '12px' }}>Carregando ranking...</div>
      ) : relatorio && (
        <>
          <div style={{ background: '#ffffff', border: '1px solid #dde8f0', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button onClick={() => setModoGrafico('mes_a_mes')} style={modoGrafico === 'mes_a_mes' ? estilosRelatorio.botaoPrimario : estilosRelatorio.botaoSecundario}>Mês a mês</button>
              <button onClick={() => setModoGrafico('comparar')} style={modoGrafico === 'comparar' ? estilosRelatorio.botaoPrimario : estilosRelatorio.botaoSecundario}>Comparar períodos</button>
              <div style={{ flex: 1 }} />
              <button onClick={() => setMetricaGrafico('quantidade')} style={metricaGrafico === 'quantidade' ? { ...estilosRelatorio.botaoSecundario, background: '#eaf2f9', fontWeight: 700 } : estilosRelatorio.botaoSecundario}>Quantidade</button>
              <button onClick={() => setMetricaGrafico('valor')} style={metricaGrafico === 'valor' ? { ...estilosRelatorio.botaoSecundario, background: '#eaf2f9', fontWeight: 700 } : estilosRelatorio.botaoSecundario}>Valor</button>
            </div>

            {modoGrafico === 'mes_a_mes' ? (
              <>
                <div style={{ marginBottom: '10px' }}>
                  <label style={estilosRelatorio.rotuloFiltro}>Ano</label>
                  <input type="number" value={anoGrafico} onChange={e => setAnoGrafico(Number(e.target.value) || anoGrafico)} style={{ ...estilosRelatorio.input, width: '90px' }} />
                </div>
                {grafico && <GraficoSvg dados={grafico} titulo={`${metricaGrafico === 'quantidade' ? 'Quantidade total vendida' : 'Valor total faturado'} por mês (todos os produtos) — ${anoGrafico}`} />}
              </>
            ) : (
              <ComparacaoPeriodosProdutos buscar={compararPeriodosRankingGeral} rotuloQuantidade="Quantidade vendida" />
            )}
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #dde8f0', borderRadius: '8px', overflow: 'auto', marginBottom: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ background: '#1a6094', color: '#ffffff' }}>
                  <th style={{ ...estilosRelatorio.th, width: '30px' }}></th>
                  <th style={estilosRelatorio.th}>Código</th>
                  <th style={estilosRelatorio.th}>Produto</th>
                  <th style={{ ...estilosRelatorio.th, textAlign: 'right', cursor: 'pointer' }} onClick={() => ordenarPor('quantidade')}>Quantidade vendida{seta('quantidade')}</th>
                  <th style={{ ...estilosRelatorio.th, textAlign: 'right', cursor: 'pointer' }} onClick={() => ordenarPor('valor')}>Valor faturado{seta('valor')}</th>
                </tr>
              </thead>
              <tbody>
                {itensOrdenados.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#5a84a6' }}>Nenhum produto vendido no período selecionado.</td></tr>
                ) : (
                  itensOrdenados.map((item, i) => (
                    <tr key={item.descricao} style={{ background: i % 2 !== 0 ? '#f7fafc' : '#ffffff', borderBottom: '1px solid #e8f0f7' }}>
                      <td style={estilosRelatorio.td}>{i + 1}º</td>
                      <td style={item.codigoProduto ? estilosRelatorio.td : { ...estilosRelatorio.td, color: '#5a84a6', fontStyle: 'italic' }}>{item.codigoProduto ?? '—'}</td>
                      <td style={estilosRelatorio.td}>{item.descricao}</td>
                      <td style={{ ...estilosRelatorio.td, textAlign: 'right' }}>{item.quantidade.toLocaleString('pt-BR')} un</td>
                      <td style={{ ...estilosRelatorio.td, textAlign: 'right' }}>{formatarMoeda(item.valor)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
