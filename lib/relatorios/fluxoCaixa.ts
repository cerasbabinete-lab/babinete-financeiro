// ============================================================
// lib/relatorios/fluxoCaixa.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Calcula o relatório "Fluxo de caixa realizado" (2.2) —
//         regime de caixa, Entradas (contas_receber liquidados) x
//         Saídas (contas_a_pagar liquidados) no intervalo, por
//         data_baixa.
// Conecta com: types/relatorios.ts (RelatorioFluxoCaixa),
//              pages/api/relatorios/fluxo-caixa.ts
// Referência: Especificacao_Modulo_Relatorios.md, Seção 2.2
//
// CORREÇÃO IMPORTANTE em relação ao texto literal da spec: a Seção
// 2.2 pede status IN ('pago','pago_parcial') e soma de valor_pago
// de contas_receber_eventos para os dois lados (entradas e saídas),
// espelhando 1:1 a lógica de Contas a Pagar. Conferido nesta sessão
// contra o schema REAL (sql/receitas_contas_receber.sql):
//   - contas_receber.status NÃO TEM 'pago_parcial' — o CHECK real é
//     ('em_aberto','pago','recebido_pix_ted','protestado',
//     'enviado_cartorio','cancelado'). 'pago' e 'recebido_pix_ted'
//     são os dois status de título já liquidado.
//   - contas_receber_eventos NÃO TEM coluna valor_pago (só
//     contas_a_pagar_eventos tem — o mecanismo de "pago_parcial" foi
//     desenhado só para o lado Contas a Pagar, casos de acúmulo de
//     retirada de sócio/prestador MEI — não existe do lado cliente).
// Por isso a lógica abaixo é ASSIMÉTRICA de propósito:
//   - Entradas: soma direta de `valor` (não existe parcial neste lado)
//   - Saídas: soma de `valor` quando 'pago', soma de `valor_pago` dos
//     eventos quando 'pago_parcial' — aqui sim, igual à spec
// ============================================================

import { supabase } from '@/lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LancamentoFluxoCaixa, RelatorioFluxoCaixa, FiltroIntervaloDatas } from '@/types/relatorios'
import { formatarMesBR } from '@/lib/relatorios/formatadores'

// ============================================================
// gerarRelatorioFluxoCaixa()
// ============================================================
export async function gerarRelatorioFluxoCaixa(
  filtros: FiltroIntervaloDatas,
  client: SupabaseClient = supabase,
): Promise<RelatorioFluxoCaixa> {
  const lancamentos: LancamentoFluxoCaixa[] = []

  // ── ENTRADAS — contas_receber liquidados, soma direta de valor ──
  const { data: titulosReceber, error: erroReceber } = await client
    .from('contas_receber')
    .select('data_baixa, valor, cliente_nome')
    .in('status', ['pago', 'recebido_pix_ted'])
    .gte('data_baixa', filtros.dataInicial)
    .lte('data_baixa', filtros.dataFinal)

  if (erroReceber) {
    console.error('[relatorios/fluxoCaixa] erro ao buscar contas_receber:', erroReceber)
    throw new Error(erroReceber.message)
  }

  for (const t of titulosReceber ?? []) {
    lancamentos.push({
      data: t.data_baixa,
      descricao: t.cliente_nome ?? '—',
      entrada: Number(t.valor) || 0,
      saida: 0,
    })
  }

  // ── SAÍDAS — contas_a_pagar liquidados ──────────────────────
  const { data: titulosPagar, error: erroPagar } = await client
    .from('contas_a_pagar')
    .select('id, data_baixa, valor, status, favorecido_nome')
    .in('status', ['pago', 'pago_parcial'])
    .gte('data_baixa', filtros.dataInicial)
    .lte('data_baixa', filtros.dataFinal)

  if (erroPagar) {
    console.error('[relatorios/fluxoCaixa] erro ao buscar contas_a_pagar:', erroPagar)
    throw new Error(erroPagar.message)
  }

  const titulosPagos = (titulosPagar ?? []).filter(t => t.status === 'pago')
  const titulosParciais = (titulosPagar ?? []).filter(t => t.status === 'pago_parcial')

  for (const t of titulosPagos) {
    lancamentos.push({
      data: t.data_baixa!,
      descricao: t.favorecido_nome,
      entrada: 0,
      saida: Number(t.valor) || 0,
    })
  }

  // Para os pago_parcial, soma só os eventos de baixa DENTRO do
  // intervalo (não o valor total do título) — Seção 2.2
  if (titulosParciais.length > 0) {
    const idsParciais = titulosParciais.map(t => t.id)
    const { data: eventos, error: erroEventos } = await client
      .from('contas_a_pagar_eventos')
      .select('titulo_id, valor_pago, created_at')
      .in('titulo_id', idsParciais)
      .not('valor_pago', 'is', null)
      .gte('created_at', filtros.dataInicial)
      .lte('created_at', filtros.dataFinal + 'T23:59:59')

    if (erroEventos) {
      console.error('[relatorios/fluxoCaixa] erro ao buscar contas_a_pagar_eventos:', erroEventos)
      throw new Error(erroEventos.message)
    }

    const mapaFavorecido = new Map(titulosParciais.map(t => [t.id, t.favorecido_nome]))
    const somaPorTitulo = new Map<string, number>()
    for (const ev of eventos ?? []) {
      somaPorTitulo.set(ev.titulo_id, (somaPorTitulo.get(ev.titulo_id) ?? 0) + (Number(ev.valor_pago) || 0))
    }

    for (const t of titulosParciais) {
      const somaEventos = somaPorTitulo.get(t.id) ?? 0
      if (somaEventos === 0) continue // nenhum evento de baixa deste título caiu neste intervalo
      lancamentos.push({
        data: t.data_baixa!, // data do último evento conhecido do título, usada só como ordenação
        descricao: mapaFavorecido.get(t.id) ?? '—',
        entrada: 0,
        saida: somaEventos,
      })
    }
  }

  lancamentos.sort((a, b) => a.data.localeCompare(b.data))

  const entradas = lancamentos.reduce((s, l) => s + l.entrada, 0)
  const saidas = lancamentos.reduce((s, l) => s + l.saida, 0)

  // ── Gráfico — barras agrupadas por mês (a spec não define a
  // granularidade do "sub-período" do gráfico; mês é o mesmo padrão
  // já usado no relatório de Faturamento) ────────────────────────
  const porMes = new Map<string, { entradas: number; saidas: number }>()
  for (const l of lancamentos) {
    const mes = l.data.slice(0, 7)
    if (!porMes.has(mes)) porMes.set(mes, { entradas: 0, saidas: 0 })
    const g = porMes.get(mes)!
    g.entradas += l.entrada
    g.saidas += l.saida
  }
  const mesesOrdenados = Array.from(porMes.keys()).sort()

  return {
    periodo: filtros,
    entradas,
    saidas,
    saldoPeriodo: entradas - saidas,
    lancamentos,
    grafico: {
      tipo: 'barras_agrupadas',
      legendaA: 'Entradas',
      legendaB: 'Saídas',
      pontos: mesesOrdenados.map(mes => ({
        rotulo: formatarMesBR(mes),
        valorA: porMes.get(mes)!.entradas,
        valorB: porMes.get(mes)!.saidas,
      })),
    },
  }
}
