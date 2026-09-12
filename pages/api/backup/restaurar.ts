// ============================================================
// pages/api/backup/restaurar.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Backup
// Função: Única rota de escrita do módulo Backup. Recebe um
//         subconjunto (ou a totalidade) das 18 tabelas do backup e
//         restaura via upsert (ou substituição total, se solicitado),
//         sempre respeitando a ordem topológica de foreign keys.
// Padrão de auth e service role idêntico ao já usado em
// pages/api/despesas/restaurar-backup.ts e pages/api/pagar/restaurar-backup.ts
// (getSupabaseAdmin() local ao arquivo, Bearer token + getUser()).
// DIFERENÇA DELIBERADA em relação às tabelas com RLS de escrita
// liberada (Receitas, Contas a Receber, Clientes, Fornecedores): esta
// rota escreve TODAS as 18 tabelas via service role key, mesmo as que
// aceitariam escrita direta do navegador em seus módulos individuais —
// decisão do comitê de auditoria deste módulo (ver
// Especificacao_Modulo_Backup.md, Seção 3.2): uma restauração em massa
// não deve herdar a política mais permissiva de cada tabela isolada.
// NOTA: nenhuma outra rota do projeto hoje checa usuarios_permissoes
// no servidor (confirmado lendo pages/api/despesas/restaurar-backup.ts)
// — a gate de permissão é só de UI. Esta rota segue a mesma convenção
// já estabelecida, em vez de inventar um padrão novo só aqui.
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

const TABELAS_BACKUP_ORDEM = [
  'fornecedor_categorias',
  'transportadoras',
  'clientes',
  'fornecedores',
  'fornecedor_chaves_pix',
  'beneficiarios_pessoais',
  'receitas',
  'receitas_itens',
  'receitas_duplicatas',
  'contas_receber',
  'contas_receber_eventos',
  'despesas',
  'despesas_parcelas',
  'contas_a_pagar',
  'contas_a_pagar_eventos',
  'pagar_comprovantes_processados',
  'remessas_importadas',
  'pagar_arquivos_importados',
] as const
type TabelaBackup = (typeof TABELAS_BACKUP_ORDEM)[number]

// Todas as 18 tabelas usam "id" como PK real (confirmado no schema em produção).
const CHAVE_UPSERT: Record<TabelaBackup, string> = Object.fromEntries(
  TABELAS_BACKUP_ORDEM.map((t) => [t, 'id'])
) as Record<TabelaBackup, string>

interface CorpoRequisicao {
  tabelas: Partial<Record<TabelaBackup, Record<string, unknown>[]>>
  modoSubstituicaoTotal?: boolean
}

interface ResultadoTabela {
  tabela: TabelaBackup
  processados: number
  erro?: string
}

// Mesmo padrão local-por-rota de pages/api/despesas/restaurar-backup.ts
function getSupabaseAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' })
  }

  const token = (req.headers.authorization ?? '').replace('Bearer ', '').trim() || null
  if (!token) return res.status(401).json({ erro: 'Não autorizado' })

  const supabaseAdmin = getSupabaseAdmin()
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ erro: 'Não autorizado' })

  const corpo = req.body as CorpoRequisicao
  if (!corpo?.tabelas || typeof corpo.tabelas !== 'object') {
    return res.status(400).json({ erro: 'Corpo da requisição inválido: "tabelas" ausente.' })
  }

  const tabelasRecebidas = Object.keys(corpo.tabelas) as TabelaBackup[]
  const tabelasInvalidas = tabelasRecebidas.filter((t) => !TABELAS_BACKUP_ORDEM.includes(t))
  if (tabelasInvalidas.length > 0) {
    return res.status(400).json({ erro: `Tabela(s) não permitida(s): ${tabelasInvalidas.join(', ')}` })
  }

  // Respeita SEMPRE a ordem topológica das FKs, independentemente da ordem recebida do cliente.
  const ordemExecucao = TABELAS_BACKUP_ORDEM.filter((t) => tabelasRecebidas.includes(t))
  const modoSubstituicaoTotal = corpo.modoSubstituicaoTotal === true

  const resultados: ResultadoTabela[] = []

  for (const tabela of ordemExecucao) {
    const linhas = corpo.tabelas[tabela] ?? []
    if (linhas.length === 0) {
      resultados.push({ tabela, processados: 0 })
      continue
    }
    try {
      if (modoSubstituicaoTotal) {
        // Filtro universal — funciona tanto para PK uuid quanto para PK integer/bigint
        // (clientes, fornecedores, fornecedor_categorias e fornecedor_chaves_pix usam
        // integer/bigint, não uuid).
        const { error: delError } = await supabaseAdmin.from(tabela).delete().not('id', 'is', null)
        if (delError) throw new Error(delError.message)
      }
      const { error: upsertError } = await supabaseAdmin
        .from(tabela)
        .upsert(linhas, { onConflict: CHAVE_UPSERT[tabela] })
      if (upsertError) throw new Error(upsertError.message)
      resultados.push({ tabela, processados: linhas.length })
    } catch (err: unknown) {
      const mensagem = err instanceof Error ? err.message : 'Erro desconhecido'
      console.error('[backup/restaurar] erro:', tabela, mensagem)
      resultados.push({ tabela, processados: 0, erro: mensagem })
      // Interrompe a cadeia: erro numa tabela-pai pode invalidar as tabelas-filhas seguintes.
      break
    }
  }

  const houveErro = resultados.some((r) => r.erro)
  return res.status(houveErro ? 207 : 200).json({ resultados })
}
