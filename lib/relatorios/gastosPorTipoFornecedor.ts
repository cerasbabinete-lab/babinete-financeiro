// ============================================================
// lib/relatorios/gastosPorTipoFornecedor.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Calcula o relatório "Gastos por tipo de fornecedor" (2.6)
//         — despesas agrupadas por fornecedores.tipo_fornecedor,
//         por mês. Fornecedor sem tipo_fornecedor preenchido cai no
//         grupo visível "Não classificado" (Seção 2.6 — nunca
//         omitido do total).
// Conecta com: types/relatorios.ts (RelatorioGastosPorTipoFornecedor),
//              pages/api/relatorios/gastos-por-tipo-fornecedor.ts,
//              sql/fornecedores.sql (tipo_fornecedor, Fase 0 deste build)
// Referência: Especificacao_Modulo_Relatorios.md, Seção 2.6
//
// Decisões confirmadas por Maycon nesta sessão:
//   - Fonte de gasto = despesas (documento), não contas_a_pagar (título)
// Decisões de engenharia não detalhadas na spec:
//   - Filtro de data sobre despesas.documento_data_emissao, com
//     fallback created_at quando nula — mesmo padrão já usado no
//     relatório de Retiradas (2.3), mesma tabela de origem
// ============================================================

import { supabase } from '@/lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  RelatorioGastosPorTipoFornecedor,
  GastoPorTipoFornecedor,
  GastoPorTipoFornecedorMes,
  TipoFornecedorOuNaoClassificado,
  FiltroIntervaloDatas,
} from '@/types/relatorios'

const NAO_CLASSIFICADO: TipoFornecedorOuNaoClassificado = 'nao_classificado'

interface LinhaDespesa {
  fornecedor_id: number
  valor_total: number
  documento_data_emissao: string | null
  created_at: string
}

// ============================================================
// gerarRelatorioGastosPorTipoFornecedor()
// ============================================================
export async function gerarRelatorioGastosPorTipoFornecedor(
  filtros: FiltroIntervaloDatas & { tipoFiltro?: TipoFornecedorOuNaoClassificado },
  client: SupabaseClient = supabase,
): Promise<RelatorioGastosPorTipoFornecedor> {
  // ── 1. Despesas empresariais, não soft-deleted ──────────────
  // (origem_tipo não é filtrado aqui de propósito — este relatório
  // é sobre gasto total por tipo de fornecedor, inclui tanto
  // despesas empresariais quanto pessoal_socio; a spec não exclui
  // nenhuma categoria de origem_tipo neste relatório especificamente)
  const { data, error } = await client
    .from('despesas')
    .select('fornecedor_id, valor_total, documento_data_emissao, created_at')
    .is('deleted_at', null)

  if (error) {
    console.error('[relatorios/gastosPorTipoFornecedor] erro ao buscar despesas:', error)
    throw new Error(error.message)
  }

  const fimIntervalo = filtros.dataFinal + 'T23:59:59'
  const linhasNoIntervalo = ((data ?? []) as LinhaDespesa[]).filter(d => {
    const dataEfetiva = d.documento_data_emissao ?? d.created_at
    return dataEfetiva >= filtros.dataInicial && dataEfetiva <= fimIntervalo
  })

  // ── 2. Busca tipo_fornecedor só dos fornecedores que aparecem
  // no período filtrado (evita puxar a tabela fornecedores inteira) ──
  const idsFornecedores = Array.from(new Set(linhasNoIntervalo.map(d => d.fornecedor_id)))
  const mapaTipo = new Map<number, TipoFornecedorOuNaoClassificado>()

  if (idsFornecedores.length > 0) {
    const { data: fornecedores, error: erroFornecedores } = await client
      .from('fornecedores')
      .select('id, tipo_fornecedor')
      .in('id', idsFornecedores)

    if (erroFornecedores) {
      console.error('[relatorios/gastosPorTipoFornecedor] erro ao buscar fornecedores:', erroFornecedores)
      throw new Error(erroFornecedores.message)
    }

    for (const f of fornecedores ?? []) {
      mapaTipo.set(f.id, (f.tipo_fornecedor ?? NAO_CLASSIFICADO) as TipoFornecedorOuNaoClassificado)
    }
  }

  // ── 3. Agregação por tipo (período inteiro) e por tipo+mês ───
  const porTipoMap = new Map<TipoFornecedorOuNaoClassificado, number>()
  const porTipoPorMesMap = new Map<string, number>() // chave: `${tipo}|${mes}`

  for (const d of linhasNoIntervalo) {
    const tipo = mapaTipo.get(d.fornecedor_id) ?? NAO_CLASSIFICADO
    if (filtros.tipoFiltro && tipo !== filtros.tipoFiltro) continue

    const valor = Number(d.valor_total) || 0
    porTipoMap.set(tipo, (porTipoMap.get(tipo) ?? 0) + valor)

    const mes = (d.documento_data_emissao ?? d.created_at).slice(0, 7)
    const chaveMes = `${tipo}|${mes}`
    porTipoPorMesMap.set(chaveMes, (porTipoPorMesMap.get(chaveMes) ?? 0) + valor)
  }

  const porTipo: GastoPorTipoFornecedor[] = Array.from(porTipoMap.entries())
    .map(([tipo, total]) => ({ tipo, total }))
    .sort((a, b) => b.total - a.total)

  const porTipoPorMes: GastoPorTipoFornecedorMes[] = Array.from(porTipoPorMesMap.entries())
    .map(([chave, total]) => {
      const [tipo, mes] = chave.split('|') as [TipoFornecedorOuNaoClassificado, string]
      return { tipo, mes, total }
    })
    .sort((a, b) => a.mes.localeCompare(b.mes))

  const totalGeral = porTipo.reduce((s, t) => s + t.total, 0)

  return {
    periodo: filtros,
    tipoFiltro: filtros.tipoFiltro,
    porTipo,
    porTipoPorMes,
    totalGeral,
    grafico: {
      tipo: 'pizza',
      pontos: porTipo.map(t => ({ rotulo: ROTULO_TIPO[t.tipo], valor: t.total })),
    },
  }
}

// ============================================================
// ROTULO_TIPO — rótulo amigável, incluindo o grupo virtual
// "Não classificado" que não existe em TIPO_FORNECEDOR_LABELS
// (esse é só dos 4 valores reais do CHECK do banco)
// ============================================================
export const ROTULO_TIPO: Record<TipoFornecedorOuNaoClassificado, string> = {
  materia_prima_insumo: 'Matéria-prima / Insumo',
  embalagem: 'Embalagem',
  servicos: 'Serviços',
  outros: 'Outros',
  nao_classificado: 'Não classificado',
}
