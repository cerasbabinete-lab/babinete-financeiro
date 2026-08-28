// ============================================================
// pages/api/despesas/restaurar-backup.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Despesas
// Função: Endpoint de restauração de backup (upsert em lote de
//         despesas + suas parcelas), recebendo o JSON gerado por
//         DespesasHeader.tsx::handleBackup / lib/despesasService.ts::fazerBackup.
// FEATURE (a pedido do usuário — mesmo padrão de Backup/Restaurar já
// existente em Receitas, Contas a Receber, Clientes e Fornecedores):
// DIFERENÇA DELIBERADA em relação a receitasService.ts::restaurarBackup:
// lá o upsert é feito direto do navegador com a chave anônima, porque
// a tabela receitas tem política de RLS de escrita liberada. Em
// despesas/despesas_parcelas só existe política de SELECT (de
// propósito — ver achado Alto #8 do relatório de QA: toda escrita do
// módulo Despesas passa por rotas de servidor com a service role key,
// nunca direto do navegador). Esta rota existe para manter esse mesmo
// padrão de segurança também para o Restaurar, em vez de abrir uma
// exceção de RLS de escrita só para esta função.
// Conecta com: lib/despesasService.ts (restaurarBackup, client-side)
// ============================================================

// Importa os tipos padrão de request/response do Pages Router
import type { NextApiRequest, NextApiResponse } from 'next'

// Client Supabase — instanciado aqui, mesmo padrão das demais rotas
// de Despesas (atualizar.ts, confirmar.ts, cancelar.ts)
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

// Importa os tipos usados nesta rota
import type { Despesa } from '@/types/despesas'

// ------------------------------------------------------------
// FUNÇÃO: getSupabaseAdmin
// Mesmo padrão local-por-rota já usado nas demais rotas de Despesas
// ------------------------------------------------------------
function getSupabaseAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ------------------------------------------------------------
// TIPO: corpo esperado da requisição
// ------------------------------------------------------------
interface CorpoRequisicaoRestaurar {
  despesas: Despesa[]
}

// ------------------------------------------------------------
// HANDLER: default export da rota — POST
// ------------------------------------------------------------
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' })
  }

  // ── Auth — mesmo padrão Bearer token + getUser() das demais rotas ──
  const token = (req.headers.authorization ?? '').replace('Bearer ', '').trim() || null
  if (!token) return res.status(401).json({ erro: 'Não autorizado' })

  const supabaseAdmin = getSupabaseAdmin()
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ erro: 'Não autorizado' })

  // ── Body ──
  const { despesas } = req.body as CorpoRequisicaoRestaurar
  if (!Array.isArray(despesas) || despesas.length === 0) {
    return res.status(400).json({ erro: 'Corpo da requisição incompleto: despesas (array) é obrigatório.' })
  }

  try {
    let processados = 0

    // Mesmo princípio de receitasService.ts::restaurarBackup: um
    // registro de cada vez, upsert da despesa principal por "id" (a
    // própria PK gerada pelo Postgres — o backup já contém os UUIDs
    // originais, então restaurar preserva as referências), depois
    // substitui as parcelas (delete + insert) para garantir que o
    // conjunto restaurado bate exatamente com o que estava no backup,
    // sem sobras de parcelas que não existem mais no arquivo.
    for (const despesa of despesas) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { parcelas, created_at: _ca, updated_at: _ua, ...dadosDespesa } = despesa

      const { error: erroDespesa } = await supabaseAdmin
        .from('despesas')
        .upsert(dadosDespesa, { onConflict: 'id' })

      if (erroDespesa) {
        console.error('[restaurar-backup] erro ao restaurar despesa:', erroDespesa)
        throw new Error(`Falha ao restaurar despesa ${despesa.id}: ${erroDespesa.message}`)
      }

      // Substitui as parcelas — deleta as existentes e reinsere do backup
      await supabaseAdmin.from('despesas_parcelas').delete().eq('despesa_id', despesa.id)

      if (parcelas && parcelas.length > 0) {
        const parcelasLimpas = parcelas.map(
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          ({ id: _id, created_at: _ca, updated_at: _ua, ...rest }) => ({ ...rest, despesa_id: despesa.id })
        )
        const { error: erroParcelas } = await supabaseAdmin.from('despesas_parcelas').insert(parcelasLimpas)
        if (erroParcelas) {
          throw new Error(`Despesa ${despesa.id} restaurada, mas falha ao restaurar parcelas: ${erroParcelas.message}`)
        }
      }

      processados++
    }

    return res.status(200).json({ processados })

  } catch (err: unknown) {
    // Convenção do projeto: catch (err: unknown), nunca "any"
    const mensagemErro = err instanceof Error ? err.message : String(err)
    console.error('[restaurar-backup] erro:', mensagemErro)
    return res.status(500).json({ erro: mensagemErro })
  }
}
