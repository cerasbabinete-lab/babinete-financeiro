// ============================================================
// components/relatorios/retiradas/RetiradasRelatorio.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Tela completa do relatório 2.3 (Retiradas e benefícios
//         por beneficiário) — filtro de período + beneficiário
//         opcional, cartões, gráfico, tabela agrupada com subtotal
//         por pessoa.
// Conecta com: lib/relatorios/retiradas.ts
// Referência: Especificacao_Modulo_Relatorios.md, Seção 2.3
// ============================================================

'use client'

import { useCallback, useEffect, useState } from 'react'
import { gerarRelatorioRetiradas, buscarNomesBeneficiarios } from '@/lib/relatorios/retiradas'
import { formatarMoeda, formatarDataBR } from '@/lib/relatorios/formatadores'
import { SUBTIPO_RETIRADA_LABELS, type RelatorioRetiradas, type SubtipoRetirada } from '@/types/relatorios'

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

export default function RetiradasRelatorio() {
  const [filtros, setFiltros] = useState({ ...datasPadrao(), beneficiarioFiltro: '' })
  const [filtrosAplicados, setFiltrosAplicados] = useState(filtros)
  const [relatorio, setRelatorio] = useState<RelatorioRetiradas | null>(null)
  const [nomesBeneficiarios, setNomesBeneficiarios] = useState<string[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const { exportar, exportando, erroExportacao } = useExportarRelatorio('/api/relatorios/retiradas')

  useEffect(() => {
    buscarNomesBeneficiarios().then(setNomesBeneficiarios).catch(() => { /* filtro fica vazio, não bloqueia a tela */ })
  }, [])

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const r = await gerarRelatorioRetiradas({
        dataInicial: filtrosAplicados.dataInicial,
        dataFinal: filtrosAplicados.dataFinal,
        beneficiarioFiltro: filtrosAplicados.beneficiarioFiltro || undefined,
      })
      setRelatorio(r)
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao gerar relatório')
    } finally {
      setCarregando(false)
    }
  }, [filtrosAplicados])

  useEffect(() => { carregar() }, [carregar]) // eslint-disable-line react-hooks/set-state-in-effect

  const nomeArquivo = `retiradas_${filtrosAplicados.dataInicial}_a_${filtrosAplicados.dataFinal}`
  const paramsExport: Record<string, string> = {
    dataInicial: filtrosAplicados.dataInicial,
    dataFinal: filtrosAplicados.dataFinal,
    ...(filtrosAplicados.beneficiarioFiltro ? { beneficiarioFiltro: filtrosAplicados.beneficiarioFiltro } : {}),
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
            <label style={estilosRelatorio.rotuloFiltro}>Beneficiário</label>
            <select
              value={filtros.beneficiarioFiltro}
              onChange={e => setFiltros(f => ({ ...f, beneficiarioFiltro: e.target.value }))}
              style={estilosRelatorio.select}
            >
              <option value="">Todos</option>
              {nomesBeneficiarios.map(nome => <option key={nome} value={nome}>{nome}</option>)}
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
            <CartaoResumoUi rotulo="Beneficiários" valor={String(relatorio.grupos.length)} />
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #dde8f0', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
            <GraficoSvg dados={relatorio.grafico} titulo="Total por beneficiário" />
          </div>

          {relatorio.grupos.length === 0 ? (
            <div style={{ background: '#ffffff', border: '1px solid #dde8f0', borderRadius: '8px', padding: '24px', textAlign: 'center', color: '#5a84a6', fontSize: '12px' }}>
              Nenhuma retirada/benefício no período selecionado.
            </div>
          ) : (
            relatorio.grupos.map(grupo => (
              <div key={grupo.beneficiarioNome} style={{ background: '#ffffff', border: '1px solid #dde8f0', borderRadius: '8px', overflow: 'hidden', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#eaf2f9' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#1a6094' }}>{grupo.beneficiarioNome}</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#1a6094' }}>{formatarMoeda(grupo.subtotal)}</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                    <tr style={{ background: '#f7fafc', borderBottom: '1px solid #e8f0f7' }}>
                      <th style={{ ...estilosRelatorio.th, color: '#5a84a6' }}>Data</th>
                      <th style={{ ...estilosRelatorio.th, color: '#5a84a6' }}>Tipo</th>
                      <th style={{ ...estilosRelatorio.th, color: '#5a84a6', textAlign: 'right' }}>Valor</th>
                      <th style={{ ...estilosRelatorio.th, color: '#5a84a6' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupo.lancamentos.map((l, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #e8f0f7' }}>
                        <td style={estilosRelatorio.td}>{formatarDataBR(l.data)}</td>
                        <td style={estilosRelatorio.td}>{SUBTIPO_RETIRADA_LABELS[l.subtipo as SubtipoRetirada] ?? l.subtipo}</td>
                        <td style={{ ...estilosRelatorio.td, textAlign: 'right' }}>{formatarMoeda(l.valor)}</td>
                        <td style={estilosRelatorio.td}>{l.statusPagamento}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}

          <DisclaimerRodape />
        </>
      )}
    </div>
  )
}
