// ============================================================
// pages/api/dashboard/rankings.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Dashboard (NOVO)
// Função: Endpoint único que devolve os dois rankings do Dashboard
//         — Top 10 Clientes que Mais Compraram (Seção 7, reaproveita
//         gerarRelatorioCurvaAbc('clientes', ...) direto) e Top 10
//         Clientes Sem Comprar Há Mais Tempo (Seção 8, agregação
//         nova — não existe função pronta pra isso) — numa chamada
//         só (Seção 10: "both ranking lists, period params, one call").
//         100% leitura.
// Conecta com: lib/relatorios/curvaAbc.ts (gerarRelatorioCurvaAbc),
//              lib/relatorios/formatadores.ts
//              (limiteSuperiorIntervalo), lib/relatorios/paginacao.ts
//              (paginarConsulta), types/dashboard.ts,
//              components/dashboard/RankingClientes.tsx (consome
//              esta resposta)
// Referência: Especificacao_Modulo_Dashboard.md, Seções 7, 8 e 9
//             (formato de exibição do tempo confirmado com Maycon
//             nesta sessão: dias corridos)
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

// Reaproveita a MESMA agregação já usada pela dimensão 'clientes' da
// Curva ABC — Seção 7: "Reuse this function directly, do not
// reimplement the client-revenue aggregation"
import { gerarRelatorioCurvaAbc } from '@/lib/relatorios/curvaAbc'

// Mesmos dois helpers de Relatórios já reaproveitados em
// pages/api/dashboard/resumo.ts, usados aqui pela agregação NOVA do
// Ranking de Inativos (Seção 8 — "no direct existing function to call")
import { limiteSuperiorIntervalo } from '@/lib/relatorios/formatadores'
import { paginarConsulta } from '@/lib/relatorios/paginacao'

import type { FiltroIntervaloDatas } from '@/types/relatorios'
import type {
  DashboardRankingsResponse,
  DashboardRankingClienteTop,
  DashboardRankingClienteInativo,
} from '@/types/dashboard'

// ============================================================
// getSupabaseAdmin() — mesmo padrão local-por-rota de todo pages/api/
// ============================================================
function getSupabaseAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ============================================================
// calcularPeriodoMesCorrente() — mesmo cálculo (fuso de São Paulo)
// de pages/api/dashboard/resumo.ts, duplicado aqui pelo mesmo motivo
// de pages/api/dashboard/titulos.ts (Seção 0/regra 3 — sem arquivo
// lib/dashboard/ novo). Usado só como DEFAULT do filtro de período do
// Top Clientes (Seção 7: "default = current month") — o usuário pode
// sobrescrever via query string
// ============================================================
function calcularPeriodoMesCorrente(): { primeiroDiaMes: string; ultimoDiaMes: string; hojeIso: string } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const [anoStr, mesStr, diaStr] = fmt.format(new Date()).split('-')
  const ano = Number(anoStr)
  const mes = Number(mesStr)
  const diasNoMes = new Date(ano, mes, 0).getDate() // mesmo truque de resumo.ts

  return {
    primeiroDiaMes: `${anoStr}-${mesStr}-01`,
    ultimoDiaMes: `${anoStr}-${mesStr}-${String(diasNoMes).padStart(2, '0')}`,
    hojeIso: `${anoStr}-${mesStr}-${diaStr}`,
  }
}

// ============================================================
// subtrairMeses() — usado só como DEFAULT do piso do Ranking de
// Inativos (Seção 8: "default = last 6 months"). Deixa o próprio
// construtor Date fazer o rollover de mês/ano — mesma abordagem de
// baixo risco já usada em calcularPeriodoMesCorrente() acima
// ============================================================
function subtrairMeses(dataIso: string, meses: number): string {
  const [ano, mes, dia] = dataIso.split('-').map(Number)
  const d = new Date(ano, mes - 1 - meses, dia) // mes-1: Date usa mês 0-indexed
  const anoR = d.getFullYear()
  const mesR = String(d.getMonth() + 1).padStart(2, '0')
  const diaR = String(d.getDate()).padStart(2, '0')
  return `${anoR}-${mesR}-${diaR}`
}

// ============================================================
// diferencaEmDias() — dias corridos entre duas datas ISO
// (formato de exibição confirmado com Maycon nesta sessão: "142
// dias", não data da última compra). Trunca ambas as strings pra
// YYYY-MM-DD (data_emissao pode vir com horário) antes de fazer
// Date.parse, pra não sofrer diferença de fração de dia por causa de
// horário — os dois lados são truncados do mesmo jeito, então o
// offset de fuso do parse (sempre meia-noite UTC do dia) se cancela
// ============================================================
function diferencaEmDias(dataAntigaIso: string, dataHojeIso: string): number {
  const antiga = Date.parse(dataAntigaIso.slice(0, 10))
  const hoje = Date.parse(dataHojeIso.slice(0, 10))
  return Math.round((hoje - antiga) / 86_400_000)
}

// ============================================================
// LinhaReceitaInativos — linha mínima da consulta nova do Ranking de
// Inativos (Seção 8). Mesmo shape de identidade de cliente (id ->
// documento -> nome) já usado em lib/relatorios/faturamento.ts
// (chaveCliente()), reimplementado aqui porque aquela função não é
// exportada — não há como importá-la, só replicar o mesmo raciocínio
// ============================================================
interface LinhaReceitaInativos {
  data_emissao: string
  cliente_id: number | null
  cliente_cpf_cnpj: string | null
  cliente_nome: string | null
}

