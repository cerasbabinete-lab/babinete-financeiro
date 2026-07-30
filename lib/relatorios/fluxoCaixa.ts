// ============================================================
// lib/relatorios/fluxoCaixa.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Calcula o relatório "Fluxo de caixa realizado" (2.2) —
//         regime de caixa, Entradas (contas_receber liquidados) x
//         Saídas (eventos de baixa de contas_a_pagar) no intervalo.
// Conecta com: types/relatorios.ts (RelatorioFluxoCaixa),
//              pages/api/relatorios/fluxo-caixa.ts,
//              lib/relatorios/paginacao.ts (paginarConsulta,
//              dividirEmLotes), lib/relatorios/formatadores.ts
//              (limiteSuperiorIntervalo)
// Referência: Especificacao_Modulo_Relatorios.md, Seção 2.2
//
// CORREÇÃO IMPORTANTE em relação ao texto literal da spec: a Seção
// 2.2 pede status IN ('pago','pago_parcial') e soma de valor_pago
// de contas_receber_eventos para os dois lados (entradas e saídas),
// espelhando 1:1 a lógica de Contas a Pagar. Conferido contra o
// schema REAL (sql/receitas_contas_receber.sql):
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
//   - Saídas: orientada a EVENTO, não a status/data_baixa do título
//     (ver bloco de correção abaixo)
//
// CORREÇÃO CRÍTICA #1 (Handoff_Modulo_Relatorios_Audit_para_QA.md,
// Finding Critical §2.1) — a versão anterior filtrava
// `contas_a_pagar` por `data_baixa` do título (que reflete só o
// ÚLTIMO evento de baixa) e só consultava o histórico de eventos
// para títulos que ainda estivessem, NO MOMENTO da consulta, com
// status='pago_parcial'. Um título pago em duas parcelas em meses
// diferentes (ex: R$500 em junho, R$500 em agosto — mecanismo real
// de `regra_conciliacao_pagar='acumulo_ate_valor_integral'`, usado
// nas notas MEI do Maycon) acabava tendo o pagamento de junho
// INVISÍVEL em qualquer relatório: quando o título vira 'pago' em
// agosto, seu único `data_baixa` é agosto, e a consulta de junho
// nem o traz de volta — o evento de junho nunca é consultado.
//
// FIX: o lado Saídas agora é 100% orientado a evento — consulta
// direta em `contas_a_pagar_eventos` (tipo IN baixa_parcial /
// baixa_total, valor_pago IS NOT NULL, created_at no intervalo) é a
// ÚNICA fonte de verdade. Cada evento vira exatamente 1 lançamento,
// usando a data do PRÓPRIO evento (created_at), nunca a data_baixa
// ou o status atual do título. O título só é consultado de volta
// (por id, em lotes) para obter o favorecido_nome de exibição.
// ============================================================

import { supabase } from '@/lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LancamentoFluxoCaixa, RelatorioFluxoCaixa, FiltroIntervaloDatas } from '@/types/relatorios'
import { formatarMesBR, limiteSuperiorIntervalo } from '@/lib/relatorios/formatadores'
import { paginarConsulta, dividirEmLotes } from '@/lib/relatorios/paginacao'

// Linha mínima usada do lado Entradas
interface LinhaContaReceber {
  data_baixa: string
  valor: number
  cliente_nome: string | null
}

// Linha mínima usada do lado Saídas — vem de contas_a_pagar_eventos,
// não mais de contas_a_pagar diretamente (ver correção no cabeçalho)
interface LinhaEventoPagar {
  titulo_id: string
  valor_pago: number
  created_at: string
}

// ============================================================
// gerarRelatorioFluxoCaixa()
// ============================================================
export async function gerarRelatorioFluxoCaixa(
  filtros: FiltroIntervaloDatas,
  client: SupabaseClient = supabase,
): Promise<RelatorioFluxoCaixa> {
  const lancamentos: LancamentoFluxoCaixa[] = []

  // ── ENTRADAS — contas_receber liquidados, soma direta de valor ──
  // (paginado — Finding Critical §2.2: sem .range(), PostgREST corta
  // silenciosamente em 1000 linhas)
  const titulosReceber = await paginarConsulta<LinhaContaReceber>((inicio, fim) =>
    client
      .from('contas_receber')
      .select('data_baixa, valor, cliente_nome')
      .in('status', ['pago', 'recebido_pix_ted'])
      .gte('data_baixa', filtros.dataInicial)
      .lte('data_baixa', filtros.dataFinal)
      .range(inicio, fim),
  )

  for (const t of titulosReceber) {
    lancamentos.push({
      data: t.data_baixa,
      descricao: t.cliente_nome ?? '—',
      entrada: Number(t.valor) || 0,
      saida: 0,
    })
  }

  // ── SAÍDAS — orientado a evento, não a status/data_baixa do
  // título (correção crítica, ver cabeçalho do arquivo) ──────────
  const eventosPagar = await paginarConsulta<LinhaEventoPagar>((inicio, fim) =>
    client
      .from('contas_a_pagar_eventos')
      .select('titulo_id, valor_pago, created_at')
      .in('tipo', ['baixa_parcial', 'baixa_total'])
      .not('valor_pago', 'is', null)
      .gte('created_at', filtros.dataInicial)
      .lte('created_at', limiteSuperiorIntervalo(filtros.dataFinal))
      .range(inicio, fim),
  )

  // Busca favorecido_nome dos títulos referenciados pelos eventos
  // encontrados — só para exibição, nunca para decidir valor/data.
  // Em lotes (dividirEmLotes) porque o conjunto de titulo_id únicos
  // cresce com o histórico e uma cláusula IN não deve crescer sem
  // limite (Finding Critical §2.2, mesmo espírito aplicado aqui)
  const idsTitulosUnicos = Array.from(new Set(eventosPagar.map(ev => ev.titulo_id)))
  const mapaFavorecido = new Map<string, string>()

  for (const lote of dividirEmLotes(idsTitulosUnicos)) {
    if (lote.length === 0) continue
    const titulos = await paginarConsulta<{ id: string; favorecido_nome: string }>((inicio, fim) =>
      client
        .from('contas_a_pagar')
        .select('id, favorecido_nome')
        .in('id', lote)
        .range(inicio, fim),
    )
    for (const t of titulos) {
      mapaFavorecido.set(t.id, t.favorecido_nome)
    }
  }

  for (const ev of eventosPagar) {
    lancamentos.push({
      data: ev.created_at,
      descricao: mapaFavorecido.get(ev.titulo_id) ?? '—',
      entrada: 0,
      saida: Number(ev.valor_pago) || 0,
    })
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
