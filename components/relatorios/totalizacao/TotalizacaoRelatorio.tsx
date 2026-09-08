// ============================================================
// components/relatorios/totalizacao/TotalizacaoRelatorio.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Tela completa do relatório "Totalização" (2.8) — filtro
//         de período + CFOP + cliente, cartões de resumo, módulo de
//         gráfico sempre visível (Mês a mês / Comparar períodos,
//         escopo de data independente da tabela), tabela nota a
//         nota sem paginação.
// Conecta com: lib/relatorios/totalizacao.ts
// Referência: decisões registradas em chat — ver cabeçalho de
//             lib/relatorios/totalizacao.ts
// ============================================================

'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  gerarRelatorioTotalizacao,
  buscarClientesParaFiltro,
  gerarGraficoMesAMesTotalizacao,
} from '@/lib/relatorios/totalizacao'
import { formatarMoeda, formatarDataBR } from '@/lib/relatorios/formatadores'
import type { RelatorioTotalizacao, ClienteOpcaoFiltro, CfopFiltroTotalizacao, DadosGrafico } from '@/types/relatorios'

import GraficoSvg from '@/components/relatorios/GraficoSvg'
import DisclaimerRodape from '@/components/relatorios/DisclaimerRodape'
import ComparacaoPeriodosTotalizacao from '@/components/relatorios/totalizacao/ComparacaoPeriodosTotalizacao'
import { useExportarRelatorio } from '@/components/relatorios/useExportarRelatorio'
import { CartaoResumoUi, BarraFiltroExportar, FaixaErro, estilosRelatorio } from '@/components/relatorios/RelatorioUiComum'

// Mês corrente até hoje — diferente do padrão "últimos 6 meses" dos
// demais relatórios, porque este é nota a nota (sem paginação): um
// intervalo largo por padrão traria centenas de linhas na primeira
// carga. O documento de referência que originou este relatório
// também cobria só 1 mês
function datasPadrao(): { dataInicial: string; dataFinal: string } {
  const hoje = new Date()
  const dataFinal = hoje.toISOString().slice(0, 10)
  const dataInicial = `${dataFinal.slice(0, 8)}01`
  return { dataInicial, dataFinal }
}

