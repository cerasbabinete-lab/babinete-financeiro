// ============================================================
// lib/relatorios/extratoConsolidado.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Calcula o relatório "Extrato consolidado" (2.4) — união
//         de contas_a_pagar e contas_receber, com aging para itens
//         em aberto.
// Conecta com: types/relatorios.ts (RelatorioExtratoConsolidado),
//              pages/api/relatorios/extrato-consolidado.ts,
//              lib/relatorios/paginacao.ts (paginarConsulta)
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
//       'em_aberto' -> contas_receber: status IN (em_aberto,
//                      protestado, enviado_cartorio) — ver correção
//                      High §3.1 abaixo
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
//
// CORREÇÃO HIGH §3.1 (Handoff_Modulo_Relatorios_Audit_para_QA.md) —
// a versão anterior classificava como "em aberto" (filtro de status
// E cálculo de faixa de aging) só o status literal 'em_aberto'. O
// schema real de contas_receber tem também 'protestado' e
// 'enviado_cartorio' — recebíveis em cobrança/cartório, a categoria
// de exposição em aberto mais grave que a empresa pode ter. Estavam
// sendo excluídos tanto do filtro "em aberto" quanto dos totais de
// aging (apareciam na lista "tudo", mas sem faixa e sem entrar nos
// cartões de total por faixa). Fix: os dois pontos abaixo passam a
// tratar ('em_aberto','protestado','enviado_cartorio') como um
// único grupo "em aberto" para fins deste relatório.
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
import { paginarConsulta } from '@/lib/relatorios/paginacao'

// Status de contas_receber tratados como "em aberto" para fins deste
// relatório — usado nos dois pontos que precisam do mesmo critério
// (filtro de busca e classificação de aging), fonte única para não
// os dois se dessincronizarem de novo (era exatamente o bug do
// Finding §3.1: o filtro de busca e o cálculo de aging podiam, em
// teoria, divergir por serem duas listas hardcoded separadas)
const STATUS_RECEBER_EM_ABERTO = ['em_aberto', 'protestado', 'enviado_cartorio'] as const

interface LinhaContaReceberExtrato {
  data_vencimento: string
  valor: number
  cliente_nome: string
  status: string
}

interface LinhaContaPagarExtrato {
  data_vencimento: string
  valor: number
  favorecido_nome: string
  status: string
}

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
    const linhasReceber = await paginarConsulta<LinhaContaReceberExtrato>((inicio, fim) => {
      let query = client
        .from('contas_receber')
        .select('data_vencimento, valor, cliente_nome, status')
        .gte('data_vencimento', filtros.dataInicial)
        .lte('data_vencimento', filtros.dataFinal)
        .neq('status', 'cancelado')

      if (filtros.status === 'pago') query = query.in('status', ['pago', 'recebido_pix_ted'])
      // Correção High §3.1 — inclui protestado/enviado_cartorio no
      // grupo "em aberto", não só o status literal 'em_aberto'
      if (filtros.status === 'em_aberto') query = query.in('status', [...STATUS_RECEBER_EM_ABERTO])

      return query.range(inicio, fim)
    })

    for (const t of linhasReceber) {
      const emAberto = (STATUS_RECEBER_EM_ABERTO as readonly string[]).includes(t.status)
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
    const linhasPagar = await paginarConsulta<LinhaContaPagarExtrato>((inicio, fim) => {
      let query = client
        .from('contas_a_pagar')
        .select('data_vencimento, valor, favorecido_nome, status')
        .gte('data_vencimento', filtros.dataInicial)
        .lte('data_vencimento', filtros.dataFinal)
        .neq('status', 'cancelado')

      if (filtros.status === 'pago') query = query.eq('status', 'pago')
      if (filtros.status === 'em_aberto') query = query.in('status', ['em_aberto', 'pago_parcial'])

      return query.range(inicio, fim)
    })

    for (const t of linhasPagar) {
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
