// ============================================================
// components/relatorios/gastosPorTipoFornecedor/GastosPorTipoFornecedorRelatorio.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Tela completa do relatório 2.6 (Gastos por tipo de
//         fornecedor) — filtro de período + tipo opcional, cartões
//         por tipo, gráfico de pizza, tabela mensal detalhada.
// Conecta com: lib/relatorios/gastosPorTipoFornecedor.ts
// Referência: Especificacao_Modulo_Relatorios.md, Seção 2.6
// ============================================================

'use client'

import { useCallback, useEffect, useState } from 'react'
import { gerarRelatorioGastosPorTipoFornecedor, ROTULO_TIPO } from '@/lib/relatorios/gastosPorTipoFornecedor'
import { formatarMoeda, formatarMesBR } from '@/lib/relatorios/formatadores'
import type { RelatorioGastosPorTipoFornecedor, TipoFornecedorOuNaoClassificado } from '@/types/relatorios'

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

const OPCOES_TIPO: TipoFornecedorOuNaoClassificado[] = ['materia_prima_insumo', 'embalagem', 'servicos', 'outros', 'nao_classificado']

export default function GastosPorTipoFornecedorRelatorio() {
  const [filtros, setFiltros] = useState({ ...datasPadrao(), tipoFiltro: '' })
  const [filtrosAplicados, setFiltrosAplicados] = useState(filtros)
  const [relatorio, setRelatorio] = useState<RelatorioGastosPorTipoFornecedor | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const { exportar, exportando, erroExportacao } = useExportarRelatorio('/api/relatorios/gastos-por-tipo-fornecedor')

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const r = await gerarRelatorioGastosPorTipoFornecedor({
        dataInicial: filtrosAplicados.dataInicial,
        dataFinal: filtrosAplicados.dataFinal,
        tipoFiltro: (filtrosAplicados.tipoFiltro || undefined) as TipoFornecedorOuNaoClassificado | undefined,
      })
      setRelatorio(r)
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao gerar relatório')
    } finally {
      setCarregando(false)
    }
  }, [filtrosAplicados])

  useEffect(() => { carregar() }, [carregar]) // eslint-disable-line react-hooks/set-state-in-effect

  const nomeArquivo = `gastos_por_tipo_fornecedor_${filtrosAplicados.dataInicial}_a_${filtrosAplicados.dataFinal}`
  const paramsExport: Record<string, string> = {
    dataInicial: filtrosAplicados.dataInicial,
    dataFinal: filtrosAplicados.dataFinal,
    ...(filtrosAplicados.tipoFiltro ? { tipoFiltro: filtrosAplicados.tipoFiltro } : {}),
  }

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
            <label style={estilosRelatorio.rotuloFiltro}>Tipo</label>
            <select value={filtros.tipoFiltro} onChange={e => setFiltros(f => ({ ...f, tipoFiltro: e.target.value }))} style={estilosRelatorio.select}>
              <option value="">Todos</option>
              {OPCOES_TIPO.map(tipo => <option key={tipo} value={tipo}>{ROTULO_TIPO[tipo]}</option>)}
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
            <CartaoResumoUi rotulo="Total geral do período" valor={formatarMoeda(relatorio.totalGeral)} />
            {relatorio.porTipo.map(t => (
              <CartaoResumoUi key={t.tipo} rotulo={ROTULO_TIPO[t.tipo]} valor={formatarMoeda(t.total)} />
            ))}
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #dde8f0', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
            <GraficoSvg dados={relatorio.grafico} titulo="Gastos por tipo de fornecedor no período" />
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #dde8f0', borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ background: '#1a6094', color: '#ffffff' }}>
                  <th style={estilosRelatorio.th}>Mês</th>
                  <th style={estilosRelatorio.th}>Tipo</th>
                  <th style={{ ...estilosRelatorio.th, textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {relatorio.porTipoPorMes.length === 0 ? (
                  <tr><td colSpan={3} style={{ padding: '24px', textAlign: 'center', color: '#5a84a6' }}>Nenhuma despesa no período selecionado.</td></tr>
                ) : (
                  relatorio.porTipoPorMes.map((g, i) => (
                    <tr key={i} style={{ background: i % 2 !== 0 ? '#f7fafc' : '#ffffff', borderBottom: '1px solid #e8f0f7' }}>
                      <td style={estilosRelatorio.td}>{formatarMesBR(g.mes)}</td>
                      <td style={estilosRelatorio.td}>{ROTULO_TIPO[g.tipo]}</td>
                      <td style={{ ...estilosRelatorio.td, textAlign: 'right' }}>{formatarMoeda(g.total)}</td>
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