export default function TotalizacaoRelatorio() {
  const [filtros, setFiltros] = useState(datasPadrao())
  const [cfopFiltro, setCfopFiltro] = useState<CfopFiltroTotalizacao | ''>('')
  const [clienteId, setClienteId] = useState<string>('')
  const [incluirFreteNoValor, setIncluirFreteNoValor] = useState(false)
  const [filtrosAplicados, setFiltrosAplicados] = useState({
    ...datasPadrao(),
    cfopFiltro: '' as CfopFiltroTotalizacao | '',
    clienteId: '',
    incluirFreteNoValor: false,
  })

  const [relatorio, setRelatorio] = useState<RelatorioTotalizacao | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const [clientes, setClientes] = useState<ClienteOpcaoFiltro[]>([])
  const [incluirGraficoExport, setIncluirGraficoExport] = useState(true)

  // ── Módulo de gráfico — escopo de data independente da tabela
  // (decisão explícita). Abre em "Mês a mês", ano vigente ──────
  const [modoGrafico, setModoGrafico] = useState<'mes_a_mes' | 'comparar'>('mes_a_mes')
  const [anoGrafico, setAnoGrafico] = useState(new Date().getFullYear())
  const [graficoMesAMes, setGraficoMesAMes] = useState<DadosGrafico | null>(null)

  const { exportar, exportando, erroExportacao } = useExportarRelatorio('/api/relatorios/totalizacao')

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const r = await gerarRelatorioTotalizacao({
        dataInicial: filtrosAplicados.dataInicial,
        dataFinal: filtrosAplicados.dataFinal,
        cfopFiltro: filtrosAplicados.cfopFiltro || undefined,
        clienteId: filtrosAplicados.clienteId ? Number(filtrosAplicados.clienteId) : undefined,
        incluirFreteNoValor: filtrosAplicados.incluirFreteNoValor,
      })
      setRelatorio(r)
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao gerar relatório')
    } finally {
      setCarregando(false)
    }
  }, [filtrosAplicados])

  useEffect(() => { carregar() }, [carregar]) // eslint-disable-line react-hooks/set-state-in-effect

  useEffect(() => {
    buscarClientesParaFiltro().then(setClientes).catch(() => {}) // dropdown — falha aqui não deve travar o resto da tela
  }, [])

  useEffect(() => {
    gerarGraficoMesAMesTotalizacao(anoGrafico).then(setGraficoMesAMes).catch(() => {})
  }, [anoGrafico])

  const nomeArquivo = `totalizacao_${filtrosAplicados.dataInicial}_a_${filtrosAplicados.dataFinal}`
  const paramsExport: Record<string, string> = {
    dataInicial: filtrosAplicados.dataInicial,
    dataFinal: filtrosAplicados.dataFinal,
    incluirGrafico: String(incluirGraficoExport),
    anoGrafico: String(anoGrafico),
    incluirFreteNoValor: String(filtrosAplicados.incluirFreteNoValor),
    ...(filtrosAplicados.cfopFiltro ? { cfopFiltro: filtrosAplicados.cfopFiltro } : {}),
    ...(filtrosAplicados.clienteId ? { clienteId: filtrosAplicados.clienteId } : {}),
  }

  return (
    <div style={{ fontFamily: 'Tahoma, Geneva, sans-serif' }}>
      <BarraFiltroExportar
        dataInicial={filtros.dataInicial}
        dataFinal={filtros.dataFinal}
        onChangeDataInicial={v => setFiltros(f => ({ ...f, dataInicial: v }))}
        onChangeDataFinal={v => setFiltros(f => ({ ...f, dataFinal: v }))}
        onGerar={() => setFiltrosAplicados({ ...filtros, cfopFiltro, clienteId, incluirFreteNoValor })}
        onExportarPdf={() => exportar('pdf', paramsExport, nomeArquivo)}
        onExportarXlsx={() => exportar('xlsx', paramsExport, nomeArquivo)}
        exportando={exportando}
        podeExportar={!!relatorio}
        filtrosExtras={
          <>
            <div>
              <label style={estilosRelatorio.rotuloFiltro}>Cfop</label>
              <select value={cfopFiltro} onChange={e => setCfopFiltro(e.target.value as CfopFiltroTotalizacao | '')} style={estilosRelatorio.select}>
                <option value="">Todos</option>
                <option value="dentro_estado">Dentro do estado</option>
                <option value="fora_estado">Fora do estado</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            <div>
              <label style={estilosRelatorio.rotuloFiltro}>Cliente</label>
              <select value={clienteId} onChange={e => setClienteId(e.target.value)} style={estilosRelatorio.select}>
                <option value="">Todos</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#5a84a6', cursor: 'pointer', paddingBottom: '6px' }}>
              <input type="checkbox" checked={incluirFreteNoValor} onChange={e => setIncluirFreteNoValor(e.target.checked)} />
              Incluir frete no Valor total
            </label>
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
            <CartaoResumoUi rotulo="Total de notas" valor={String(relatorio.totalNotas)} />
            <CartaoResumoUi rotulo="Valor total" valor={formatarMoeda(relatorio.valorTotal)} />
            <CartaoResumoUi rotulo="Desconto total" valor={formatarMoeda(relatorio.descontoTotal)} />
            <CartaoResumoUi rotulo="Frete total" valor={formatarMoeda(relatorio.freteTotal)} />
          </div>

          {/* Módulo de gráfico — sempre visível, escopo de data
              independente do filtro da tabela acima (decisão
              explícita da sessão de brainstorm) */}
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
              <ComparacaoPeriodosTotalizacao />
            )}
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #dde8f0', borderRadius: '8px', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ background: '#1a6094', color: '#ffffff' }}>
                  <th style={estilosRelatorio.th}>Nota</th>
                  <th style={estilosRelatorio.th}>Emissão</th>
                  <th style={estilosRelatorio.th}>Cfop</th>
                  <th style={estilosRelatorio.th}>Cód.</th>
                  <th style={estilosRelatorio.th}>Razão Social</th>
                  <th style={{ ...estilosRelatorio.th, textAlign: 'right' }}>Valor</th>
                  <th style={{ ...estilosRelatorio.th, textAlign: 'right' }}>Desconto</th>
                  <th style={{ ...estilosRelatorio.th, textAlign: 'right' }}>Frete</th>
                </tr>
              </thead>
              <tbody>
                {relatorio.itens.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: '#5a84a6' }}>Nenhuma nota no período selecionado.</td></tr>
                ) : (
                  relatorio.itens.map((item, i) => (
                    <tr key={`${item.numeroNf}-${item.dataEmissao}`} style={{ background: i % 2 !== 0 ? '#f7fafc' : '#ffffff', borderBottom: '1px solid #e8f0f7' }}>
                      <td style={estilosRelatorio.td}>{item.numeroNf}</td>
                      <td style={estilosRelatorio.td}>{formatarDataBR(item.dataEmissao)}</td>
                      <td style={estilosRelatorio.td}>{item.cfop ?? '—'}</td>
                      <td style={estilosRelatorio.td}>{item.clienteId ?? '—'}</td>
                      <td style={estilosRelatorio.td}>{item.clienteNome}</td>
                      <td style={{ ...estilosRelatorio.td, textAlign: 'right' }}>{formatarMoeda(item.valor)}</td>
                      <td style={{ ...estilosRelatorio.td, textAlign: 'right' }}>{formatarMoeda(item.desconto)}</td>
                      <td style={{ ...estilosRelatorio.td, textAlign: 'right' }}>{formatarMoeda(item.frete)}</td>
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
