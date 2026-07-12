// ============================================================
// pages/api/pagar/confirmar-conciliacao.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Pagar
// Função: Recebe a lista de itens pendentes de confirmação (gerados
//         pelo Motor de Conciliação quando há mais de um título em
//         aberto do mesmo fornecedor, ou nenhum valor batendo
//         exatamente) já com a escolha do usuário em cada um, e
//         aplica todas as baixas escolhidas em lote.
// Conecta com: lib/contasAPagarService.ts (registrarEvento),
//              types/contasAPagar.ts (ItemPendenteConfirmacao)
// Referência: Especificacao_Modulo_Contas_a_Pagar.md, Seção 5,
//             "Function: Tela de Preview de Conciliação Pendente" —
//             "Usuário confirma em lote no final → chama
//             confirmar-conciliacao.ts, que aplica todas as baixas
//             escolhidas de uma vez."
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

import { registrarEvento } from '@/lib/contasAPagarService'
import type { ItemPendenteConfirmacao, FormaBaixaPagar } from '@/types/contasAPagar'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ------------------------------------------------------------
// TIPO: corpo esperado da requisição
// ------------------------------------------------------------
interface CorpoRequisicaoConfirmarConciliacao {
  escolhas: ItemPendenteConfirmacao[] // cada item já com tituloEscolhidoId preenchido (ou null = pular)
}

// ------------------------------------------------------------
// HANDLER: default export da rota — POST apenas
// ------------------------------------------------------------
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' })
  }

  const token = (req.headers.authorization ?? '').replace('Bearer ', '').trim() || null
  if (!token) return res.status(401).json({ erro: 'Não autorizado' })

  const supabaseAdmin = getSupabaseAdmin()
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ erro: 'Não autorizado' })

  const { escolhas } = req.body as CorpoRequisicaoConfirmarConciliacao
  if (!Array.isArray(escolhas)) {
    return res.status(400).json({ erro: 'Corpo da requisição incompleto: escolhas é obrigatório e deve ser um array.' })
  }

  let baixasAplicadas = 0
  let puladas = 0
  const erros: string[] = []

  try {
    for (const escolha of escolhas) {
      // Usuário optou por pular este item — não grava nada, fica
      // registrado só na resposta desta rota (não existe uma tabela
      // de "não encontrados" persistente neste módulo)
      if (!escolha.tituloEscolhidoId) {
        puladas++
        continue
      }

      const formaBaixa: FormaBaixaPagar = escolha.origem === 'relatorio_bb' ? 'relatorio_bb' : 'comprovante_individual'

      const { error: erroUpdate } = await supabaseAdmin
        .from('contas_a_pagar')
        .update({ status: 'pago', data_baixa: escolha.data, forma_baixa: formaBaixa })
        .eq('id', escolha.tituloEscolhidoId)

      if (erroUpdate) {
        erros.push(`Título ${escolha.tituloEscolhidoId}: ${erroUpdate.message}`)
        continue
      }

      await registrarEvento(
        escolha.tituloEscolhidoId,
        'baixa_total',
        `Baixa confirmada manualmente pelo usuário — favorecido "${escolha.favorecidoIdentificado}", valor ${escolha.valor}, via ${escolha.origem}.`,
        escolha.valor,
        supabaseAdmin,
      )

      baixasAplicadas++
    }

    return res.status(200).json({ baixasAplicadas, puladas, erros })

  } catch (err: unknown) {
    const mensagemErro = err instanceof Error ? err.message : String(err)
    console.error('[confirmar-conciliacao] erro:', mensagemErro)
    return res.status(500).json({ erro: `Falha ao confirmar conciliação em lote: ${mensagemErro}` })
  }
}
