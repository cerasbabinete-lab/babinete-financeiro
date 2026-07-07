// ============================================================
// pages/api/despesas/cancelar.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Despesas
// Função: Endpoint de cancelamento (soft-delete) de uma Despesa e de
//         todas as suas parcelas ativas, na mesma operação.
// QA fix (achado Alto #8 — Relatorio_Auditoria_Modulo_Despesas.md):
// esta rota NÃO EXISTIA — cancelarDespesa() era chamada diretamente do
// browser (DespesasTabela.tsx/DespesasMobileList.tsx via
// app/despesas/page.tsx::handleExcluir) usando a anon key, sem passar
// por nenhuma rota pages/api/despesas/*, dependendo inteiramente de RLS
// (cujo status para despesas/despesas_parcelas nunca foi configurado ou
// verificado — ver Handoff_Despesas_Modulo_Para_Deep_Code_Audit.md §7).
// Esta rota fecha essa lacuna, seguindo o mesmo padrão Bearer token +
// getUser() das demais rotas do módulo (atualizar.ts, confirmar.ts).
// Conecta com: lib/despesasService.ts (cancelarDespesa)
// Referência: Especificacao_Modulo_Despesas.md — convenção de projeto:
//             toda escrita passa por auth server-side, nunca getSession()
// ============================================================

// Importa os tipos padrão de request/response do Pages Router
import type { NextApiRequest, NextApiResponse } from 'next'

// Client Supabase — instanciado aqui, mesmo padrão de pages/api/boleto.ts
// e das demais rotas de Despesas (atualizar.ts, confirmar.ts)
import { createClient } from '@supabase/supabase-js'

// Importa a função de cancelamento (soft-delete em cascata) já adaptada
// para aceitar client injetável (QA fix, achado Alto #8)
import { cancelarDespesa } from '@/lib/despesasService'

// ------------------------------------------------------------
// FUNÇÃO: getSupabaseAdmin
// Mesmo padrão local-por-rota já usado nas demais rotas de Despesas
// ------------------------------------------------------------
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ------------------------------------------------------------
// TIPO: corpo esperado da requisição
// ------------------------------------------------------------
interface CorpoRequisicaoCancelar {
  despesaId: string // UUID da despesa a ser cancelada (soft-delete)
}

// ------------------------------------------------------------
// HANDLER: default export da rota — POST/PUT (aceita ambos, mesma
// convenção de tolerância já usada em atualizar.ts; semanticamente é
// um update de status, não uma criação)
// ------------------------------------------------------------
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Só aceita POST ou PUT — qualquer outro método é rejeitado
  if (req.method !== 'POST' && req.method !== 'PUT') {
    return res.status(405).json({ erro: 'Método não permitido' })
  }

  // ── Auth ──────────────────────────────────────────────────
  // Mesmo padrão das demais rotas: Bearer token → getUser() valida o JWT
  // contra o servidor Supabase (nunca getSession(), que só lê local)
  const token = (req.headers.authorization ?? '').replace('Bearer ', '').trim() || null
  if (!token) return res.status(401).json({ erro: 'Não autorizado' })

  const supabaseAdmin = getSupabaseAdmin()
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ erro: 'Não autorizado' })

  // ── Body ──────────────────────────────────────────────────
  const { despesaId } = req.body as CorpoRequisicaoCancelar

  // Validação mínima do corpo — sem isso não há como seguir
  if (!despesaId) {
    return res.status(400).json({ erro: 'Corpo da requisição incompleto: despesaId é obrigatório.' })
  }

  try {
    // Delega o soft-delete em cascata (despesa + parcelas ativas) para a
    // camada de serviço, usando o client admin já autenticado nesta rota
    await cancelarDespesa(despesaId, supabaseAdmin)

    return res.status(200).json({ sucesso: true })

  } catch (err: unknown) {
    // Convenção do projeto: catch (err: unknown), nunca "any"
    const mensagemErro = err instanceof Error ? err.message : String(err)
    console.error('[cancelar] erro ao cancelar despesa:', mensagemErro)
    return res.status(500).json({ erro: `Falha ao cancelar despesa: ${mensagemErro}` })
  }
}
