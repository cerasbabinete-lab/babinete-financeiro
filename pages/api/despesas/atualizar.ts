// ============================================================
// pages/api/despesas/atualizar.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Despesas
// Função: Endpoint de edição de uma Despesa existente — recebe os
//         campos alterados e a lista completa de parcelas (algumas com
//         id existente, outras novas), e delega para
//         lib/despesasService.ts::atualizarDespesaComSync(), que garante
//         zero divergência entre despesas e despesas_parcelas na MESMA
//         operação (requisito não-negociável da spec).
// Conecta com: lib/despesasService.ts
// Referência: Especificacao_Modulo_Despesas.md §5, "Function: Edit Despesa"
// ============================================================

// Importa os tipos padrão de request/response do Pages Router
import type { NextApiRequest, NextApiResponse } from 'next'

// Client Supabase — instanciado aqui, mesmo padrão de pages/api/boleto.ts
import { createClient } from '@supabase/supabase-js'

// Importa a função de edição com sync obrigatório de parcelas
import { atualizarDespesaComSync } from '@/lib/despesasService'

// Importa os tipos usados nesta rota
import type { DespesaInsert, DespesaParcelaInsert } from '@/types/despesas'

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
// parcelas pode conter itens com "id" (parcela existente, sofre UPDATE)
// ou sem "id" (parcela nova, adicionada durante a edição, sofre INSERT)
// ------------------------------------------------------------
interface CorpoRequisicaoAtualizar {
  despesaId: string
  camposDespesa: Partial<DespesaInsert>
  parcelas: (Omit<DespesaParcelaInsert, 'despesa_id'> & { id?: string })[]
}

// ------------------------------------------------------------
// HANDLER: default export da rota — PUT/POST (aceita ambos por
// simplicidade de integração no client; semanticamente é um update)
// ------------------------------------------------------------
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PUT' && req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' })
  }

  // ── Auth ──────────────────────────────────────────────────
  const token = (req.headers.authorization ?? '').replace('Bearer ', '').trim() || null
  if (!token) return res.status(401).json({ erro: 'Não autorizado' })

  const supabaseAdmin = getSupabaseAdmin()
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ erro: 'Não autorizado' })

  // ── Body ──────────────────────────────────────────────────
  const { despesaId, camposDespesa, parcelas } = req.body as CorpoRequisicaoAtualizar

  if (!despesaId || !camposDespesa || !parcelas) {
    return res.status(400).json({ erro: 'Corpo da requisição incompleto: despesaId, camposDespesa e parcelas são obrigatórios.' })
  }

  // Uma Despesa editada precisa continuar com ao menos 1 parcela ativa —
  // o modal de edição não deve permitir remover todas, mas a rota
  // também valida, por segurança
  if (parcelas.length === 0) {
    return res.status(400).json({ erro: 'A despesa precisa manter ao menos 1 parcela.' })
  }

  try {
    // Delega toda a lógica de sync (update/insert/soft-delete de
    // parcelas) para a camada de serviço, usando o client admin
    const resultado = await atualizarDespesaComSync(despesaId, camposDespesa, parcelas, supabaseAdmin)

    return res.status(200).json(resultado)

  } catch (err: unknown) {
    // Convenção do projeto: catch (err: unknown), nunca "any"
    const mensagemErro = err instanceof Error ? err.message : String(err)
    console.error('[atualizar] erro ao editar despesa:', mensagemErro)
    return res.status(500).json({ erro: `Falha ao atualizar despesa: ${mensagemErro}` })
  }
}
