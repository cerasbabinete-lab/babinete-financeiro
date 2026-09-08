// ============================================================
// components/relatorios/totalizacaoDespesas/TotalizacaoDespesasRelatorio.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Tela completa do relatório "Totalização de Despesas"
//         (2.9) — relatório irmão do 2.8. Filtro de período + Tipo
//         de Fornecedor + Fornecedor, cartões de resumo, módulo de
//         gráfico sempre visível (Mês a mês / Comparar períodos,
//         escopo de data independente da tabela), tabela documento
//         a documento sem paginação.
// Conecta com: lib/relatorios/totalizacaoDespesas.ts
// Referência: mockup aprovado por Maycon (Artifact publicado na
//             conversa) — ver cabeçalho de
//             lib/relatorios/totalizacaoDespesas.ts
// ============================================================

'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  gerarRelatorioTotalizacaoDespesas,
  buscarFornecedoresParaFiltro,
  gerarGraficoMesAMesTotalizacaoDespesas,
} from '@/lib/relatorios/totalizacaoDespesas'
import { formatarMoeda, formatarDataBR } from '@/lib/relatorios/formatadores'
import type { RelatorioTotalizacaoDespesas, FornecedorOpcaoFiltro, TipoFornecedorOuNaoClassificado, DadosGrafico } from '@/types/relatorios'
import type { FornecedorCategoria } from '@/types/fornecedores'
import { listarCategorias } from '@/lib/fornecedoresService'

import GraficoSvg from '@/components/relatorios/GraficoSvg'
import DisclaimerRodape from '@/components/relatorios/DisclaimerRodape'
import ComparacaoPeriodosTotalizacaoDespesas from '@/components/relatorios/totalizacaoDespesas/ComparacaoPeriodosTotalizacaoDespesas'
import { useExportarRelatorio } from '@/components/relatorios/useExportarRelatorio'
import { CartaoResumoUi, BarraFiltroExportar, FaixaErro, estilosRelatorio } from '@/components/relatorios/RelatorioUiComum'

// Mês corrente até hoje — mesmo raciocínio do 2.8: relatório
// documento a documento, sem paginação, então o padrão "últimos 6
// meses" dos relatórios agregados traria centenas de linhas na
// primeira carga
function datasPadrao(): { dataInicial: string; dataFinal: string } {
  const hoje = new Date()
  const dataFinal = hoje.toISOString().slice(0, 10)
  const dataInicial = `${dataFinal.slice(0, 8)}01`
  return { dataInicial, dataFinal }
}

