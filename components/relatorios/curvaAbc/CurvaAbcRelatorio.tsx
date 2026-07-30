// ============================================================
// components/relatorios/curvaAbc/CurvaAbcRelatorio.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Tela completa do relatório 2.5 (Curva ABC) — seletor de
//         dimensão (clientes/fornecedores/produtos), gráfico de
//         Pareto, tabela com classe A/B/C, coluna de prazo médio
//         de pagamento exclusiva de Fornecedores, e drill-down
//         mensal exclusivo de Produtos (clique numa linha).
// Conecta com: lib/relatorios/curvaAbc.ts
// Referência: Especificacao_Modulo_Relatorios.md, Seção 2.5
// ============================================================

'use client'

import { useCallback, useEffect, useState, Fragment } from 'react'
import { gerarRelatorioCurvaAbc, buscarDrillDownProduto } from '@/lib/relatorios/curvaAbc'
import { formatarMoeda, formatarMesBR } from '@/lib/relatorios/formatadores'
import type { RelatorioCurvaAbc, DrillDownProdutoAbc, DimensaoAbc, ClasseAbc } from '@/types/relatorios'

import GraficoSvg from '@/components/relatorios/GraficoSvg'
import DisclaimerRodape from '@/components/relatorios/DisclaimerRodape'
import { useExportarRelatorio } from '@/components/relatorios/useExportarRelatorio'
import { CartaoResumoUi, BarraFiltroExportar, FaixaErro, estilosRelatorio } from '@/components/relatorios/RelatorioUiComum'

function datasPadrao(): { dataInicial: string; dataFinal: string } {
  const hoje = new Date()
  const dataFinal = hoje.toISOString().slice(0, 10)
  const seisMesesAtras = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1)
  const dataInicial = seisMesesAtras.toISOString().slice(0, 10)
  return { dataInicial, dataFinal }
}

const COR_CLASSE: Record<ClasseAbc, string> = { A: '#1a6094', B: '#378ADD', C: '#a8c9de' }

