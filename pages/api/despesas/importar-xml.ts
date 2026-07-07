// ============================================================
// pages/api/despesas/importar-xml.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Despesas
// Função: Endpoint que recebe um documento JÁ CONVERTIDO em modelo
//         canônico de extração (DocumentoExtraidoDespesa) — parseado no
//         CLIENT a partir de um XML de NFS-e ou NF-e de compra, via
//         lib/despesas/nfseXmlParser.ts ou lib/despesas/nfeCompraXmlParser.ts
//         — e executa o restante do pipeline: cross-reference/auto-criação
//         de fornecedor, classificação de origemDespesa, e checagem de
//         duplicidade. Retorna tudo pronto para a UI revisar antes de
//         "Confirmar e Gravar" (pages/api/despesas/confirmar.ts).
// Conecta com: lib/despesas/fornecedorAutoCreate.ts,
//              lib/despesas/classificadorOrigemDespesa.ts,
//              lib/despesas/duplicateCheck.ts, types/despesas.ts
// Referência: Especificacao_Modulo_Despesas.md §5, "Function: XML Import
//             & Parsing (no AI)"
//
// NOTA DE ARQUITETURA — POR QUE O XML NÃO CHEGA AQUI:
// O parse do XML (NFS-e ou NF-e de compra) acontece inteiramente no
// client, via DOMParser — API indisponível no runtime Node.js desta
// rota. Esta rota só recebe o objeto já parseado (DocumentoExtraidoDespesa),
// e executa os passos pós-extração, que são os mesmos para os caminhos
// XML e IA (ver pages/api/despesas/importar-documento.ts).
// ============================================================

// Importa os tipos padrão de request/response do Pages Router
import type { NextApiRequest, NextApiResponse } from 'next'

// Client Supabase — instanciado aqui, mesmo padrão de pages/api/boleto.ts
import { createClient } from '@supabase/supabase-js'

// Importa a função de cross-reference + auto-criação de fornecedor
import { buscarOuCriarFornecedor } from '@/lib/despesas/fornecedorAutoCreate'

// Importa a função de classificação determinística de origemDespesa e o
// helper de montagem dos sinais de fallback
import { classificarOrigemDespesa, extrairSinaisFallbackDeDocumento } from '@/lib/despesas/classificadorOrigemDespesa'

// Importa a função de checagem de duplicidade por chave composta
import { verificarDuplicidade } from '@/lib/despesas/duplicateCheck'

// Importa os tipos do modelo canônico de extração e do envelope de resultado
import type {
  DocumentoExtraidoDespesa,
  DespesaInsert,
  DespesaParcelaInsert,
  ResultadoProcessamentoDespesa,
  OrigemEntradaDespesa,
} from '@/types/despesas'

// ------------------------------------------------------------
// FUNÇÃO: getSupabaseAdmin
// Instancia o client Supabase com privilégio de service role — mesmo
// padrão local-por-rota já usado em pages/api/boleto.ts, em vez de um
// client compartilhado dedicado (decisão tomada no item 5 do build)
// ------------------------------------------------------------
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ------------------------------------------------------------
// TIPO: corpo esperado da requisição
// tipoOrigem vem explícito do client (não inferido), já que o client
// sabe exatamente qual parser rodou (nfseXmlParser ou nfeCompraXmlParser)
// ------------------------------------------------------------
interface CorpoRequisicaoImportarXml {
  documento: DocumentoExtraidoDespesa // objeto já parseado no client
  tipoOrigem: Extract<OrigemEntradaDespesa, 'xml_nfse' | 'xml_nfe_compra'> // qual parser gerou o documento
}

