// ============================================================
// components/relatorios/rankingProdutos/DrillDownProdutoSecao.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Seção 2 do relatório Ranking de Produtos (2.10) — busca
//         manual de 1 produto (NÃO se comunica com o ranking da
//         Seção 1 — decisão explícita), quebra de quem comprou por
//         cliente. Período, gráfico e exportação INDEPENDENTES da
//         Seção 1.
// Conecta com: lib/relatorios/rankingProdutos.ts
// ============================================================

'use client'

import { useCallback, useEffect, useState, Fragment } from 'react'
import {
  buscarProdutosParaBusca,
  gerarDrillDownProdutoRanking,
  gerarGraficoMesAMesProduto,
  compararPeriodosProduto,
} from '@/lib/relatorios/rankingProdutos'
import { formatarMoeda } from '@/lib/relatorios/formatadores'
import type { RelatorioDrillDownProdutoRanking, ProdutoOpcaoFiltro, DadosGrafico, FiltroIntervaloDatas } from '@/types/relatorios'
import GraficoSvg from '@/components/relatorios/GraficoSvg'
import ComparacaoPeriodosProdutos from '@/components/relatorios/rankingProdutos/ComparacaoPeriodosProdutos'
import { useExportarRelatorio } from '@/components/relatorios/useExportarRelatorio'
import { CartaoResumoUi, BarraFiltroExportar, FaixaErro, estilosRelatorio } from '@/components/relatorios/RelatorioUiComum'

function datasPadraoUltimos6Meses(): { dataInicial: string; dataFinal: string } {
  const hoje = new Date()
  const dataFinal = hoje.toISOString().slice(0, 10)
  const seiseMesesAtras = new Date(hoje)
  seiseMesesAtras.setMonth(seiseMesesAtras.getMonth() - 6)
  return { dataInicial: seiseMesesAtras.toISOString().slice(0, 10), dataFinal }
}