export default function TotalizacaoDespesasRelatorio() {
  const [filtros, setFiltros] = useState(datasPadrao())
  const [tipoFornecedorFiltro, setTipoFornecedorFiltro] = useState<string>('') // '' = Todos, 'nao_classificado', ou id numérico como string
  const [fornecedorId, setFornecedorId] = useState<string>('')
  const [filtrosAplicados, setFiltrosAplicados] = useState({
    ...datasPadrao(),
    tipoFornecedorFiltro: '' as string,
    fornecedorId: '',
  })

  const [relatorio, setRelatorio] = useState<RelatorioTotalizacaoDespesas | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const [fornecedores, setFornecedores] = useState<FornecedorOpcaoFiltro[]>([])
  const [categorias, setCategorias] = useState<FornecedorCategoria[]>([])
  const [incluirGraficoExport, setIncluirGraficoExport] = useState(true)

  // ── Módulo de gráfico — escopo de data independente da tabela
  // (mesma decisão explícita do 2.8). Abre em "Mês a mês", ano vigente ──
  const [modoGrafico, setModoGrafico] = useState<'mes_a_mes' | 'comparar'>('mes_a_mes')
  const [anoGrafico, setAnoGrafico] = useState(new Date().getFullYear())
  const [graficoMesAMes, setGraficoMesAMes] = useState<DadosGrafico | null>(null)

  const { exportar, exportando, erroExportacao } = useExportarRelatorio('/api/relatorios/totalizacao-despesas')

  // Converte o valor bruto do <select> (sempre string) pro tipo real
  // do filtro — mesma convenção já usada no relatório 2.6
  // (GastosPorTipoFornecedorRelatorio.tsx)
  function tipoFornecedorFiltroReal(): TipoFornecedorOuNaoClassificado | undefined {
    if (filtrosAplicados.tipoFornecedorFiltro === '') return undefined
    if (filtrosAplicados.tipoFornecedorFiltro === 'nao_classificado') return 'nao_classificado'
    return Number(filtrosAplicados.tipoFornecedorFiltro)
  }

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const r = await gerarRelatorioTotalizacaoDespesas({
        dataInicial: filtrosAplicados.dataInicial,
        dataFinal: filtrosAplicados.dataFinal,
        tipoFornecedorFiltro: tipoFornecedorFiltroReal(),
        fornecedorId: filtrosAplicados.fornecedorId ? Number(filtrosAplicados.fornecedorId) : undefined,
      })
      setRelatorio(r)
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao gerar relatório')
    } finally {
      setCarregando(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtrosAplicados])

  useEffect(() => { carregar() }, [carregar]) // eslint-disable-line react-hooks/set-state-in-effect

  useEffect(() => {
    buscarFornecedoresParaFiltro().then(setFornecedores).catch(() => {}) // dropdown — falha aqui não deve travar o resto da tela
  }, [])

  // Categorias dinâmicas pro filtro — mesmo padrão do 2.6
  // (GastosPorTipoFornecedorRelatorio.tsx): buscadas uma vez ao
  // montar a tela, não durante a vida da tela
  useEffect(() => {
    listarCategorias()
      .then(lista => setCategorias(lista))
      .catch((err: unknown) => {
        console.error('[TotalizacaoDespesasRelatorio] listarCategorias error:', err)
      })
  }, [])

  useEffect(() => {
    gerarGraficoMesAMesTotalizacaoDespesas(anoGrafico).then(setGraficoMesAMes).catch(() => {})
  }, [anoGrafico])

  const nomeArquivo = `totalizacao_despesas_${filtrosAplicados.dataInicial}_a_${filtrosAplicados.dataFinal}`
  const paramsExport: Record<string, string> = {
    dataInicial: filtrosAplicados.dataInicial,
    dataFinal: filtrosAplicados.dataFinal,
    incluirGrafico: String(incluirGraficoExport),
    anoGrafico: String(anoGrafico),
    ...(filtrosAplicados.tipoFornecedorFiltro ? { tipoFornecedorFiltro: filtrosAplicados.tipoFornecedorFiltro } : {}),
    ...(filtrosAplicados.fornecedorId ? { fornecedorId: filtrosAplicados.fornecedorId } : {}),
  }

  return (
    <div style={{ fontFamily: 'Tahoma, Geneva, sans-serif' }}>
      <BarraFiltroExportar
        dataInicial={filtros.dataInicial}
        dataFinal={filtros.dataFinal}
        onChangeDataInicial={v => setFiltros(f => ({ ...f, dataInicial: v }))}
        onChangeDataFinal={v => setFiltros(f => ({ ...f, dataFinal: v }))}
        onGerar={() => setFiltrosAplicados({ ...filtros, tipoFornecedorFiltro, fornecedorId })}
        onExportarPdf={() => exportar('pdf', paramsExport, nomeArquivo)}
        onExportarXlsx={() => exportar('xlsx', paramsExport, nomeArquivo)}
        exportando={exportando}
        podeExportar={!!relatorio}
        filtrosExtras={
          <>
            <div>
              <label style={estilosRelatorio.rotuloFiltro}>Tipo de Fornecedor</label>
              {/* Ordem de relatório (Todos → categorias → Não
                  classificado por último) — diferente da tela de
                  Fornecedores (Não classificado primeiro), que é
                  outro contexto (atribuir categoria a 1 fornecedor).
                  Mesmo padrão já em produção no relatório 2.6 */}
              <select value={tipoFornecedorFiltro} onChange={e => setTipoFornecedorFiltro(e.target.value)} style={estilosRelatorio.select}>
                <option value="">Todos</option>
                {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                <option value="nao_classificado">Não classificado</option>
              </select>
            </div>
            <div>
              <label style={estilosRelatorio.rotuloFiltro}>Fornecedor</label>
              <select value={fornecedorId} onChange={e => setFornecedorId(e.target.value)} style={estilosRelatorio.select}>
                <option value="">Todos</option>
                {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
          </>
        }
        opcoesExportacaoExtras={
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#5a84a6', cursor: 'pointer' }}>
            <input type="checkbox" checked={incluirGraficoExport} onChange={e => setIncluirGraficoExport(e.target.checked)} />
            Incluir gráfico
          </label>
        }
      />

      {(erro || erroExportacao) && <FaixaErro mensagem={erro || erroExportacao} />}

      {carregando ? (
        <div style={{ padding: '32px', textAlign: 'center', color: '#5a84a6', fontSize: '12px' }}>Carregando relatório...</div>
      ) : relatorio && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
            <CartaoResumoUi rotulo="Total de despesas" valor={String(relatorio.totalDespesas)} />
            <CartaoResumoUi rotulo="Valor total" valor={formatarMoeda(relatorio.valorTotal)} />
          </div>

          {/* Módulo de gráfico — sempre visível, escopo de data
              independente do filtro da tabela acima (mesma decisão
              explícita do 2.8) */}
          <div style={{ background: '#ffffff', border: '1px solid #dde8f0', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
              <button
                onClick={() => setModoGrafico('mes_a_mes')}
                style={modoGrafico === 'mes_a_mes' ? estilosRelatorio.botaoPrimario : estilosRelatorio.botaoSecundario}
              >
                Mês a mês
              </button>
              <button
                onClick={() => setModoGrafico('comparar')}
                style={modoGrafico === 'comparar' ? estilosRelatorio.botaoPrimario : estilosRelatorio.botaoSecundario}
              >
                Comparar períodos
              </button>
            </div>

            {modoGrafico === 'mes_a_mes' ? (
              <>
                <div style={{ marginBottom: '10px' }}>
                  <label style={estilosRelatorio.rotuloFiltro}>Ano</label>
                  <input
                    type="number"
                    value={anoGrafico}
                    onChange={e => setAnoGrafico(Number(e.target.value) || anoGrafico)}
                    style={{ ...estilosRelatorio.input, width: '90px' }}
                  />
                </div>
                {graficoMesAMes && <GraficoSvg dados={graficoMesAMes} titulo={`Valor total por mês — ${anoGrafico}`} />}
              </>
            ) : (
              <ComparacaoPeriodosTotalizacaoDespesas />
            )}
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #dde8f0', borderRadius: '8px', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ background: '#1a6094', color: '#ffffff' }}>
                  <th style={estilosRelatorio.th}>Documento</th>
                  <th style={estilosRelatorio.th}>Emissão</th>
                  <th style={estilosRelatorio.th}>Vencimento</th>
                  <th style={estilosRelatorio.th}>Tipo de Fornecedor</th>
                  <th style={estilosRelatorio.th}>Cód.</th>
                  <th style={estilosRelatorio.th}>Favorecido</th>
                  <th style={{ ...estilosRelatorio.th, textAlign: 'right' }}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {relatorio.itens.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: '#5a84a6' }}>Nenhuma despesa no período selecionado.</td></tr>
                ) : (
                  relatorio.itens.map((item, i) => (
                    <tr key={`${item.fornecedorId}-${item.documentoNumero}-${item.dataEmissao}-${i}`} style={{ background: i % 2 !== 0 ? '#f7fafc' : '#ffffff', borderBottom: '1px solid #e8f0f7' }}>
                      <td style={estilosRelatorio.td}>{item.documentoNumero ?? '—'}</td>
                      <td style={estilosRelatorio.td}>{formatarDataBR(item.dataEmissao)}</td>
                      <td style={estilosRelatorio.td}>{item.vencimento ? formatarDataBR(item.vencimento) : '—'}</td>
                      <td style={item.tipoFornecedor === 'nao_classificado' ? { ...estilosRelatorio.td, color: '#5a84a6', fontStyle: 'italic' } : estilosRelatorio.td}>{item.tipoFornecedorRotulo}</td>
                      <td style={estilosRelatorio.td}>{item.fornecedorId}</td>
                      <td style={estilosRelatorio.td}>{item.favorecidoNome}</td>
                      <td style={{ ...estilosRelatorio.td, textAlign: 'right' }}>{formatarMoeda(item.valor)}</td>
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
