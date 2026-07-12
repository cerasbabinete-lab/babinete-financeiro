// ============================================================
// pages/api/pagar/baixar-manual.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Pagar
// Função: Endpoint de baixa manual avulsa — SÓ para títulos já
//         lançados via Despesas (Especificação §7, Non-negotiable:
//         "nunca cria Despesa nova a partir desta tela").
// Conecta com: lib/contasAPagarService.ts (registrarBaixaManual)
// Referência: Especificacao_Modulo_Contas_a_Pagar.md, Seção 5,
//             "Function: Baixa Manual Avulsa"
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

import { registrarBaixaManual } from '@/lib/contasAPagarService'
import type { FormaBaixaPagar } from '@/types/contasAPagar'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

interface CorpoRequisicaoBaixarManual {
  id: string
  formaBaixa: FormaBaixaPagar // 'pix' | 'transferencia' | 'boleto_manual' | 'manual' (as únicas opções que fazem sentido nesta tela)
  valorBaixa: number
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'PUT') {
    return res.status(405).json({ erro: 'Método não permitido' })
  }

  const token = (req.headers.authorization ?? '').replace('Bearer ', '').trim() || null
  if (!token) return res.status(401).json({ erro: 'Não autorizado' })

  const supabaseAdmin = getSupabaseAdmin()
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ erro: 'Não autorizado' })

  const { id, formaBaixa, valorBaixa } = req.body as CorpoRequisicaoBaixarManual
  if (!id || !formaBaixa || typeof valorBaixa !== 'number') {
    return res.status(400).json({ erro: 'Corpo da requisição incompleto: id, formaBaixa e valorBaixa (numérico) são obrigatórios.' })
  }

  try {
    await registrarBaixaManual(id, formaBaixa, valorBaixa, supabaseAdmin)
    return res.status(200).json({ sucesso: true })
  } catch (err: unknown) {
    const mensagemErro = err instanceof Error ? err.message : String(err)
    console.error('[baixar-manual] erro:', mensagemErro)
    return res.status(500).json({ erro: `Falha ao registrar baixa manual: ${mensagemErro}` })
  }
}
