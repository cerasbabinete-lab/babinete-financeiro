// ============================================================
// pages/api/pagar/restaurar-backup.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Pagar
// Função: Endpoint de restauração de backup (upsert em lote de
//         títulos + seus eventos), recebendo o JSON gerado por
//         ContasAPagarHeader.tsx::handleBackup / lib/contasAPagarService.ts::fazerBackup.
// FEATURE (a pedido do usuário, 20/08/2026 — mesmo padrão de
// Backup/Restaurar já existente em Receitas, Contas a Receber,
// Clientes, Fornecedores e Despesas): mesma decisão de segurança já
// documentada no topo de lib/contasAPagarService.ts — este módulo
// nunca escreve direto do navegador com a chave anônima, toda escrita
// passa por rota de servidor com Bearer+getUser() e a service role
// key (ver Contexto_Padrao_Backup_Restaurar_Exportar.md §4b e
// pages/api/despesas/restaurar-backup.ts, o mesmo padrão replicado
// aqui quase sem alteração).
// Conecta com: lib/contasAPagarService.ts (restaurarBackup, client-side)
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ContaAPagar } from '@/types/contasAPagar'

// ------------------------------------------------------------
// FUNÇÃO: getSupabaseAdmin
// Mesmo padrão local-por-rota já usado nas demais rotas de
// Contas a Pagar (atualizar.ts, cancelar.ts, importar-comprovante.ts)
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
  titulos: ContaAPagar[]
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
  const { titulos } = req.body as CorpoRequisicaoRestaurar
  if (!Array.isArray(titulos) || titulos.length === 0) {
    return res.status(400).json({ erro: 'Corpo da requisição incompleto: titulos (array) é obrigatório.' })
  }

  try {
    let processados = 0

    // Mesmo princípio de despesasService.ts::restaurarBackup: um
    // registro de cada vez, upsert do título por "id" (a própria PK
    // gerada pelo Postgres — o backup já contém os UUIDs originais,
    // então restaurar preserva as referências de despesa_id/
    // despesa_parcela_id/fornecedor_id), depois substitui os eventos
    // (delete + insert) para garantir que o histórico restaurado bate
    // exatamente com o que estava no backup — exceção deliberada à
    // regra de "eventos nunca são apagados" (Especificação §2.1), que
    // vale para o uso normal do módulo, não para uma restauração
    // completa de estado a partir de um backup.
    for (const titulo of titulos) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { eventos, created_at: _ca, updated_at: _ua, ...dadosTitulo } = titulo

      const { error: erroTitulo } = await supabaseAdmin
        .from('contas_a_pagar')
        .upsert(dadosTitulo, { onConflict: 'id' })

      if (erroTitulo) {
        console.error('[restaurar-backup] erro ao restaurar título:', erroTitulo)
        throw new Error(`Falha ao restaurar título ${titulo.id}: ${erroTitulo.message}`)
      }

      // Substitui os eventos — deleta os existentes e reinsere do backup
      await supabaseAdmin.from('contas_a_pagar_eventos').delete().eq('titulo_id', titulo.id)

      if (eventos && eventos.length > 0) {
        const eventosParaInserir = eventos.map((ev) => ({
          titulo_id: titulo.id,
          tipo: ev.tipo,
          descricao: ev.descricao,
          valor_pago: ev.valor_pago ?? null,
        }))
        const { error: erroEventos } = await supabaseAdmin.from('contas_a_pagar_eventos').insert(eventosParaInserir)
        if (erroEventos) {
          throw new Error(`Título ${titulo.id} restaurado, mas falha ao restaurar eventos: ${erroEventos.message}`)
        }
      }

      processados++
    }

    return res.status(200).json({ processados })

  } catch (err: unknown) {
    const mensagemErro = err instanceof Error ? err.message : String(err)
    console.error('[restaurar-backup] erro:', mensagemErro)
    return res.status(500).json({ erro: mensagemErro })
  }
}
