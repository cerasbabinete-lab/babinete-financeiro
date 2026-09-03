// ============================================================
// pages/api/dashboard/resumo.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Dashboard (NOVO)
// Função: Endpoint único que devolve Card Verde (Receitas), Card
//         Vermelho (Despesas) e os dados do gráfico de barras
//         agrupadas "Fluxo do Mês" (a receber x a pagar, por dia),
//         numa chamada só (Especificacao_Modulo_Dashboard.md, Seção
//         10: "cards + daily chart data, one call").
//         100% leitura — não grava nada. Reaproveita buscarTitulos()
//         de Contas a Pagar e Contas a Receber. buscarTitulosPagar()
//         é chamada como está, sem parâmetro novo. buscarTitulosReceber()
//         RECEBE supabaseAdmin como 2º argumento (fix desta sessão —
//         ver nota abaixo) — contas_receber tem RLS ativo restrito a
//         'authenticated', e o client anônimo (usado sem esse
//         argumento) roda como 'anon' no servidor, sem sessão, e é
//         bloqueado silenciosamente (zero erro, zero linha). Mesmo
//         bug já corrigido em pages/api/dashboard/titulos.ts e na
//         própria lib/contasReceberService.ts::buscarTitulos()
//         (parâmetro client opcional, default preserva compatibilidade
//         com todo caller existente que não passa esse argumento).
//         REVISÃO DE FÓRMULAS (sessão desta entrega, confirmada com
//         Maycon): "A receber no mês" e "Lançado no mês" passam a
//         ser bruto total (todos os status, sem dedução — só
//         crescem, nunca deduzem o que já foi pago/recebido). O
//         frete deixou de vir de receitas.valor_frete/
//         gerarRelatorioFaturamento (sempre zerado na prática) — ver
//         calcularFreteMes() (Despesas, filtra despesas por
//         categoria_financeira = 'transporte_frete') e
//         calcularRepasseFreteMes() (Receitas, rateia valor_frete da
//         receita de origem pelo nº de parcelas ativas) abaixo.
// Conecta com: lib/contasAPagarService.ts (buscarTitulos,
//              formatarMoeda — não usado aqui, só citado por
//              referência), lib/contasReceberService.ts
//              (buscarTitulos), lib/relatorios/paginacao.ts
//              (paginarConsulta — mesma correção do Finding
//              Critical §2.2, PostgREST corta em 1000 linhas sem
//              .range()), types/dashboard.ts,
//              components/dashboard/CardReceitas.tsx,
//              CardDespesas.tsx, GraficoFluxoDiario.tsx (consomem
//              esta resposta)
// Referência: Especificacao_Modulo_Dashboard.md, Seções 2, 3, 4 e 9
//             (decisões de status confirmadas com Maycon nesta sessão)
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

// buscarTitulos() de cada módulo — chamadas como estão, sem
// modificação nem parâmetro novo (Seção 0, regra 4). Nenhuma delas
// recebe client injetado (usam o client interno do próprio arquivo
// de serviço) — funcionam normalmente aqui porque não dependem de
// RLS (módulos sem RLS configurado, gap conhecido documentado nos
// próprios arquivos de serviço) e as env vars NEXT_PUBLIC_ ficam
// disponíveis tanto no client quanto no server em Next.js
import { buscarTitulos as buscarTitulosPagar } from '@/lib/contasAPagarService'
import { buscarTitulos as buscarTitulosReceber } from '@/lib/contasReceberService'

// Mesmo helper de paginação já usado em todo o módulo Relatórios
// (Finding Critical §2.2 — sem .range(), PostgREST corta
// silenciosamente em 1000 linhas, sem erro visível)
import { paginarConsulta } from '@/lib/relatorios/paginacao'

import type { ContaAPagar } from '@/types/contasAPagar'
import type { ContaReceber } from '@/types/contasReceber'
import type { PontoGraficoAgrupado } from '@/types/relatorios'
import type { DashboardResumoResponse, DashboardCardReceitas, DashboardCardDespesas } from '@/types/dashboard'

