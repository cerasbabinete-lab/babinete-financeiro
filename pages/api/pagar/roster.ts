// ============================================================
// pages/api/pagar/roster.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Pagar
// Função: CRUD da tela de manutenção do roster de beneficiários
//         (beneficiarios_pessoais) — GET lista tudo, PUT edita uma
//         linha existente, POST cria uma linha nova. Sem DELETE
//         nesta primeira versão (ver nota em
//         lib/contasAPagarService.ts::criarBeneficiarioRoster).
// Conecta com: lib/contasAPagarService.ts (buscarRosterCompleto,
//              atualizarBeneficiarioRoster, criarBeneficiarioRoster)
// Referência: Especificacao_Modulo_Contas_a_Pagar.md, Seção 5,
//             "Function: Manutenção do Roster"
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

import { buscarRosterCompleto, atualizarBeneficiarioRoster, criarBeneficiarioRoster } from '@/lib/contasAPagarService'
import type { BeneficiarioPessoalRosterPagar } from '@/types/contasAPagar'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

interface CorpoRequisicaoRosterPut {
  id: string
  campos: Partial<Omit<BeneficiarioPessoalRosterPagar, 'id'>>
}

type CorpoRequisicaoRosterPost = Omit<BeneficiarioPessoalRosterPagar, 'id' | 'created_at' | 'updated_at'>

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // GET não precisa de auth de escrita — mas o projeto não configura
  // RLS neste módulo, então mantemos a mesma exigência de Bearer
  // token em TODOS os métodos, por consistência com o resto do módulo
  const token = (req.headers.authorization ?? '').replace('Bearer ', '').trim() || null
  if (!token) return res.status(401).json({ erro: 'Não autorizado' })

  const supabaseAdmin = getSupabaseAdmin()
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ erro: 'Não autorizado' })

  try {
    // ── GET: lista todo o roster ──
    if (req.method === 'GET') {
      const roster = await buscarRosterCompleto(supabaseAdmin)
      return res.status(200).json({ roster })
    }

    // ── PUT: edita uma linha existente ──
    if (req.method === 'PUT') {
      const { id, campos } = req.body as CorpoRequisicaoRosterPut
      if (!id || !campos) {
        return res.status(400).json({ erro: 'Corpo da requisição incompleto: id e campos são obrigatórios.' })
      }
      const beneficiarioAtualizado = await atualizarBeneficiarioRoster(id, campos, supabaseAdmin)
      return res.status(200).json({ beneficiario: beneficiarioAtualizado })
    }

    // ── POST: cria uma linha nova ──
    if (req.method === 'POST') {
      const dados = req.body as CorpoRequisicaoRosterPost
      if (!dados?.nome || !dados?.vinculo) {
        return res.status(400).json({ erro: 'Corpo da requisição incompleto: nome e vinculo são obrigatórios.' })
      }
      const beneficiarioCriado = await criarBeneficiarioRoster(dados, supabaseAdmin)
      return res.status(201).json({ beneficiario: beneficiarioCriado })
    }

    return res.status(405).json({ erro: 'Método não permitido' })

  } catch (err: unknown) {
    const mensagemErro = err instanceof Error ? err.message : String(err)
    console.error('[roster] erro:', mensagemErro)
    return res.status(500).json({ erro: `Falha na operação de roster: ${mensagemErro}` })
  }
}
