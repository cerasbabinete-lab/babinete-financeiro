// ============================================================
// components/relatorios/extratoConsolidado/ExtratoConsolidadoRelatorio.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Tela completa do relatório 2.4 (Extrato consolidado) —
//         o mais configurável dos 6: período, lado (a pagar/a
//         receber/ambos), status (pago/em aberto/tudo) e nível de
//         detalhe (resumido/detalhado).
// Conecta com: lib/relatorios/extratoConsolidado.ts
// Referência: Especificacao_Modulo_Relatorios.md, Seção 2.4
// ============================================================

'use client'

import { useCallback, useEffect, useState } from 'react'
import { gerarRelatorioExtratoConsolidado } from '@/lib/relatorios/extratoConsolidado'
import { formatarMoeda, formatarDataBR } from '@/lib/relatorios/formatadores'
import {
  FAIXA_AGING_LABELS,
  type RelatorioExtratoConsolidado,
  type LadoExtrato,
  type StatusFiltroExtrato,
  type NivelDetalheExtrato,
  type FaixaAging,
} from '@/types/relatorios'

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

interface FiltrosTela {
  dataInicial: string
  dataFinal: string
  lado: LadoExtrato | 'ambos'
  status: StatusFiltroExtrato
  nivelDetalhe: NivelDetalheExtrato
}

export default function ExtratoConsolidadoRelatorio() {
  const [filtros, setFiltros] = useState<FiltrosTela>({ ...datasPadrao(), lado: 'ambos', status: 'tudo', nivelDetalhe: 'detalhado' })
  const [filtrosAplicados, setFiltrosAplicados] = useState(filtros)
  const [relatorio, setRelatorio] = useState<RelatorioExtratoConsolidado | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const { exportar, exportando, erroExportacao } = useExportarRelatorio('/api/relatorios/extrato-consolidado')

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const r = await gerarRelatorioExtratoConsolidado(filtrosAplicados)
      setRelatorio(r)
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao gerar relatório')
    } finally {
      setCarregando(false)
    }
  }, [filtrosAplicados])

  useEffect(() => { carregar() }, [carregar]) // eslint-disable-line react-hooks/set-state-in-effect

  const nomeArquivo = `extrato_consolidado_${filtrosAplicados.dataInicial}_a_${filtrosAplicados.dataFinal}`
  const paramsExport: Record<string, string> = { ...filtrosAplicados }

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
          <>
            <div>
              <label style={estilosRelatorio.rotuloFiltro}>Lado</label>
              <select value={filtros.lado} onChange={e => setFiltros(f => ({ ...f, lado: e.target.value as LadoExtrato | 'ambos' }))} style={estilosRelatorio.select}>
                <option value="ambos">Ambos</option>
                <option value="a_pagar">A pagar</option>
                <option value="a_receber">A receber</option>
              </select>
            </div>
            <div>
              <label style={estilosRelatorio.rotuloFiltro}>Status</label>
              <select value={filtros.status} onChange={e => setFiltros(f => ({ ...f, status: e.target.value as StatusFiltroExtrato }))} style={estilosRelatorio.select}>
                <option value="tudo">Tudo</option>
                <option value="em_aberto">Em aberto</option>
                <option value="pago">Pago</option>
              </select>
            </div>
            <div>
              <label style={estilosRelatorio.rotuloFiltro}>Detalhe</label>
              <select value={filtros.nivelDetalhe} onChange={e => setFiltros(f => ({ ...f, nivelDetalhe: e.target.value as NivelDetalheExtrato }))} style={estilosRelatorio.select}>
                <option value="detalhado">Detalhado</option>
                <option value="resumido">Resumido</option>
              </select>
            </div>
          </>
        }
      />

      {(erro || erroExportacao) && <FaixaErro mensagem={erro || erroExportacao} />}

      {carregando ? (
        <div style={{ padding: '32px', textAlign: 'center', color: '#5a84a6', fontSize: '12px' }}>Carregando relatório...</div>
      ) : relatorio && (
        <>
          {relatorio.totaisPorFaixa.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
              {relatorio.totaisPorFaixa.map(f => (
                <CartaoResumoUi key={f.faixa} rotulo={`${FAIXA_AGING_LABELS[f.faixa as FaixaAging]} (${f.quantidade})`} valor={formatarMoeda(f.total)} />
              ))}
            </div>
          )}

          <div style={{ background: '#ffffff', border: '1px solid #dde8f0', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
            <GraficoSvg dados={relatorio.grafico} titulo="Total por faixa de vencimento" />
          </div>

          {relatorio.itens && (
            <div style={{ background: '#ffffff', border: '1px solid #dde8f0', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr style={{ background: '#1a6094', color: '#ffffff' }}>
                    <th style={estilosRelatorio.th}>Vencimento</th>
                    <th style={estilosRelatorio.th}>Favorecido/Cliente</th>
                    <th style={estilosRelatorio.th}>Lado</th>
                    <th style={{ ...estilosRelatorio.th, textAlign: 'right' }}>Valor</th>
                    <th style={estilosRelatorio.th}>Faixa</th>
                    <th style={estilosRelatorio.th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {relatorio.itens.length === 0 ? (
                    <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#5a84a6' }}>Nenhum título encontrado com os filtros selecionados.</td></tr>
                  ) : (
                    relatorio.itens.map((item, i) => (
                      <tr key={i} style={{ background: i % 2 !== 0 ? '#f7fafc' : '#ffffff', borderBottom: '1px solid #e8f0f7' }}>
                        <td style={estilosRelatorio.td}>{formatarDataBR(item.dataVencimento)}</td>
                        <td style={estilosRelatorio.td}>{item.favorecidoOuCliente}</td>
                        <td style={estilosRelatorio.td}>{item.lado === 'a_pagar' ? 'A pagar' : 'A receber'}</td>
                        <td style={{ ...estilosRelatorio.td, textAlign: 'right' }}>{formatarMoeda(item.valor)}</td>
                        <td style={estilosRelatorio.td}>{item.faixa ? FAIXA_AGING_LABELS[item.faixa] : '—'}</td>
                        <td style={estilosRelatorio.td}>{item.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          <DisclaimerRodape />
        </>
      )}
    </div>
  )
}
