// ============================================================
// components/relatorios/receitaDespesa/ReceitaDespesaRelatorio.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Tela completa do relatório 2.7 (Receita x Despesa Bruta e
//         Líquida por período) — filtro de período, cartões de
//         totalizador, aviso obrigatório em destaque, gráfico de
//         barras agrupadas, tabela mensal detalhada com as 6 colunas
//         de valor.
// Conecta com: lib/relatorios/receitaDespesa.ts
// Referência: Especificacao_Modulo_Relatorios.md, Seção 2.7
// ============================================================

'use client'

import { useCallback, useEffect, useState } from 'react'
import { gerarRelatorioReceitaDespesa } from '@/lib/relatorios/receitaDespesa'
import { formatarMoeda, formatarMesBR } from '@/lib/relatorios/formatadores'
import { AVISO_RECEITA_DESPESA } from '@/types/relatorios'
import type { RelatorioReceitaDespesa } from '@/types/relatorios'

import GraficoSvg from '@/components/relatorios/GraficoSvg'
import DisclaimerRodape from '@/components/relatorios/DisclaimerRodape'
import { useExportarRelatorio } from '@/components/relatorios/useExportarRelatorio'
import { CartaoResumoUi, BarraFiltroExportar, FaixaErro, AvisoDestaque, estilosRelatorio } from '@/components/relatorios/RelatorioUiComum'

// Mesmo padrão de data padrão (últimos 6 meses) já usado nos demais
// relatórios (ex: GastosPorTipoFornecedorRelatorio.tsx)
function datasPadrao(): { dataInicial: string; dataFinal: string } {
  const hoje = new Date()
  const dataFinal = hoje.toISOString().slice(0, 10)
  const seisMesesAtras = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1)
  const dataInicial = seisMesesAtras.toISOString().slice(0, 10)
  return { dataInicial, dataFinal }
}

export default function ReceitaDespesaRelatorio() {
  const [filtros, setFiltros] = useState(datasPadrao())
  const [filtrosAplicados, setFiltrosAplicados] = useState(filtros)
  const [relatorio, setRelatorio] = useState<RelatorioReceitaDespesa | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const { exportar, exportando, erroExportacao } = useExportarRelatorio('/api/relatorios/receita-despesa')

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const r = await gerarRelatorioReceitaDespesa({
        dataInicial: filtrosAplicados.dataInicial,
        dataFinal: filtrosAplicados.dataFinal,
      })
      setRelatorio(r)
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao gerar relatório')
    } finally {
      setCarregando(false)
    }
  }, [filtrosAplicados])

  useEffect(() => { carregar() }, [carregar]) // eslint-disable-line react-hooks/set-state-in-effect

  const nomeArquivo = `receita_despesa_${filtrosAplicados.dataInicial}_a_${filtrosAplicados.dataFinal}`
  const paramsExport: Record<string, string> = {
    dataInicial: filtrosAplicados.dataInicial,
    dataFinal: filtrosAplicados.dataFinal,
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
      />

      {(erro || erroExportacao) && <FaixaErro mensagem={erro || erroExportacao} />}

      {carregando ? (
        <div style={{ padding: '32px', textAlign: 'center', color: '#5a84a6', fontSize: '12px' }}>Carregando relatório...</div>
      ) : relatorio && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
            <CartaoResumoUi rotulo="Receita Bruta" valor={formatarMoeda(relatorio.totalizador.receitaBruta)} />
            <CartaoResumoUi rotulo="Receita Líquida" valor={formatarMoeda(relatorio.totalizador.receitaLiquida)} />
            <CartaoResumoUi rotulo="Despesa Bruta" valor={formatarMoeda(relatorio.totalizador.despesaBruta)} />
            <CartaoResumoUi rotulo="Despesa Líquida" valor={formatarMoeda(relatorio.totalizador.despesaLiquida)} />
            <CartaoResumoUi rotulo="Resultado Bruto" valor={formatarMoeda(relatorio.totalizador.resultadoBruto)} />
            <CartaoResumoUi rotulo="Resultado Líquido" valor={formatarMoeda(relatorio.totalizador.resultadoLiquido)} />
          </div>

          {/* Aviso obrigatório específico deste relatório (Seção 2.7)
              — em destaque, próximo às colunas "Resultado" acima,
              não escondido no rodapé em fonte reduzida (esse é o
              DisclaimerRodape padrão, exibido ao final da tela) */}
          <AvisoDestaque mensagem={AVISO_RECEITA_DESPESA} />

          <div style={{ background: '#ffffff', border: '1px solid #dde8f0', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
            <GraficoSvg dados={relatorio.grafico} titulo="Receita x Despesa por mês" />
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #dde8f0', borderRadius: '8px', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ background: '#1a6094', color: '#ffffff' }}>
                  <th style={estilosRelatorio.th}>Mês</th>
                  <th style={{ ...estilosRelatorio.th, textAlign: 'right' }}>Receita Bruta</th>
                  <th style={{ ...estilosRelatorio.th, textAlign: 'right' }}>Receita Líquida</th>
                  <th style={{ ...estilosRelatorio.th, textAlign: 'right' }}>Despesa Bruta</th>
                  <th style={{ ...estilosRelatorio.th, textAlign: 'right' }}>Despesa Líquida</th>
                  <th style={{ ...estilosRelatorio.th, textAlign: 'right' }}>Resultado Bruto</th>
                  <th style={{ ...estilosRelatorio.th, textAlign: 'right' }}>Resultado Líquido</th>
                </tr>
              </thead>
              <tbody>
                {relatorio.meses.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: '#5a84a6' }}>Nenhum lançamento no período selecionado.</td></tr>
                ) : (
                  relatorio.meses.map((m, i) => (
                    <tr key={m.mes} style={{ background: i % 2 !== 0 ? '#f7fafc' : '#ffffff', borderBottom: '1px solid #e8f0f7' }}>
                      <td style={estilosRelatorio.td}>{formatarMesBR(m.mes)}</td>
                      <td style={{ ...estilosRelatorio.td, textAlign: 'right' }}>{formatarMoeda(m.receitaBruta)}</td>
                      <td style={{ ...estilosRelatorio.td, textAlign: 'right' }}>{formatarMoeda(m.receitaLiquida)}</td>
                      <td style={{ ...estilosRelatorio.td, textAlign: 'right' }}>{formatarMoeda(m.despesaBruta)}</td>
                      <td style={{ ...estilosRelatorio.td, textAlign: 'right' }}>{formatarMoeda(m.despesaLiquida)}</td>
                      <td style={{ ...estilosRelatorio.td, textAlign: 'right' }}>{formatarMoeda(m.resultadoBruto)}</td>
                      <td style={{ ...estilosRelatorio.td, textAlign: 'right' }}>{formatarMoeda(m.resultadoLiquido)}</td>
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