// ============================================================
// getSupabaseAdmin() — mesmo padrão local-por-rota já usado em
// pages/api/pagar/gerar-boleto-avulso.ts, atualizar.ts,
// pages/api/despesas/importar-documento.ts
// ============================================================
function getSupabaseAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ============================================================
// pad2() — zero à esquerda pra montar data ISO (YYYY-MM-DD) e
// rótulo de dia ("01", "02"...) manualmente
// ============================================================
function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// ============================================================
// PeriodoMesCorrente — { ano, mes (1-indexed), diasNoMes,
// primeiroDiaMes, ultimoDiaMes, hojeIso }, todos calculados a partir
// do fuso de São Paulo, não do fuso do servidor (que roda em UTC em
// produção/Vercel) — evita virar o dia/mês errado perto da meia-noite
// BRT, que ainda é o dia anterior em UTC. Único ponto do arquivo que
// calcula data/hora "agora" — todo o resto do arquivo só recebe essas
// strings já prontas, não chama new Date() de novo
// ============================================================
interface PeriodoMesCorrente {
  ano: number
  mes: number // 1-indexed (1 = janeiro), como vem do Intl.DateTimeFormat abaixo
  diasNoMes: number
  primeiroDiaMes: string // 'YYYY-MM-01'
  ultimoDiaMes: string   // 'YYYY-MM-{últimoDia}'
  hojeIso: string         // 'YYYY-MM-DD' — data de hoje em São Paulo
}

function calcularPeriodoMesCorrente(): PeriodoMesCorrente {
  // 'en-CA' formata Y-M-D nativamente (truque conhecido do
  // Intl.DateTimeFormat) — timeZone explícito garante que "hoje" é o
  // dia civil em São Paulo, não em UTC
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const [anoStr, mesStr, diaStr] = fmt.format(new Date()).split('-')
  const ano = Number(anoStr)
  const mes = Number(mesStr) // 1-indexed
  const hojeIso = `${anoStr}-${mesStr}-${diaStr}`

  // new Date(ano, mes, 0) — o "0" pede o último dia do mês ANTERIOR
  // ao índice passado. Como `mes` aqui já é 1-indexed (ex: 7 =
  // julho) e o construtor do Date espera índice 0-indexed (0 =
  // janeiro), passar `mes` diretamente aponta pro mês seguinte em
  // termos 0-indexed — ou seja, dia 0 desse "mês seguinte" é
  // exatamente o último dia do mês corrente (1-indexed). Truque
  // padrão de JS, sem depender de biblioteca de datas
  const diasNoMes = new Date(ano, mes, 0).getDate()

  return {
    ano,
    mes,
    diasNoMes,
    primeiroDiaMes: `${anoStr}-${mesStr}-01`,
    ultimoDiaMes: `${anoStr}-${mesStr}-${pad2(diasNoMes)}`,
    hojeIso,
  }
}

// ============================================================
// calcularFreteMes()
// MUDANÇA DESTA SESSÃO — substitui somaFreteReceitasMes() (fonte
// antiga, receitas.valor_frete, sempre zerada na prática). Filtra os
// títulos de Contas a Pagar do mês (titulosPagarMes, já buscados uma
// vez pelo handler) pela categoria_financeira da despesa de origem
// ('transporte_frete') e devolve dois números na mesma passada, sem
// consulta nova ao banco além da busca de categoria:
//   - valorFreteNoMes: soma de TODOS esses títulos (qualquer status)
//     — "Frete no mês", cresce com fretes novos lançados até o fim
//     do mês
//   - valorFretePagoMes: soma só dos eventos de baixa até hoje —
//     mesmo raciocínio de totalPagoAteHoje, filtrado por categoria
// Ambos puramente informativos — nunca somados em totalLancadoMes/
// totalPagoAteHoje (regra travada original, mantida)
// ============================================================
async function calcularFreteMes(
  client: SupabaseClient,
  titulosPagarMes: ContaAPagar[],
  fimDeHojeMs: number,
): Promise<{ valorFreteNoMes: number; valorFretePagoMes: number }> {
  const despesaIds = Array.from(
    new Set(titulosPagarMes.map(t => t.despesa_id).filter((id): id is string => Boolean(id))),
  )
  if (despesaIds.length === 0) return { valorFreteNoMes: 0, valorFretePagoMes: 0 }

  const { data: despesasLinhas, error } = await client
    .from('despesas')
    .select('id, categoria_financeira')
    .in('id', despesaIds)
  if (error) throw error

  const idsFrete = new Set(
    (despesasLinhas ?? [])
      .filter(d => d.categoria_financeira === 'transporte_frete')
      .map(d => d.id as string),
  )
  if (idsFrete.size === 0) return { valorFreteNoMes: 0, valorFretePagoMes: 0 }

  let valorFreteNoMes = 0
  let valorFretePagoMes = 0
  for (const titulo of titulosPagarMes) {
    if (!titulo.despesa_id || !idsFrete.has(titulo.despesa_id)) continue
    valorFreteNoMes += Number(titulo.valor) || 0
    for (const evento of titulo.eventos ?? []) {
      if (
        (evento.tipo === 'baixa_parcial' || evento.tipo === 'baixa_total') &&
        new Date(evento.created_at).getTime() <= fimDeHojeMs
      ) {
        valorFretePagoMes += Number(evento.valor_pago) || 0
      }
    }
  }
  return { valorFreteNoMes, valorFretePagoMes }
}