export default function DrillDownProdutoSecao() {
  const [produtos, setProdutos] = useState<ProdutoOpcaoFiltro[]>([])
  const [produtoBusca, setProdutoBusca] = useState('')
  const [filtros, setFiltros] = useState(datasPadraoUltimos6Meses())

  // Só existe filtro "aplicado" depois do 1º clique em Gerar — sem
  // produto selecionado não há o que gerar (diferente das outras
  // seções/relatórios, que já carregam com o padrão ao montar)
  const [filtrosAplicados, setFiltrosAplicados] = useState<(FiltroIntervaloDatas & { descricaoProduto: string }) | null>(null)

  const [relatorio, setRelatorio] = useState<RelatorioDrillDownProdutoRanking | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [incluirGraficoExport, setIncluirGraficoExport] = useState(true)

  const [modoGrafico, setModoGrafico] = useState<'mes_a_mes' | 'comparar'>('mes_a_mes')
  const [metricaGrafico, setMetricaGrafico] = useState<'quantidade' | 'valor'>('quantidade')
  const [anoGrafico, setAnoGrafico] = useState(new Date().getFullYear())
  const [grafico, setGrafico] = useState<DadosGrafico | null>(null)

  const { exportar, exportando, erroExportacao } = useExportarRelatorio('/api/relatorios/ranking-produtos')

  useEffect(() => {
    buscarProdutosParaBusca().then(setProdutos).catch(() => {}) // busca — falha aqui não deve travar o resto da tela
  }, [])

  const carregar = useCallback(async () => {
    if (!filtrosAplicados) return
    setCarregando(true)
    setErro('')
    try {
      setRelatorio(await gerarDrillDownProdutoRanking(filtrosAplicados))
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao gerar drill-down')
    } finally {
      setCarregando(false)
    }
  }, [filtrosAplicados])

  useEffect(() => { carregar() }, [carregar]) // eslint-disable-line react-hooks/set-state-in-effect

  useEffect(() => {
    // relatorio.descricaoResolvida, não filtrosAplicados.descricaoProduto
    // — gerarGraficoMesAMesProduto reaproveita buscarDrillDownProduto()
    // do Curva ABC, que só casa descricao exata (não código). Se o termo
    // digitado era um código, o gráfico ficaria vazio mesmo com a tabela
    // certa. Por isso este efeito depende de `relatorio` (só populado
    // depois que a busca principal resolve o nome real), não de
    // filtrosAplicados diretamente
    if (!relatorio) return
    gerarGraficoMesAMesProduto(relatorio.descricaoResolvida, anoGrafico, metricaGrafico).then(setGrafico).catch(() => {})
  }, [relatorio, anoGrafico, metricaGrafico])

  function gerar() {
    if (!produtoBusca.trim()) { setErro('Escolha um produto pra buscar.'); return }
    setFiltrosAplicados({ ...filtros, descricaoProduto: produtoBusca.trim() })
  }

  const nomeArquivo = filtrosAplicados ? `ranking_produtos_drilldown_${filtrosAplicados.descricaoProduto.replace(/\s+/g, '_')}_${filtrosAplicados.dataInicial}_a_${filtrosAplicados.dataFinal}` : 'ranking_produtos_drilldown'
  const paramsExport: Record<string, string> = filtrosAplicados ? {
    secao: 'drilldown',
    descricaoProduto: filtrosAplicados.descricaoProduto,
    dataInicial: filtrosAplicados.dataInicial,
    dataFinal: filtrosAplicados.dataFinal,
    incluirGrafico: String(incluirGraficoExport),
    anoGrafico: String(anoGrafico),
    metricaGrafico,
  } : {}

  return (
    <div>
      <div style={{ marginBottom: '4px', fontSize: '10px', color: '#5a84a6' }}>
        {relatorio && <span style={{ background: '#eaf2f9', padding: '3px 9px', borderRadius: '10px' }}>Código: {relatorio.codigoProduto ?? '—'}</span>}
      </div>

      <BarraFiltroExportar
        dataInicial={filtros.dataInicial}
        dataFinal={filtros.dataFinal}
        onChangeDataInicial={v => setFiltros(f => ({ ...f, dataInicial: v }))}
        onChangeDataFinal={v => setFiltros(f => ({ ...f, dataFinal: v }))}
        onGerar={gerar}
        onExportarPdf={() => exportar('pdf', paramsExport, nomeArquivo)}
        onExportarXlsx={() => exportar('xlsx', paramsExport, nomeArquivo)}
        exportando={exportando}
        podeExportar={!!relatorio}
        filtrosExtras={
          <div>
            <label style={estilosRelatorio.rotuloFiltro}>Produto</label>
            <input
              type="text"
              list="lista-produtos-ranking"
              value={produtoBusca}
              onChange={e => setProdutoBusca(e.target.value)}
              placeholder="Buscar produto..."
              style={{ ...estilosRelatorio.input, minWidth: '220px' }}
            />
            <datalist id="lista-produtos-ranking">
              {produtos.map(p => (
                <Fragment key={p.descricao}>
                  <option value={p.descricao} />
                  {p.codigoProduto && <option value={p.codigoProduto} />}
                </Fragment>
              ))}
            </datalist>
          </div>
        }
        opcoesExportacaoExtras={
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#5a84a6', cursor: 'pointer' }}>
            <input type="checkbox" checked={incluirGraficoExport} onChange={e => setIncluirGraficoExport(e.target.checked)} />
            Incluir gráfico
          </label>
        }
      />

      {(erro || erroExportacao) && <FaixaErro mensagem={erro || erroExportacao} />}

      {!filtrosAplicados && !carregando && (
        <div style={{ padding: '32px', textAlign: 'center', color: '#5a84a6', fontSize: '12px' }}>Busque um produto e clique em Gerar pra ver quem comprou.</div>
      )}

      {carregando ? (
        <div style={{ padding: '32px', textAlign: 'center', color: '#5a84a6', fontSize: '12px' }}>Carregando...</div>
      ) : relatorio && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
            <CartaoResumoUi rotulo={`Quantidade total — ${relatorio.descricaoResolvida}`} valor={`${relatorio.quantidadeTotal.toLocaleString('pt-BR')} un`} />
            <CartaoResumoUi rotulo="Valor total" valor={formatarMoeda(relatorio.valorTotal)} />
            <CartaoResumoUi rotulo="Clientes distintos" valor={String(relatorio.clientesDistintos)} />
          </div>

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
                {grafico && <GraficoSvg dados={grafico} titulo={`${metricaGrafico === 'quantidade' ? 'Quantidade vendida' : 'Valor faturado'} por mês — ${relatorio.descricaoResolvida} — ${anoGrafico}`} />}
              </>
            ) : (
              <ComparacaoPeriodosProdutos
                buscar={(pA, pB) => compararPeriodosProduto(relatorio.filtros.descricaoProduto, pA, pB)}
                rotuloQuantidade="Quantidade vendida"
              />
            )}
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #dde8f0', borderRadius: '8px', overflow: 'auto', marginBottom: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ background: '#1a6094', color: '#ffffff' }}>
                  <th style={estilosRelatorio.th}>Cliente</th>
                  <th style={{ ...estilosRelatorio.th, textAlign: 'right' }}>Quantidade</th>
                  <th style={{ ...estilosRelatorio.th, textAlign: 'right' }}>Valor total</th>
                  <th style={{ ...estilosRelatorio.th, textAlign: 'right' }}>Nº de notas</th>
                </tr>
              </thead>
              <tbody>
                {relatorio.itens.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: '#5a84a6' }}>Nenhuma venda desse produto no período selecionado.</td></tr>
                ) : (
                  relatorio.itens.map((item, i) => (
                    <tr key={item.clienteId ?? item.clienteNome} style={{ background: i % 2 !== 0 ? '#f7fafc' : '#ffffff', borderBottom: '1px solid #e8f0f7' }}>
                      <td style={estilosRelatorio.td}>{item.clienteNome}</td>
                      <td style={{ ...estilosRelatorio.td, textAlign: 'right' }}>{item.quantidade.toLocaleString('pt-BR')} un</td>
                      <td style={{ ...estilosRelatorio.td, textAlign: 'right' }}>{formatarMoeda(item.valor)}</td>
                      <td style={{ ...estilosRelatorio.td, textAlign: 'right' }}>{item.numeroNotas}</td>
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
