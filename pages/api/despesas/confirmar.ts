// ============================================================
// pages/api/despesas/confirmar.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Despesas
// Função: Endpoint final do fluxo de lançamento — recebe a Despesa e
//         parcelas já revisadas (possivelmente editadas) pelo usuário
//         na UI, RE-VALIDA a duplicidade server-side (defesa em
//         profundidade — o bloqueio de duplicidade não pode depender
//         só do client) e persiste via lib/despesasService.ts.
// Conecta com: lib/despesasService.ts (criarDespesaComParcelas),
//              lib/despesas/duplicateCheck.ts, types/despesas.ts
// Referência: Especificacao_Modulo_Despesas.md §5, "Function: Confirm
//             & Persist" — fornecedor já foi resolvido/criado no passo
//             de import (importar-xml.ts / importar-documento.ts), NÃO
//             é refeito aqui.
//
// NÃO-NEGOCIÁVEL: duplicidade bloqueia por completo, sem override. Se a
// checagem já feita no import indicar duplicado e o client tentar
// confirmar mesmo assim, esta rota barra de novo — nunca confia
// cegamente no que o client diz que já foi validado.
// ============================================================

// Importa os tipos padrão de request/response do Pages Router
import type { NextApiRequest, NextApiResponse } from 'next'

// Client Supabase — instanciado aqui, mesmo padrão de pages/api/boleto.ts
import { createClient } from '@supabase/supabase-js'

// Importa a função de persistência (despesa + parcelas)
import { criarDespesaComParcelas } from '@/lib/despesasService'

// Importa a função de checagem de duplicidade, para a re-validação final
import { verificarDuplicidade } from '@/lib/despesas/duplicateCheck'

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
// ------------------------------------------------------------
interface CorpoRequisicaoConfirmar {
  despesa: DespesaInsert // dados já revisados/editados pelo usuário na UI
  parcelas: Omit<DespesaParcelaInsert, 'despesa_id'>[] // parcelas já revisadas
}

// ------------------------------------------------------------
// HANDLER: default export da rota — POST apenas
// ------------------------------------------------------------
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' })
  }

  // ── Auth ──────────────────────────────────────────────────
  const token = (req.headers.authorization ?? '').replace('Bearer ', '').trim() || null
  if (!token) return res.status(401).json({ erro: 'Não autorizado' })

  const supabaseAdmin = getSupabaseAdmin()
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ erro: 'Não autorizado' })

  // ── Body ──────────────────────────────────────────────────
  const { despesa, parcelas } = req.body as CorpoRequisicaoConfirmar

  if (!despesa || !parcelas || parcelas.length === 0) {
    return res.status(400).json({ erro: 'Corpo da requisição incompleto: despesa e ao menos 1 parcela são obrigatórios.' })
  }

  // Validação mínima: fornecedor_id é obrigatório (NOT NULL na tabela) —
  // se chegou até aqui sem isso, algo no pipeline de import falhou
  if (!despesa.fornecedor_id) {
    return res.status(400).json({ erro: 'Despesa sem fornecedor_id — o cross-reference/auto-criação de fornecedor deve rodar antes desta rota.' })
  }

  try {
    // ── Re-validação de duplicidade (defesa em profundidade) ──
    // Reconstrói o formato mínimo que verificarDuplicidade espera a
    // partir da Despesa+parcelas já revisadas, e roda a checagem de novo
    // — nunca confia que o client não alterou nada desde o import
    const duplicateCheck = await verificarDuplicidade(supabaseAdmin, {
      favorecido: { nome: despesa.favorecido_nome, cnpjCpf: despesa.favorecido_cnpj_cpf ?? null, endereco: despesa.favorecido_endereco ?? null },
      documentoOrigem: {
        numeroDocumento: despesa.documento_numero ?? null,
        dataEmissao: despesa.documento_data_emissao ?? null,
        competencia: despesa.documento_competencia ?? null,
      },
      parcelas: parcelas.map((p) => ({
        numeroParcela: p.numero_parcela,
        totalParcelas: p.total_parcelas,
        valor: p.valor,
        dataVencimento: p.data_vencimento,
        linhaDigitavel: p.linha_digitavel ?? null,
        codigoBarras: p.codigo_barras ?? null,
        nossoNumero: p.nosso_numero ?? null,
        podeGerarSegundaVia: p.pode_gerar_segunda_via,
      })),
    })

    // Duplicidade confirmada — bloqueia por completo, sem override
    // (não-negociável, spec §5 e §7)
    if (duplicateCheck.duplicado) {
      return res.status(409).json({
        erro: 'Título já lançado anteriormente — duplicidade detectada.',
        criterioDuplicidade: duplicateCheck.criterioDuplicidade,
      })
    }

    // ── Persiste a Despesa + parcelas, usando o client admin ──
    const resultado = await criarDespesaComParcelas(despesa, parcelas, supabaseAdmin)

    return res.status(201).json(resultado)

  } catch (err: unknown) {
    // Convenção do projeto: catch (err: unknown), nunca "any"
    const mensagemErro = err instanceof Error ? err.message : String(err)
    console.error('[confirmar] erro ao persistir despesa:', mensagemErro)
    return res.status(500).json({ erro: `Falha ao gravar despesa: ${mensagemErro}` })
  }
}
