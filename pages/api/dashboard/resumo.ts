// ============================================================
// pages/api/dashboard/resumo.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Dashboard (NOVO)
// Função: Endpoint único que devolve Card Verde (Receitas), Card
//         Vermelho (Despesas) e os dados do gráfico de barras
//         agrupadas "Fluxo do Mês" (a receber x a pagar, por dia),
//         numa chamada só (Especificacao_Modulo_Dashboard.md, Seção
//         10: "cards + daily chart data, one call").
//         100% leitura — não grava nada. Reaproveita
//         buscarTitulos() de Contas a Pagar e Contas a Receber
//         (chamados como estão, sem parâmetro novo — Seção 0, regra
//         4) e gerarRelatorioFaturamento() de Relatórios (Seção 2).
//         A única agregação nova deste arquivo é: (1) a soma de
//         valor_frete de receitas (não existe função pronta pra
//         isso) e (2) o agrupamento dia-a-dia do gráfico (Seção 4:
//         "This is new aggregation logic").
// Conecta com: lib/contasAPagarService.ts (buscarTitulos,
//              formatarMoeda — não usado aqui, só citado por
//              referência), lib/contasReceberService.ts
//              (buscarTitulos), lib/relatorios/faturamento.ts
//              (gerarRelatorioFaturamento), lib/relatorios/
//              formatadores.ts (limiteSuperiorIntervalo — mesma
//              correção de fuso do Finding §6.4 do módulo
//              Relatórios), lib/relatorios/paginacao.ts
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

// Reaproveita a MESMA agregação de Receita Bruta já usada pelo
// relatório Faturamento por período — Seção 2, "reuse this function,
// do not reimplement the aggregation"
import { gerarRelatorioFaturamento } from '@/lib/relatorios/faturamento'

// Mesmo helper de limite superior de intervalo com fuso explícito já
// usado em todo o módulo Relatórios (Finding §6.4) — reaproveitado
// aqui pela consulta nova de SUM(valor_frete), que não existe em
// nenhum arquivo de serviço pronto
import { limiteSuperiorIntervalo } from '@/lib/relatorios/formatadores'

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
// somaFreteReceitasMes()
// SUM(receitas.valor_frete) no período informado — agregação NOVA,
// nenhuma função de serviço existente devolve esse campo (Seção 2:
// "receitas.valor_frete já existe, zero mudança de schema
// necessária" — mas nenhum arquivo de lib/relatorios/ SELECIONA essa
// coluna hoje). Usada tanto na Linha 3 do Card Verde (dedução) quanto
// na Linha 3 do Card Vermelho (mesmo número, informativo) — Seção 2 e
// 3 confirmam explicitamente que é "the same underlying number"
// ============================================================
async function somaFreteReceitasMes(
  client: SupabaseClient,
  primeiroDiaMes: string,
  ultimoDiaMes: string,
): Promise<number> {
  const linhas = await paginarConsulta<{ valor_frete: number }>((inicio, fim) =>
    client
      .from('receitas')
      .select('valor_frete')
      .gte('data_emissao', primeiroDiaMes)
      .lte('data_emissao', limiteSuperiorIntervalo(ultimoDiaMes))
      .range(inicio, fim),
  )
  return linhas.reduce((soma, r) => soma + (Number(r.valor_frete) || 0), 0)
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
    })
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

    // Linha 3 — valor de fretes das notas EMITIDAS no mês corrente
    // (Seção 3: "for notes issued in the current month") — puramente
    // informativo, nunca somado nas linhas 1/2 (regra travada)
    const valorFretesMes = await somaFreteReceitasMes(supabaseAdmin, primeiroDiaMes, ultimoDiaMes)

    const cardDespesas: DashboardCardDespesas = {
      totalLancadoMes,
      totalPagoAteHoje,
      valorFretesMes,
    }

    // ── 3. Card Verde — Receitas (Seção 2) ───────────────────────

    // Linha 1 — valor a receber no mês: só status 'em_aberto'
    // (decisão confirmada com Maycon nesta sessão — exclui
    // protestado/enviado_cartorio, tratados como bucket jurídico à
    // parte, fora do Card/gráfico/lista)
    const valorAReceberMes = titulosReceberMes
      .filter(t => t.status === 'em_aberto')
      .reduce((soma, t) => soma + (Number(t.valor) || 0), 0)

    // Linha 2 — valor já recebido até hoje, dentro do mês: títulos
    // liquidados (status 'pago' OU 'recebido_pix_ted' — os dois são
    // formas de liquidação em Contas a Receber, StatusTitulo não tem
    // pago_parcial neste módulo, diferente de Pagar — confirmado em
    // types/contasReceber.ts), com data_baixa até hoje
    const valorRecebidoAteHoje = titulosReceberMes
      .filter(t => (t.status === 'pago' || t.status === 'recebido_pix_ted') && (!t.data_baixa || t.data_baixa <= hojeIso))
      .reduce((soma, t) => soma + (Number(t.valor) || 0), 0)

    // Linha 3 — faturamento do mês, líquido de frete. Reaproveita
    // gerarRelatorioFaturamento() (mesma Receita Bruta do relatório
    // Faturamento por período, Seção 2: "reuse this function, do not
    // reimplement the aggregation") e subtrai o mesmo valorFretesMes
    // já calculado acima pro Card Vermelho — é o MESMO número (Seção
    // 2: "same underlying number as... Card Vermelho line 3")
    const relatorioFaturamentoMes = await gerarRelatorioFaturamento(
      { dataInicial: primeiroDiaMes, dataFinal: ultimoDiaMes },
      supabaseAdmin,
    )
    const faturamentoLiquidoFrete = relatorioFaturamentoMes.totalizador.receitaBruta - valorFretesMes

    const cardReceitas: DashboardCardReceitas = {
      valorAReceberMes,
      valorRecebidoAteHoje,
      faturamentoLiquidoFrete,
    }

    // ── 4. Gráfico de barras agrupadas — Fluxo do Mês (Seção 4) ──
    // Agregação nova (agrupamento por dia) — "a receber" usa a MESMA
    // lógica de status da Linha 1 do Card Verde (em_aberto), "a
    // pagar" usa a mesma lógica de status confirmada pra Lista a
    // Pagar (em_aberto + pago_parcial) — não a Linha 1 do Card
    // Vermelho (que não filtra status). Confirmado com Maycon: o
    // gráfico mostra o que ainda está EM ABERTO por dia, não o total
    // lançado — visão tática de "o que ainda precisa de ação",
    // coerente com o propósito do módulo (Seção 1)
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
