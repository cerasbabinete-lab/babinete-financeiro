// ============================================================
// components/relatorios/fluxoCaixa/FluxoCaixaRelatorio.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Tela completa do relatório 2.2 (Fluxo de caixa realizado)
// Conecta com: lib/relatorios/fluxoCaixa.ts, componentes
//              compartilhados de components/relatorios/
// Referência: Especificacao_Modulo_Relatorios.md, Seção 2.2
// ============================================================

'use client'

import { useCallback, useEffect, useState } from 'react'
import { gerarRelatorioFluxoCaixa } from '@/lib/relatorios/fluxoCaixa'
import { formatarMoeda, formatarDataBR } from '@/lib/relatorios/formatadores'
import type { RelatorioFluxoCaixa } from '@/types/relatorios'

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

export default function FluxoCaixaRelatorio() {
  const [filtros, setFiltros] = useState(datasPadrao())
  const [filtrosAplicados, setFiltrosAplicados] = useState(filtros)
  const [relatorio, setRelatorio] = useState<RelatorioFluxoCaixa | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const { exportar, exportando, erroExportacao } = useExportarRelatorio('/api/relatorios/fluxo-caixa')

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const r = await gerarRelatorioFluxoCaixa(filtrosAplicados)
      setRelatorio(r)
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao gerar relatório')
    } finally {
      setCarregando(false)
    }
  }, [filtrosAplicados])

  useEffect(() => { carregar() }, [carregar]) // eslint-disable-line react-hooks/set-state-in-effect

  const nomeArquivo = `fluxo_caixa_${filtrosAplicados.dataInicial}_a_${filtrosAplicados.dataFinal}`

  return (
    <div style={{ fontFamily: 'Tahoma, Geneva, sans-serif' }}>
      <BarraFiltroExportar
        dataInicial={filtros.dataInicial}
        dataFinal={filtros.dataFinal}
        onChangeDataInicial={v => setFiltros(f => ({ ...f, dataInicial: v }))}
        onChangeDataFinal={v => setFiltros(f => ({ ...f, dataFinal: v }))}
        onGerar={() => setFiltrosAplicados(filtros)}
        onExportarPdf={() => exportar('pdf', filtrosAplicados, nomeArquivo)}
        onExportarXlsx={() => exportar('xlsx', filtrosAplicados, nomeArquivo)}
        exportando={exportando}
        podeExportar={!!relatorio}
      />

      {(erro || erroExportacao) && <FaixaErro mensagem={erro || erroExportacao} />}

      {carregando ? (
        <div style={{ padding: '32px', textAlign: 'center', color: '#5a84a6', fontSize: '12px' }}>Carregando relatório...</div>
      ) : relatorio && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
            <CartaoResumoUi rotulo="Entradas" valor={formatarMoeda(relatorio.entradas)} />
            <CartaoResumoUi rotulo="Saídas" valor={formatarMoeda(relatorio.saidas)} />
            <CartaoResumoUi rotulo="Saldo do período" valor={formatarMoeda(relatorio.saldoPeriodo)} />
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #dde8f0', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
            <GraficoSvg dados={relatorio.grafico} titulo="Entradas x Saídas por mês" />
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #dde8f0', borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ background: '#1a6094', color: '#ffffff' }}>
                  <th style={estilosRelatorio.th}>Data</th>
                  <th style={estilosRelatorio.th}>Descrição</th>
                  <th style={{ ...estilosRelatorio.th, textAlign: 'right' }}>Entrada</th>
                  <th style={{ ...estilosRelatorio.th, textAlign: 'right' }}>Saída</th>
                </tr>
              </thead>
              <tbody>
                {relatorio.lancamentos.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: '#5a84a6' }}>Nenhum lançamento baixado no período selecionado.</td></tr>
                ) : (
                  relatorio.lancamentos.map((l, i) => (
                    <tr key={i} style={{ background: i % 2 !== 0 ? '#f7fafc' : '#ffffff', borderBottom: '1px solid #e8f0f7' }}>
                      <td style={estilosRelatorio.td}>{formatarDataBR(l.data)}</td>
                      <td style={estilosRelatorio.td}>{l.descricao}</td>
                      <td style={{ ...estilosRelatorio.td, textAlign: 'right' }}>{l.entrada > 0 ? formatarMoeda(l.entrada) : '—'}</td>
                      <td style={{ ...estilosRelatorio.td, textAlign: 'right' }}>{l.saida > 0 ? formatarMoeda(l.saida) : '—'}</td>
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
