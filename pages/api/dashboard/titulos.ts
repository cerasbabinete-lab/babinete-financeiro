// ============================================================
// pages/api/dashboard/titulos.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Dashboard (NOVO)
// Função: Endpoint único que devolve a Lista de Títulos a Pagar
//         (Especificacao_Modulo_Dashboard.md, Seção 5 — feature
//         prioritária, já enriquecida com o dado de chave Pix
//         preferencial pra hierarquia de ação da linha) e a Lista de
//         Títulos a Receber (Seção 6 — puramente informativa), numa
//         chamada só (Seção 10: "both a-pagar and a-receber lists,
//         date-range params, one call").
//         100% leitura. Reaproveita buscarTitulos() de Contas a
//         Pagar e Contas a Receber e listarChavesPixPreferenciais()
//         de Fornecedores — todas chamadas como estão, sem parâmetro
//         novo (Seção 0, regra 4).
// Conecta com: lib/contasAPagarService.ts (buscarTitulos),
//              lib/contasReceberService.ts (buscarTitulos),
//              lib/fornecedoresService.ts
//              (listarChavesPixPreferenciais), types/dashboard.ts,
//              components/dashboard/ListaTitulosPagar.tsx,
//              ListaTitulosReceber.tsx (consomem esta resposta)
// Referência: Especificacao_Modulo_Dashboard.md, Seções 5, 6 e 9
//             (decisões de status confirmadas com Maycon nesta sessão)
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

// buscarTitulos() de cada módulo — chamadas como estão (Seção 0,
// regra 4), mesmo padrão sem client injetado já usado em
// pages/api/dashboard/resumo.ts
import { buscarTitulos as buscarTitulosPagar } from '@/lib/contasAPagarService'
import { buscarTitulos as buscarTitulosReceber } from '@/lib/contasReceberService'

// Reaproveita a função já pronta do módulo Fornecedores — devolve
// TODAS as chaves Pix marcadas como preferencial, de qualquer
// fornecedor. Confirmada já implementada e presente no codebase
// (nota de dependência no topo da spec)
import { listarChavesPixPreferenciais } from '@/lib/fornecedoresService'

import type { ContaAPagar } from '@/types/contasAPagar'
import type { ContaReceber } from '@/types/contasReceber'
import type { DashboardTitulosResponse, TituloPagarComAcao, ChavePixResumo } from '@/types/dashboard'

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
// hojeSaoPauloIso() — "hoje" no fuso de São Paulo, não no fuso do
// servidor (mesmo raciocínio de calcularPeriodoMesCorrente() em
// pages/api/dashboard/resumo.ts — duplicado aqui, não extraído pra
// um helper compartilhado, porque a Seção 0/regra 3 da spec limita
// este módulo a exatamente 3 arquivos de rota + types/dashboard.ts,
// sem arquivo de lib/dashboard/ novo)
// ============================================================
function hojeSaoPauloIso(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return fmt.format(new Date())
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
    // ── Parâmetros de data (Seção 5.2) ───────────────────────
    // vencimentoAte não informado (ou vazio) → "hoje" (padrão "hoje +
    // atrasados"). vencimentoDe não informado → string vazia, que
    // buscarTitulos() já trata como "sem piso" (não aplica .gte()),
    // trazendo atrasados de qualquer época, exatamente o padrão
    // pedido. Livremente ajustável pelo usuário via query string,
    // inclusive expandindo pro futuro (Seção 5.2: "including
    // expanding the range into the future")
    const vencimentoAteQuery = typeof req.query.vencimentoAte === 'string' ? req.query.vencimentoAte.trim() : ''
    const vencimentoDeQuery = typeof req.query.vencimentoDe === 'string' ? req.query.vencimentoDe.trim() : ''
    const vencimentoAte = vencimentoAteQuery !== '' ? vencimentoAteQuery : hojeSaoPauloIso()
    const vencimentoDe = vencimentoDeQuery

    // ══════════════════════════════════════════════════════════
    // Lista de Títulos a Pagar (Seção 5)
    // ══════════════════════════════════════════════════════════

    // buscarTitulos() sem status já exclui 'cancelado' (soft-delete)
    // automaticamente (confirmado em resumo.ts) — filtra em seguida,
    // em memória, pra manter só em_aberto + pago_parcial (Seção 5.1:
    // "status is still open" — decisão confirmada com Maycon: inclui
    // pago_parcial, um título parcialmente pago ainda precisa de ação)
    const titulosPagarBrutos: ContaAPagar[] = await buscarTitulosPagar({
      busca: '',
      vencimentoDe,
      vencimentoAte,
      status: '',
    })
    const titulosPagarAbertos = titulosPagarBrutos.filter(
      t => t.status === 'em_aberto' || t.status === 'pago_parcial',
    )

    // Mapa fornecedor_id -> chave Pix preferencial, montado uma vez
    // só e reaproveitado pra cada título — evita 1 consulta por linha
    // (Seção 5.3, item 2)
    const chavesPreferenciais = await listarChavesPixPreferenciais()
    const chavePorFornecedor = new Map<number, ChavePixResumo>()
    for (const chave of chavesPreferenciais) {
      chavePorFornecedor.set(chave.fornecedor_id, {
        tipoChave: chave.tipo_chave,
        valorChave: chave.valor_chave,
      })
    }

    // Enriquece cada título com o dado de ação — a decisão de QUAL
    // ação mostrar (2ª via / Pix / nada, Seção 5.3) fica pro
    // componente de tela, que já tem linha_digitavel e nosso_numero
    // vindos do próprio ContaAPagar e agora também chavePixPreferencial
    const titulosPagar: TituloPagarComAcao[] = titulosPagarAbertos.map(titulo => ({
      ...titulo,
      chavePixPreferencial:
        titulo.fornecedor_id != null
          ? (chavePorFornecedor.get(titulo.fornecedor_id) ?? null)
          : null,
    }))

    // ══════════════════════════════════════════════════════════
    // Lista de Títulos a Receber (Seção 6) — puramente informativa,
    // sem nenhum enriquecimento, sem ação de linha
    // ══════════════════════════════════════════════════════════

    // status explícito 'em_aberto' (decisão confirmada com Maycon —
    // mesma exclusão de protestado/enviado_cartorio do Card Verde) —
    // já implica exclusão de 'cancelado' (que é seu próprio valor de
    // status, não coexiste com 'em_aberto'); filtro extra de
    // deleted_at abaixo é só defesa em profundidade, mesmo raciocínio
    // de resumo.ts
    const titulosReceberBrutos: ContaReceber[] = await buscarTitulosReceber({
      busca: '',
      vencimentoDe,
      vencimentoAte,
      status: 'em_aberto',
    })
    const titulosReceber = titulosReceberBrutos.filter(t => !t.deleted_at)

    const resposta: DashboardTitulosResponse = {
      titulosPagar,
      titulosReceber,
    }

    return res.status(200).json(resposta)

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[dashboard/titulos] error:', msg)
    return res.status(500).json({ erro: msg })
  }
}