// ============================================================
// calcularRepasseFreteMes()
// Para cada título de Contas a Receber do mês (MUDANÇA DESTA SESSÃO:
// recebe titulosReceberMes — TODOS os status, não só 'em_aberto',
// acompanhando a mudança de valorAReceberMes deixar de filtrar
// status), busca a receita de origem (contas_receber.receita_id) e
// divide o valor_frete dela pelo número de títulos a receber ATIVOS
// (não deletados) que essa receita gerou NO TOTAL — não só os deste
// mês, porque uma receita parcelada pode ter parcelas vencendo em
// meses diferentes, e o frete se reparte pelo total de parcelas
// dela, não só pelas que caem neste mês
// ============================================================
async function calcularRepasseFreteMes(
  client: SupabaseClient,
  titulosReceberMes: ContaReceber[],
): Promise<number> {
  const receitaIds = Array.from(
    new Set(titulosReceberMes.map(t => t.receita_id).filter((id): id is string => Boolean(id))),
  )
  if (receitaIds.length === 0) return 0

  const { data: receitasLinhas, error: erroReceitas } = await client
    .from('receitas')
    .select('id, valor_frete')
    .in('id', receitaIds)
  if (erroReceitas) throw erroReceitas
  const freteReceitaPorId = new Map<string, number>(
    (receitasLinhas ?? []).map(r => [r.id as string, Number(r.valor_frete) || 0]),
  )

  // Conta TODAS as parcelas ativas de cada receita envolvida (não só
  // as deste mês) — .range() via paginarConsulta pra não cortar em
  // 1000 linhas em bases maiores
  const linhasParcelas = await paginarConsulta<{ receita_id: string | null; deleted_at: string | null }>(
    (inicio, fim) =>
      client
        .from('contas_receber')
        .select('receita_id, deleted_at')
        .in('receita_id', receitaIds)
        .range(inicio, fim),
  )
  const parcelasAtivasPorReceita = new Map<string, number>()
  for (const linha of linhasParcelas) {
    if (linha.deleted_at || !linha.receita_id) continue
    parcelasAtivasPorReceita.set(
      linha.receita_id,
      (parcelasAtivasPorReceita.get(linha.receita_id) ?? 0) + 1,
    )
  }

  let total = 0
  for (const titulo of titulosReceberMes) {
    if (!titulo.receita_id) continue
    const freteTotalReceita = freteReceitaPorId.get(titulo.receita_id) ?? 0
    if (freteTotalReceita === 0) continue
    const numParcelas = parcelasAtivasPorReceita.get(titulo.receita_id) ?? 1
    total += freteTotalReceita / numParcelas
  }
  return total
}