// ------------------------------------------------------------
// HANDLER: default export da rota — POST apenas
// ------------------------------------------------------------
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Só aceita POST — qualquer outro método é rejeitado
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' })
  }

  // ── Auth ──────────────────────────────────────────────────
  // Mesmo padrão de pages/api/boleto.ts: Bearer token → getUser() valida
  // o JWT contra o servidor Supabase (nunca getSession, que só lê local)
  const token = (req.headers.authorization ?? '').replace('Bearer ', '').trim() || null
  if (!token) return res.status(401).json({ erro: 'Não autorizado' })

  const supabaseAdmin = getSupabaseAdmin()
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ erro: 'Não autorizado' })

  // ── Body ──────────────────────────────────────────────────
  const { documento, tipoOrigem } = req.body as CorpoRequisicaoImportarXml

  // Validação mínima do corpo — sem isso não há como seguir o pipeline
  if (!documento || !tipoOrigem) {
    return res.status(400).json({ erro: 'Corpo da requisição incompleto: documento e tipoOrigem são obrigatórios.' })
  }

  try {
    // ── Guarda de defesa em profundidade (Handoff, Bug #1) ──
    // O parser de NF-e de compra já valida estruturalmente que a Ceras
    // Babinete é a destinatária (nunca o emitente/favorecido); esta
    // checagem é uma segunda camada, redundante de propósito, para
    // pegar qualquer caso em que o favorecido acabe sendo a própria
    // empresa — o que nunca deveria acontecer neste pipeline, já que
    // todo documento processado aqui é uma despesa (saída de caixa)
    const cnpjFavorecidoLimpo = (documento.favorecido.cnpjCpf ?? '').replace(/\D/g, '')
    if (cnpjFavorecidoLimpo === '10666614000160') {
      return res.status(422).json({
        erro: 'O favorecido extraído é a própria Ceras Babinete — isso indica um documento incompatível com este fluxo (Despesas processa apenas saídas de caixa). Verifique se o XML enviado é realmente uma compra/serviço recebido pela empresa.',
      })
    }

    // ── Passo 1: cross-reference + auto-criação de fornecedor ──
    // Roda ANTES da confirmação do usuário — se um novo fornecedor for
    // criado aqui, ele já fica persistido em produção imediatamente
    // (spec §5: "trigger: automatically after successful extraction")
    const fornecedorMatch = await buscarOuCriarFornecedor(supabaseAdmin, documento.favorecido)

    // ── Passo 2: classificação determinística de origemDespesa ──
    const sinaisFallback = extrairSinaisFallbackDeDocumento(documento)
    const { origemDespesa, resultado: origemDespesaClassificacao } = await classificarOrigemDespesa(
      supabaseAdmin,
      documento.favorecido,
      documento.categoriaFinanceira,
      sinaisFallback,
    )

    // ── Passo 3: checagem de duplicidade por chave composta ──
    const duplicateCheck = await verificarDuplicidade(supabaseAdmin, documento)

    // ── Monta a Despesa pronta para revisão na UI (ainda não persistida) ──
    const despesa: DespesaInsert = {
      tipo_documento: documento.tipoDocumento,
      categoria_financeira: documento.categoriaFinanceira,

      favorecido_nome: documento.favorecido.nome,
      favorecido_cnpj_cpf: documento.favorecido.cnpjCpf,
      favorecido_endereco: documento.favorecido.endereco,

      fornecedor_id: fornecedorMatch.fornecedorId,
      fornecedor_auto_criado: fornecedorMatch.autoCriado,

      origem_tipo: origemDespesa.tipo,
      origem_beneficiario_nome: origemDespesa.beneficiarioPessoal?.nome ?? null,
      origem_beneficiario_cpf: origemDespesa.beneficiarioPessoal?.cpf ?? null,
      origem_beneficiario_vinculo: origemDespesa.beneficiarioPessoal?.vinculo ?? null,
      origem_classificacao_status: origemDespesaClassificacao.status,
      origem_criterios_batidos: origemDespesaClassificacao.criteriosBatidos,
      origem_ia_sugestao: null, // caminho XML não passa pela IA

      documento_numero: documento.documentoOrigem.numeroDocumento,
      documento_data_emissao: documento.documentoOrigem.dataEmissao,
      documento_competencia: documento.documentoOrigem.competencia,

      valor_original: documento.valores.valorOriginal,
      valor_desconto: documento.valores.valorDesconto,
      valor_juros_multa: documento.valores.valorJurosMulta,
      valor_total: documento.valores.valorTotal,

      status_pagamento: 'em_aberto', // sempre fixo na criação, nunca extraído

      extensao_categoria: documento.extensaoCategoria,

      origem_entrada: tipoOrigem,

      deleted_at: null,
    }

    // ── Monta as parcelas prontas para revisão (ainda não persistidas) ──
    const parcelas: DespesaParcelaInsert[] = documento.parcelas.map((p) => ({
      despesa_id: '', // preenchido só na persistência (confirmar.ts), após o insert de despesas gerar o UUID
      numero_parcela: p.numeroParcela,
      total_parcelas: p.totalParcelas,
      valor: p.valor,
      data_vencimento: p.dataVencimento,
      linha_digitavel: p.linhaDigitavel,
      codigo_barras: p.codigoBarras,
      nosso_numero: p.nossoNumero,
      pode_gerar_segunda_via: p.podeGerarSegundaVia,
      status: 'em_aberto',
      deleted_at: null,
    }))

    // ── Monta e retorna o envelope completo para a UI ──
    const resultado: ResultadoProcessamentoDespesa = {
      despesa,
      parcelas,
      fornecedorMatch,
      origemDespesaClassificacao,
      duplicateCheck,
    }

    return res.status(200).json(resultado)

  } catch (err: unknown) {
    // Convenção do projeto: catch (err: unknown), nunca "any"
    const mensagemErro = err instanceof Error ? err.message : String(err)
    console.error('[importar-xml] erro no pipeline de processamento:', mensagemErro)
    return res.status(500).json({ erro: `Falha ao processar documento: ${mensagemErro}` })
  }
}