export default function CurvaAbcRelatorio() {
  const [filtros, setFiltros] = useState({ ...datasPadrao(), dimensao: 'clientes' as DimensaoAbc })
  const [filtrosAplicados, setFiltrosAplicados] = useState(filtros)
  const [relatorio, setRelatorio] = useState<RelatorioCurvaAbc | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const [produtoSelecionado, setProdutoSelecionado] = useState<string | null>(null)
  const [drillDown, setDrillDown] = useState<DrillDownProdutoAbc | null>(null)
  const [carregandoDrillDown, setCarregandoDrillDown] = useState(false)

  const { exportar, exportando, erroExportacao } = useExportarRelatorio('/api/relatorios/curva-abc')

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    setProdutoSelecionado(null)
    setDrillDown(null)
    try {
      const r = await gerarRelatorioCurvaAbc(filtrosAplicados.dimensao, filtrosAplicados)
      setRelatorio(r)
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao gerar relatório')
    } finally {
      setCarregando(false)
    }
  }, [filtrosAplicados])

  useEffect(() => { carregar() }, [carregar]) // eslint-disable-line react-hooks/set-state-in-effect

  async function handleClicarLinha(nome: string) {
    if (filtrosAplicados.dimensao !== 'produtos') return
    if (produtoSelecionado === nome) {
      setProdutoSelecionado(null)
      setDrillDown(null)
      return
    }
    setProdutoSelecionado(nome)
    setCarregandoDrillDown(true)
    try {
      const dd = await buscarDrillDownProduto(nome, filtrosAplicados)
      setDrillDown(dd)
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao buscar evolução do produto')
    } finally {
      setCarregandoDrillDown(false)
    }
  }

  const nomeArquivo = `curva_abc_${filtrosAplicados.dimensao}_${filtrosAplicados.dataInicial}_a_${filtrosAplicados.dataFinal}`
  const paramsExport: Record<string, string> = { dataInicial: filtrosAplicados.dataInicial, dataFinal: filtrosAplicados.dataFinal, dimensao: filtrosAplicados.dimensao }

  return (
    <div style={{ fontFamily: 'Tahoma, Geneva, sans-serif' }}>
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
        filtrosExtras={
          <div>
            <label style={estilosRelatorio.rotuloFiltro}>Dimensão</label>
            <select value={filtros.dimensao} onChange={e => setFiltros(f => ({ ...f, dimensao: e.target.value as DimensaoAbc }))} style={estilosRelatorio.select}>
              <option value="clientes">Clientes</option>
              <option value="fornecedores">Fornecedores</option>
              <option value="produtos">Produtos</option>
            </select>
          </div>
        }
      />

      {(erro || erroExportacao) && <FaixaErro mensagem={erro || erroExportacao} />}

      {carregando ? (
        <div style={{ padding: '32px', textAlign: 'center', color: '#5a84a6', fontSize: '12px' }}>Carregando relatório...</div>
      ) : relatorio && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
            <CartaoResumoUi rotulo="Total do período" valor={formatarMoeda(relatorio.totalPeriodo)} />
            <CartaoResumoUi rotulo="Itens" valor={String(relatorio.itens.length)} />
            <CartaoResumoUi rotulo="Classe A" valor={String(relatorio.itens.filter(i => i.classe === 'A').length)} />
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #dde8f0', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
            <GraficoSvg dados={relatorio.grafico} titulo="Curva de Pareto" altura={280} />
          </div>

          {relatorio.dimensao === 'produtos' && (
            <div style={{ fontSize: '10px', color: '#5a84a6', marginBottom: '8px' }}>
              <i className="ti ti-info-circle" aria-hidden="true" /> Clique num produto para ver a evolução mensal.
            </div>
          )}

          <div style={{ background: '#ffffff', border: '1px solid #dde8f0', borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ background: '#1a6094', color: '#ffffff' }}>
                  <th style={estilosRelatorio.th}>Nome</th>
                  <th style={{ ...estilosRelatorio.th, textAlign: 'right' }}>Valor</th>
                  <th style={{ ...estilosRelatorio.th, textAlign: 'right' }}>% Ind.</th>
                  <th style={{ ...estilosRelatorio.th, textAlign: 'right' }}>% Acum.</th>
                  <th style={{ ...estilosRelatorio.th, textAlign: 'center' }}>Classe</th>
                  {relatorio.dimensao === 'fornecedores' && <th style={{ ...estilosRelatorio.th, textAlign: 'right' }}>Prazo médio</th>}
                </tr>
              </thead>
              <tbody>
                {relatorio.itens.length === 0 ? (
                  <tr><td colSpan={relatorio.dimensao === 'fornecedores' ? 6 : 5} style={{ padding: '24px', textAlign: 'center', color: '#5a84a6' }}>Nenhum item no período selecionado.</td></tr>
                ) : (
                  relatorio.itens.map((item, i) => (
                    <Fragment key={item.nome + i}>
                      <tr
                        onClick={() => handleClicarLinha(item.nome)}
                        style={{
                          background: produtoSelecionado === item.nome ? '#eaf2f9' : i % 2 !== 0 ? '#f7fafc' : '#ffffff',
                          borderBottom: '1px solid #e8f0f7',
                          cursor: relatorio.dimensao === 'produtos' ? 'pointer' : 'default',
                        }}
                      >
                        <td style={estilosRelatorio.td}>{item.nome}</td>
                        <td style={{ ...estilosRelatorio.td, textAlign: 'right' }}>{formatarMoeda(item.valor)}</td>
                        <td style={{ ...estilosRelatorio.td, textAlign: 'right' }}>{item.percentualIndividual.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</td>
                        <td style={{ ...estilosRelatorio.td, textAlign: 'right' }}>{item.percentualAcumulado.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</td>
                        <td style={{ ...estilosRelatorio.td, textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '10px', background: COR_CLASSE[item.classe], color: '#ffffff', fontSize: '10px', fontWeight: 700 }}>
                            {item.classe}
                          </span>
                        </td>
                        {relatorio.dimensao === 'fornecedores' && (
                          <td style={{ ...estilosRelatorio.td, textAlign: 'right' }}>
                            {item.prazoMedioPagamentoDias !== undefined ? `${item.prazoMedioPagamentoDias} dias` : '—'}
                          </td>
                        )}
                      </tr>
                      {produtoSelecionado === item.nome && (
                        <tr>
                          <td colSpan={5} style={{ padding: '14px', background: '#f7fafc' }}>
                            {carregandoDrillDown ? (
                              <div style={{ color: '#5a84a6', fontSize: '11px' }}>Carregando evolução...</div>
                            ) : drillDown && drillDown.evolucao.length > 0 ? (
                              <GraficoSvg
                                dados={{ tipo: 'linha', pontos: drillDown.evolucao.map(e => ({ rotulo: formatarMesBR(e.mes), valor: e.valor })) }}
                                titulo={`Evolução mensal — ${item.nome}`}
                                altura={180}
                              />
                            ) : (
                              <div style={{ color: '#5a84a6', fontSize: '11px' }}>Sem dados de evolução para este produto.</div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
