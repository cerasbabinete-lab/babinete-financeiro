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

import { registrarEvento, somarValorPagoEventosComClient } from '@/lib/contasAPagarService'
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

      // QA fix (achado em uso real — pagamento da Sheli, sessão de
      // testes deste módulo): esta rota antes marcava SEMPRE 'pago'
      // com o valor escolhido, sem checar se o valor confirmado bate
      // com o valor de face do título. Isso causava dois problemas:
      // (a) pagamento MENOR que o título virava 'pago' igual assim
      // mesmo (perdia o estado pago_parcial); (b) pagamento MAIOR
      // que o título (excedente) tinha o valor extra simplesmente
      // descartado, sem nenhum rastro.
      //
      // Busca o título para saber o valor de face e decidir o status
      // correto — mesmo padrão de registrarBaixaManual() e de
      // processarAcumulo() em motorConciliacao.ts
      const { data: tituloAtual, error: erroBusca } = await supabaseAdmin
        .from('contas_a_pagar')
        .select('valor')
        .eq('id', escolha.tituloEscolhidoId)
        .single()

      if (erroBusca || !tituloAtual) {
        erros.push(`Título ${escolha.tituloEscolhidoId}: falha ao buscar título — ${erroBusca?.message ?? 'não encontrado'}`)
        continue
      }

      const formaBaixa: FormaBaixaPagar = escolha.origem === 'relatorio_bb' ? 'relatorio_bb' : 'comprovante_individual'

      const somaAnterior = await somarValorPagoEventosComClient(escolha.tituloEscolhidoId, supabaseAdmin)
      const novaSoma = somaAnterior + escolha.valor
      const valorExcedente = Math.round((novaSoma - tituloAtual.valor) * 100) / 100

      // ── Caso 1: soma ainda menor que o valor do título → baixa parcial ──
      if (novaSoma < tituloAtual.valor - 0.01) {
        const { error: erroUpdateParcial } = await supabaseAdmin
          .from('contas_a_pagar')
          .update({ status: 'pago_parcial' })
          .eq('id', escolha.tituloEscolhidoId)

        if (erroUpdateParcial) {
          erros.push(`Título ${escolha.tituloEscolhidoId}: ${erroUpdateParcial.message}`)
          continue
        }

        await registrarEvento(
          escolha.tituloEscolhidoId,
          'baixa_parcial',
          `Baixa parcial confirmada manualmente pelo usuário — favorecido "${escolha.favorecidoIdentificado}", valor ${escolha.valor}, via ${escolha.origem} — acumulado ${novaSoma} de ${tituloAtual.valor}.`,
          escolha.valor,
          supabaseAdmin,
        )

        baixasAplicadas++
        continue
      }

      // ── Caso 2: soma fecha (ou ultrapassa) o valor do título → baixa total ──
      const { error: erroUpdate } = await supabaseAdmin
        .from('contas_a_pagar')
        .update({ status: 'pago', data_baixa: escolha.data, forma_baixa: formaBaixa })
        .eq('id', escolha.tituloEscolhidoId)

      if (erroUpdate) {
        erros.push(`Título ${escolha.tituloEscolhidoId}: ${erroUpdate.message}`)
        continue
      }

      // Descrição do evento sinaliza o excedente explicitamente quando
      // houver — este caminho (confirmação manual de fornecedor
      // genérico) não tem contexto de roster (categoria/subtipo) para
      // criar uma Despesa complementar automática como
      // processarAcumulo() faz para os casos de sócio/prestador MEI.
      // Em vez de descartar o valor excedente silenciosamente, ele
      // fica registrado de forma explícita na descrição do evento
      // para revisão manual — nunca inventa um lançamento sem ter
      // categoria/subtipo confiável para ele.
      const descricaoBase = `Baixa confirmada manualmente pelo usuário — favorecido "${escolha.favorecidoIdentificado}", valor ${escolha.valor}, via ${escolha.origem}.`
      const descricao = valorExcedente > 0.01
        ? `${descricaoBase} ATENÇÃO: valor pago excede o valor do título (${tituloAtual.valor}) em ${valorExcedente} — revisar se é necessário lançamento de Despesa complementar manual (este fluxo não cria automaticamente, diferente do roster de sócios/prestador).`
        : descricaoBase

      await registrarEvento(
        escolha.tituloEscolhidoId,
        'baixa_total',
        descricao,
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