function chaveCliente(r: LinhaReceitaInativos): string {
  if (r.cliente_id !== null) return `id:${r.cliente_id}`
  if (r.cliente_cpf_cnpj) return `doc:${r.cliente_cpf_cnpj}`
  return `nome:${r.cliente_nome ?? 'desconhecido'}`
}

// ============================================================
// HANDLER
// ============================================================
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ erro: 'Método não permitido' })
  }

  // ── Auth ──────────────────────────────────────────────────
  const token = (req.headers.authorization ?? '').replace('Bearer ', '').trim() || null
  if (!token) return res.status(401).json({ erro: 'Não autorizado' })

  const supabaseAdmin = getSupabaseAdmin()
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ erro: 'Não autorizado' })

  try {
    const { hojeIso } = calcularPeriodoMesCorrente()

    // ── Parâmetros de período — cada ranking tem seu próprio filtro
    // e seu próprio default (Seções 7 e 8), por isso query params
    // com prefixo diferente pra cada um, não um filtro único
    // compartilhado ────────────────────────────────────────────
    // Default alterado (decisão confirmada com Maycon nesta sessão):
    // era mês corrente (Seção 7 original da spec), agora últimos 6
    // meses — mesmo piso do ranking de Inativos (subtrairMeses(hojeIso,
    // 6)), pra manter os dois rankings no mesmo período por padrão.
    // "Personalizado" continua funcionando igual, sem mudança.
    const topClientesDataInicial =
      typeof req.query.topClientesDataInicial === 'string' && req.query.topClientesDataInicial !== ''
        ? req.query.topClientesDataInicial
        : subtrairMeses(hojeIso, 6)
    const topClientesDataFinal =
      typeof req.query.topClientesDataFinal === 'string' && req.query.topClientesDataFinal !== ''
        ? req.query.topClientesDataFinal
        : hojeIso

    const inativosDataInicial =
      typeof req.query.inativosDataInicial === 'string' && req.query.inativosDataInicial !== ''
        ? req.query.inativosDataInicial
        : subtrairMeses(hojeIso, 6)
    const inativosDataFinal =
      typeof req.query.inativosDataFinal === 'string' && req.query.inativosDataFinal !== ''
        ? req.query.inativosDataFinal
        : hojeIso

    // ══════════════════════════════════════════════════════════
    // Ranking Top 10 — Clientes que Mais Compraram (Seção 7)
    // ══════════════════════════════════════════════════════════
    const filtroTopClientes: FiltroIntervaloDatas = {
      dataInicial: topClientesDataInicial,
      dataFinal: topClientesDataFinal,
    }
    // itens já vem ordenado decrescente por valor (classificarAbc()
    // ordena antes de classificar A/B/C) — slice(0,10) já é o Top 10
    const relatorioAbcClientes = await gerarRelatorioCurvaAbc('clientes', filtroTopClientes, supabaseAdmin)
    const topClientes: DashboardRankingClienteTop[] = relatorioAbcClientes.itens
      .slice(0, 10)
      .map(item => ({ nome: item.nome, valor: item.valor }))

    // ══════════════════════════════════════════════════════════
    // Ranking Top 10 — Clientes Sem Comprar Há Mais Tempo (Seção 8)
    // Agregação nova. Consulta já restrita à janela de busca (Seção
    // 8: "capped at 6 months... limits how far back the query
    // looks") — como qualquer compra mais recente que a verdadeira
    // última compra do cliente também estaria dentro da janela (se a
    // última compra real caiu dentro da janela), o MAX(data_emissao)
    // calculado só com as linhas da janela já é a última compra real
    // do cliente sempre que essa última compra estiver dentro da
    // janela — que é exatamente o critério de inclusão do ranking
    // (Seção 8: "filtering to clients whose most recent purchase
    // falls within the lookback window")
    // ══════════════════════════════════════════════════════════
    const linhasInativos = await paginarConsulta<LinhaReceitaInativos>((inicio, fim) =>
      supabaseAdmin
        .from('receitas')
        .select('data_emissao, cliente_id, cliente_cpf_cnpj, cliente_nome')
        .gte('data_emissao', inativosDataInicial)
        .lte('data_emissao', limiteSuperiorIntervalo(inativosDataFinal))
        .range(inicio, fim),
    )

    const ultimaCompraPorCliente = new Map<string, { nome: string; ultimaCompra: string }>()
    for (const r of linhasInativos) {
      const chave = chaveCliente(r)
      const atual = ultimaCompraPorCliente.get(chave)
      if (!atual || r.data_emissao > atual.ultimaCompra) {
        ultimaCompraPorCliente.set(chave, { nome: r.cliente_nome ?? '—', ultimaCompra: r.data_emissao })
      }
    }

    // Ordena ascendente por recência = quem comprou há mais tempo
    // (menos recente) vem primeiro — "longest-waiting first" (Seção 8)
    const clientesInativos: DashboardRankingClienteInativo[] = Array.from(ultimaCompraPorCliente.values())
      .map(c => ({ nome: c.nome, diasSemComprar: diferencaEmDias(c.ultimaCompra, hojeIso) }))
      .sort((a, b) => b.diasSemComprar - a.diasSemComprar)
      .slice(0, 10)

    const resposta: DashboardRankingsResponse = {
      topClientes,
      clientesInativos,
    }

    return res.status(200).json(resposta)

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[dashboard/rankings] error:', msg)
    return res.status(500).json({ erro: msg })
  }
}
