// ============================================================
// components/relatorios/totalizacaoDespesas/ComparacaoPeriodosTotalizacaoDespesas.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Modo "Comparar períodos" do gráfico do relatório
//         Totalização de Despesas (2.9) — dois seletores de data
//         (Período A e B), 100% manuais, sem sugestão automática
//         (mesma decisão explícita do 2.8). Não usa GraficoSvg — ver
//         nota em types/relatorios.ts (ComparacaoPeriodosResultadoDespesas)
//         sobre por que este modo tem componente próprio.
// Conecta com: lib/relatorios/totalizacaoDespesas.ts
//              (compararPeriodosTotalizacaoDespesas)
// ============================================================

'use client'

import { useState } from 'react'
import { compararPeriodosTotalizacaoDespesas } from '@/lib/relatorios/totalizacaoDespesas'
import { formatarMoeda } from '@/lib/relatorios/formatadores'
import { estilosRelatorio } from '@/components/relatorios/RelatorioUiComum'
import type { ComparacaoPeriodosResultadoDespesas } from '@/types/relatorios'

function BlocoComparacao({ rotulo, valorA, valorB, formatoValor }: { rotulo: string; valorA: number; valorB: number; formatoValor: (v: number) => string }) {
  const maior = Math.max(valorA, valorB, 1) // evita divisão por 0 quando os dois são 0
  const variacao = valorB === 0 ? null : ((valorA - valorB) / valorB) * 100
  const corVariacao = variacao === null ? '#5a84a6' : variacao >= 0 ? '#3b6d11' : '#a32d2d'

  return (
    <div style={{ flex: '1 1 220px', background: '#eaf2f9', borderRadius: '8px', padding: '12px 14px' }}>
      <div style={{ fontSize: '10px', color: '#5a84a6', marginBottom: '8px' }}>{rotulo}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', height: '90px' }}>
        <div style={{ width: '36px', height: `${(valorA / maior) * 90}px`, background: '#1a6094', borderRadius: '3px 3px 0 0', position: 'relative' }}>
          <span style={{ position: 'absolute', top: '-16px', left: '-14px', right: '-14px', textAlign: 'center', fontSize: '10px', color: '#1a6094' }}>{formatoValor(valorA)}</span>
        </div>
        <div style={{ width: '36px', height: `${(valorB / maior) * 90}px`, background: '#993c1d', borderRadius: '3px 3px 0 0', position: 'relative' }}>
          <span style={{ position: 'absolute', top: '-16px', left: '-14px', right: '-14px', textAlign: 'center', fontSize: '10px', color: '#993c1d' }}>{formatoValor(valorB)}</span>
        </div>
        {variacao !== null && (
          <div style={{ fontSize: '12px', fontWeight: 500, color: corVariacao, marginLeft: '4px', alignSelf: 'center' }}>
            {variacao >= 0 ? '+' : ''}{variacao.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%
          </div>
        )}
      </div>
    </div>
  )
}

export default function ComparacaoPeriodosTotalizacaoDespesas() {
  const hoje = new Date().toISOString().slice(0, 10)
  const [periodoA, setPeriodoA] = useState({ dataInicial: hoje.slice(0, 8) + '01', dataFinal: hoje })
  const [periodoB, setPeriodoB] = useState({ dataInicial: hoje.slice(0, 8) + '01', dataFinal: hoje })
  const [resultado, setResultado] = useState<ComparacaoPeriodosResultadoDespesas | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  async function comparar() {
    setCarregando(true)
    setErro('')
    try {
      const r = await compararPeriodosTotalizacaoDespesas(periodoA, periodoB)
      setResultado(r)
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao comparar períodos')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#1a6094', display: 'inline-block', marginBottom: '5px' }} />
          <div>
            <label style={estilosRelatorio.rotuloFiltro}>Período A — de</label>
            <input type="date" value={periodoA.dataInicial} onChange={e => setPeriodoA(p => ({ ...p, dataInicial: e.target.value }))} style={estilosRelatorio.input} />
          </div>
          <div>
            <label style={estilosRelatorio.rotuloFiltro}>até</label>
            <input type="date" value={periodoA.dataFinal} onChange={e => setPeriodoA(p => ({ ...p, dataFinal: e.target.value }))} style={estilosRelatorio.input} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#993c1d', display: 'inline-block', marginBottom: '5px' }} />
          <div>
            <label style={estilosRelatorio.rotuloFiltro}>Período B — de</label>
            <input type="date" value={periodoB.dataInicial} onChange={e => setPeriodoB(p => ({ ...p, dataInicial: e.target.value }))} style={estilosRelatorio.input} />
          </div>
          <div>
            <label style={estilosRelatorio.rotuloFiltro}>até</label>
            <input type="date" value={periodoB.dataFinal} onChange={e => setPeriodoB(p => ({ ...p, dataFinal: e.target.value }))} style={estilosRelatorio.input} />
          </div>
        </div>
        <button onClick={comparar} style={estilosRelatorio.botaoPrimario}>
          <i className="ti ti-refresh" aria-hidden="true" /> {carregando ? 'Comparando...' : 'Comparar'}
        </button>
      </div>

      {erro && <div style={{ fontSize: '11px', color: '#a32d2d', marginBottom: '10px' }}>{erro}</div>}

      {resultado && (
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
          <BlocoComparacao rotulo="Valor total" valorA={resultado.valorTotalA} valorB={resultado.valorTotalB} formatoValor={formatarMoeda} />
          <BlocoComparacao rotulo="Despesas lançadas" valorA={resultado.despesasA} valorB={resultado.despesasB} formatoValor={v => String(v)} />
        </div>
      )}
    </div>
  )
}