// ============================================================
// HANDLER
// ============================================================
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ erro: 'Método não permitido' })
  }

  // ── Auth — mesmo padrão de todo pages/api/ do projeto ───────
  const token = (req.headers.authorization ?? '').replace('Bearer ', '').trim() || null
  if (!token) return res.status(401).json({ erro: 'Não autorizado' })

  const supabaseAdmin = getSupabaseAdmin()
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ erro: 'Não autorizado' })

  try {
    const { diasNoMes, primeiroDiaMes, ultimoDiaMes, hojeIso } = calcularPeriodoMesCorrente()

    // ── 1. Busca os títulos do mês, uma vez só, reaproveitados em
    // vários cálculos abaixo (Cards + gráfico) sem refazer a consulta
    // ────────────────────────────────────────────────────────────

    // Contas a Pagar — SEM filtro de status: buscarTitulos() já
    // exclui 'cancelado' automaticamente quando o status vem vazio
    // (cancelado = soft-delete, deleted_at preenchido — confirmado
    // lendo lib/contasAPagarService.ts). Resultado inclui
    // em_aberto + pago_parcial + pago — exatamente a população da
    // Linha 1 do Card Vermelho ("lançado no mês", sem filtrar status)
    const titulosPagarMes: ContaAPagar[] = await buscarTitulosPagar({
      busca: '',
      vencimentoDe: primeiroDiaMes,
      vencimentoAte: ultimoDiaMes,
      status: '',
    })

    // Contas a Receber — AQUI o comportamento de buscarTitulos() é
    // diferente do de Pagar: com status vazio, ele NÃO exclui
    // cancelado (confirmado lendo lib/contasReceberService.ts — só
    // aplica .is('deleted_at', null) quando ordenando, nunca como
    // filtro WHERE). Por isso filtramos deleted_at manualmente logo
    // abaixo, em vez de confiar no comportamento default da função
    const titulosReceberMesBruto: ContaReceber[] = await buscarTitulosReceber({
      busca: '',
      vencimentoDe: primeiroDiaMes,
      vencimentoAte: ultimoDiaMes,
      status: '',
    }, supabaseAdmin)
    const titulosReceberMes = titulosReceberMesBruto.filter(t => !t.deleted_at)

    // ── 2. Card Vermelho — Despesas (Seção 3) ────────────────────

    // Linha 1 — total lançado no mês: soma de TODOS os títulos do
    // mês, independente de status (população já filtrada acima)
    const totalLancadoMes = titulosPagarMes.reduce((soma, t) => soma + (Number(t.valor) || 0), 0)

    // Linha 2 — total já pago até hoje: soma de valor_pago dos
    // eventos de baixa (parcial ou total) de cada título do mês,
    // limitado a hoje. Mesmo princípio do Fluxo de Caixa
    // (Especificacao_Modulo_Relatorios.md, 2.2: "para pago_parcial,
    // usar a soma de valor_pago dos eventos... não o valor total do
    // título") — soma eventos, não o campo `valor` do título, porque
    // um título pago_parcial não tem o valor pago guardado em nenhum
    // campo direto na tabela contas_a_pagar (só nos eventos)
    // Fim do dia de hoje em São Paulo, com offset explícito -03:00 — evento.created_at
    // vem do Postgres como ISO UTC ('Z'), então comparar strings com offsets diferentes
    // por ordem lexicográfica não reflete ordem cronológica real (mesmo raciocínio de
    // dataDentroDoIntervalo() em lib/relatorios/formatadores.ts). Aqui comparamos por
    // timestamp (getTime()), não por string, evitando o bug do Audit §3.1 — pagamentos
    // registrados entre ~21h e 23:59:59 BRT ficavam de fora do total até a virada do dia
    const fimDeHojeMs = new Date(`${hojeIso}T23:59:59.999-03:00`).getTime()
    let totalPagoAteHoje = 0
    for (const titulo of titulosPagarMes) {
      for (const evento of titulo.eventos ?? []) {
        if (
          (evento.tipo === 'baixa_parcial' || evento.tipo === 'baixa_total') &&
          new Date(evento.created_at).getTime() <= fimDeHojeMs
        ) {
          totalPagoAteHoje += Number(evento.valor_pago) || 0
        }
      }
    }

    // Linha 3 (badge 2 colunas) — MUDANÇA DESTA SESSÃO: frete no mês
    // (total) + frete pago no mês, ambos filtrados por
    // categoria_financeira = 'transporte_frete' — ver calcularFreteMes()
    // acima. Puramente informativo, nunca somado nas linhas 1/2
    // (regra travada mantida)
    const { valorFreteNoMes, valorFretePagoMes } = await calcularFreteMes(supabaseAdmin, titulosPagarMes, fimDeHojeMs)

    const cardDespesas: DashboardCardDespesas = {
      totalLancadoMes,
      totalPagoAteHoje,
      valorFreteNoMes,
      valorFretePagoMes,
    }

    // ── 3. Card Verde — Receitas (Seção 2) ───────────────────────

    // Linha 1, coluna esquerda — "A receber no mês": bruto total,
    // SEM filtro de status, EXCETO 'protestado' e 'enviado_cartorio'
    // — decisão confirmada com Maycon: título nesses dois status fica
    // de fora do bruto até ser efetivamente liquidado (aí muda de
    // status pra 'pago'/'recebido_pix_ted' e entra na soma
    // naturalmente, sem tratamento especial — os status são mutuamente
    // exclusivos, StatusTitulo confirma). Fora essa exclusão, soma
    // em_aberto + pago + recebido_pix_ted — só cresce (novas vendas
    // com vencimento até o fim do mês), nunca deduz o que já foi
    // recebido. Mesma população usada no repasse de frete abaixo
    // (Linha 1 direita), pra bruto e líquido ficarem consistentes
    const titulosReceberMesParaCard = titulosReceberMes.filter(
      t => t.status !== 'protestado' && t.status !== 'enviado_cartorio',
    )
    const valorAReceberMes = titulosReceberMesParaCard
      .reduce((soma, t) => soma + (Number(t.valor) || 0), 0)

    // Linha 1, coluna direita — "A receber no mês (líquido)": bruto
    // novo menos o repasse de frete, calculado sobre a MESMA
    // população acima (exclui protestado/enviado_cartorio, pelo mesmo
    // motivo — não faz sentido ratear frete de título que nem está
    // contando no bruto)
    const valorRepasseFrete = await calcularRepasseFreteMes(supabaseAdmin, titulosReceberMesParaCard)
    const valorAReceberMesLiquido = valorAReceberMes - valorRepasseFrete

    // Linha 2, coluna esquerda — valor já recebido até hoje, dentro
    // do mês: títulos liquidados (status 'pago' OU 'recebido_pix_ted'
    // — os dois são formas de liquidação em Contas a Receber,
    // StatusTitulo não tem pago_parcial neste módulo, diferente de
    // Pagar — confirmado em types/contasReceber.ts), com data_baixa
    // até hoje. Comportamento inalterado nesta sessão
    const valorRecebidoAteHoje = titulosReceberMes
      .filter(t => (t.status === 'pago' || t.status === 'recebido_pix_ted') && (!t.data_baixa || t.data_baixa <= hojeIso))
      .reduce((soma, t) => soma + (Number(t.valor) || 0), 0)

    const cardReceitas: DashboardCardReceitas = {
      valorAReceberMes,
      valorAReceberMesLiquido,
      valorRecebidoAteHoje,
      valorRepasseFrete,
    }

    // ── 4. Gráfico de barras agrupadas — Fluxo do Mês (Seção 4) ──
    // Agregação nova (agrupamento por dia) — filtro de status
    // INALTERADO nesta sessão (a mudança de fórmula desta sessão foi
    // só nos Cards, não no gráfico): "a receber" usa status
    // 'em_aberto', "a pagar" usa a mesma lógica confirmada pra Lista
    // a Pagar (em_aberto + pago_parcial). Gráfico mostra o que ainda
    // está EM ABERTO por dia, não o total lançado — visão tática de
    // "o que ainda precisa de ação", coerente com o propósito do
    // módulo (Seção 1). Diferente agora das Linhas 1 dos dois Cards
    // (bruto total, sem filtro de status) — divergência intencional,
    // confirmada com Maycon: gráfico é ação pendente, Card é visão
    // total do mês
    const pontos: PontoGraficoAgrupado[] = []
    for (let dia = 1; dia <= diasNoMes; dia++) {
      const dataDoDia = `${primeiroDiaMes.slice(0, 8)}${pad2(dia)}` // 'YYYY-MM-' + dia

      const valorA = titulosReceberMes // "a receber" — verde
        .filter(t => t.status === 'em_aberto' && t.data_vencimento === dataDoDia)
        .reduce((soma, t) => soma + (Number(t.valor) || 0), 0)

      const valorB = titulosPagarMes // "a pagar" — vermelho
        .filter(t => (t.status === 'em_aberto' || t.status === 'pago_parcial') && t.data_vencimento === dataDoDia)
        .reduce((soma, t) => soma + (Number(t.valor) || 0), 0)

      pontos.push({ rotulo: pad2(dia), valorA, valorB })
    }

    const resposta: DashboardResumoResponse = {
      cardReceitas,
      cardDespesas,
      graficoFluxoDiario: {
        tipo: 'barras_agrupadas',
        pontos,
        legendaA: 'A Receber',
        legendaB: 'A Pagar',
      },
    }

    return res.status(200).json(resposta)

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[dashboard/resumo] error:', msg)
    return res.status(500).json({ erro: msg })
  }
}
