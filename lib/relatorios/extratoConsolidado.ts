// ============================================================
// lib/relatorios/extratoConsolidado.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Calcula o relatório "Extrato consolidado" (2.4) — união
//         de contas_a_pagar e contas_receber, com aging para itens
//         em aberto.
// Conecta com: types/relatorios.ts (RelatorioExtratoConsolidado),
//              pages/api/relatorios/extrato-consolidado.ts
// Referência: Especificacao_Modulo_Relatorios.md, Seção 2.4
//
// Decisões de engenharia não detalhadas na spec (documentadas aqui,
// sinalizar ao Maycon se preferir diferente):
//   - Intervalo de datas aplicado sobre `data_vencimento` — é o único
//     campo que faz sentido tanto pra títulos pagos quanto em aberto
//     (data_baixa é null em títulos ainda não baixados).
//   - Mapeamento do filtro de status (3 opções da tela) pros status
//     reais de cada tabela:
//       'pago'      -> contas_receber: status IN (pago, recebido_pix_ted)
//                      contas_a_pagar: status = pago
//       'em_aberto' -> contas_receber: status = em_aberto
//                      contas_a_pagar: status IN (em_aberto, pago_parcial)
//                      (pago_parcial ainda tem saldo em aberto, por
//                      isso entra no bucket "em aberto" pra fins de aging)
//       'tudo'      -> sem filtro de status, exceto 'cancelado' —
//                      excluído SEMPRE, título cancelado não é
//                      exposição financeira real
//   - Para títulos pago_parcial, o valor usado no extrato é o valor
//     NOMINAL do título (valor total), não o saldo residual descontado
//     de baixas parciais já feitas — mesmo padrão de aging report
//     convencional (mostra o título inteiro, não o líquido). Calcular
//     o saldo residual exato exigiria somar eventos por título, fora
//     de escopo desta v1 — sinalizar se quiser esse refinamento.
// ============================================================

import { supabase } from '@/lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  RelatorioExtratoConsolidado,
  FiltrosExtratoConsolidado,
  ItemExtratoConsolidado,
  TotalPorFaixaAging,
  FaixaAging,
} from '@/types/relatorios'

// ============================================================
// calcularFaixaAging()
// Relativa a CURRENT_DATE no momento da geração — nunca armazenada
// (Seção 2.4)
// ============================================================
function calcularFaixaAging(dataVencimento: string): FaixaAging {
  const hojeIso = new Date().toISOString().slice(0, 10)
  if (dataVencimento >= hojeIso) return 'a_vencer'

  const dias = Math.floor((Date.parse(hojeIso) - Date.parse(dataVencimento)) / 86_400_000)
  if (dias <= 30) return '1_30'
  if (dias <= 60) return '31_60'
  if (dias <= 90) return '61_90'
  return '90_mais'
}

// ============================================================
// gerarRelatorioExtratoConsolidado()
// ============================================================
export async function gerarRelatorioExtratoConsolidado(
  filtros: FiltrosExtratoConsolidado,
  client: SupabaseClient = supabase,
): Promise<RelatorioExtratoConsolidado> {
  const itens: ItemExtratoConsolidado[] = []

  const incluirAPagar = filtros.lado === 'a_pagar' || filtros.lado === 'ambos'
  const incluirAReceber = filtros.lado === 'a_receber' || filtros.lado === 'ambos'

  // ── A Receber ─────────────────────────────────────────────
  if (incluirAReceber) {
    let query = client
      .from('contas_receber')
      .select('data_vencimento, valor, cliente_nome, status')
      .gte('data_vencimento', filtros.dataInicial)
      .lte('data_vencimento', filtros.dataFinal)
      .neq('status', 'cancelado')

    if (filtros.status === 'pago') query = query.in('status', ['pago', 'recebido_pix_ted'])
    if (filtros.status === 'em_aberto') query = query.eq('status', 'em_aberto')

    const { data, error } = await query
    if (error) {
      console.error('[relatorios/extratoConsolidado] erro ao buscar contas_receber:', error)
      throw new Error(error.message)
    }

    for (const t of data ?? []) {
      const emAberto = t.status === 'em_aberto'
      itens.push({
        dataVencimento: t.data_vencimento,
        favorecidoOuCliente: t.cliente_nome,
        valor: Number(t.valor) || 0,
        lado: 'a_receber',
        status: t.status,
        faixa: emAberto ? calcularFaixaAging(t.data_vencimento) : undefined,
      })
    }
  }

  // ── A Pagar ───────────────────────────────────────────────
  if (incluirAPagar) {
    let query = client
      .from('contas_a_pagar')
      .select('data_vencimento, valor, favorecido_nome, status')
      .gte('data_vencimento', filtros.dataInicial)
      .lte('data_vencimento', filtros.dataFinal)
      .neq('status', 'cancelado')

    if (filtros.status === 'pago') query = query.eq('status', 'pago')
    if (filtros.status === 'em_aberto') query = query.in('status', ['em_aberto', 'pago_parcial'])

    const { data, error } = await query
    if (error) {
      console.error('[relatorios/extratoConsolidado] erro ao buscar contas_a_pagar:', error)
      throw new Error(error.message)
    }

    for (const t of data ?? []) {
      const emAberto = t.status === 'em_aberto' || t.status === 'pago_parcial'
      itens.push({
        dataVencimento: t.data_vencimento,
        favorecidoOuCliente: t.favorecido_nome,
        valor: Number(t.valor) || 0,
        lado: 'a_pagar',
        status: t.status,
        faixa: emAberto ? calcularFaixaAging(t.data_vencimento) : undefined,
      })
    }
  }

  itens.sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento))

  // ── Totais por faixa — só itens com faixa calculada (em aberto) ──
  const somaPorFaixa = new Map<FaixaAging, { total: number; quantidade: number }>()
  for (const item of itens) {
    if (!item.faixa) continue
    if (!somaPorFaixa.has(item.faixa)) somaPorFaixa.set(item.faixa, { total: 0, quantidade: 0 })
    const g = somaPorFaixa.get(item.faixa)!
    g.total += item.valor
    g.quantidade += 1
  }

  const ORDEM_FAIXAS: FaixaAging[] = ['a_vencer', '1_30', '31_60', '61_90', '90_mais']
  const totaisPorFaixa: TotalPorFaixaAging[] = ORDEM_FAIXAS
    .filter(faixa => somaPorFaixa.has(faixa))
    .map(faixa => ({ faixa, total: somaPorFaixa.get(faixa)!.total, quantidade: somaPorFaixa.get(faixa)!.quantidade }))

  return {
    filtros,
    totaisPorFaixa,
    itens: filtros.nivelDetalhe === 'detalhado' ? itens : null,
    grafico: {
      tipo: 'barras',
      pontos: totaisPorFaixa.map(f => ({
        rotulo: { a_vencer: 'A vencer', '1_30': '1–30d', '31_60': '31–60d', '61_90': '61–90d', '90_mais': '90+d' }[f.faixa],
        valor: f.total,
      })),
    },
  }
}
