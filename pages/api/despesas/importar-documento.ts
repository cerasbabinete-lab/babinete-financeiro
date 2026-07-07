// ============================================================
// pages/api/despesas/importar-documento.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Despesas
// Função: Endpoint que recebe um arquivo (PDF, imagem, TXT, DOC, XLS,
//         XLSX) já convertido em base64 pelo client, envia ao Gemini via
//         lib/despesas/extracaoIaCliente.ts, valida a resposta e executa
//         o pipeline compartilhado: fornecedor (cross-reference/auto-
//         criação), classificação de origemDespesa e duplicidade.
//         Retorna tudo pronto para a UI revisar antes de "Confirmar e
//         Gravar" (pages/api/despesas/confirmar.ts).
// Conecta com: lib/despesas/extracaoIaCliente.ts,
//              lib/despesas/fornecedorAutoCreate.ts,
//              lib/despesas/classificadorOrigemDespesa.ts,
//              lib/despesas/duplicateCheck.ts, types/despesas.ts
// Referência: Especificacao_Modulo_Despesas.md §5, "Function:
//             AI-Assisted Import"
//
// BUGS VALIDADOS NA PROTOTIPAGEM — CORREÇÕES MANTIDAS AQUI:
//   - Bug #4 (base64 de foto grande travando o browser): a conversão em
//     si acontece NO CLIENT via FileReader.readAsDataURL(), nunca loop
//     manual de bytes — este arquivo só recebe o base64 já pronto.
//   - Bug #5 (limite de 1MB do Pages Router): sizeLimit elevado abaixo
//     via `export const config`, necessário porque base64 infla o
//     tamanho do arquivo original em ~33%.
// ============================================================

// Importa os tipos padrão de request/response do Pages Router
import type { NextApiRequest, NextApiResponse } from 'next'

// Client Supabase — instanciado aqui, mesmo padrão de pages/api/boleto.ts
import { createClient } from '@supabase/supabase-js'

// Importa a função de extração via Gemini
import { extrairDocumentoComGemini } from '@/lib/despesas/extracaoIaCliente'

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
  Parcela,
} from '@/types/despesas'

// ------------------------------------------------------------
// CONFIG: eleva o limite de tamanho do corpo da requisição.
// Necessário porque o Pages Router limita a 1MB por padrão, e um arquivo
// base64 (ex: foto de celular) facilmente ultrapassa isso — o base64
// infla o tamanho original em ~33%. Bug #5 documentado no Handoff.
// ------------------------------------------------------------
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '25mb',
    },
  },
}

// ------------------------------------------------------------
// FUNÇÃO: getSupabaseAdmin
// Instancia o client Supabase com privilégio de service role — mesmo
// padrão local-por-rota já usado em pages/api/boleto.ts
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
interface CorpoRequisicaoImportarDocumento {
  arquivoBase64: string // conteúdo do arquivo em base64, sem o prefixo "data:...;base64,"
  mimeType: string // tipo real do arquivo (ex: "application/pdf", "image/jpeg")
}

// ------------------------------------------------------------
// TIPO: shape bruto retornado pelo Gemini, conforme GEMINI_RESPONSE_SCHEMA
// (origemDespesaSugeridaIA vem no nível raiz, não dentro de extensaoCategoria
// — por isso precisa de um tipo próprio antes de remontar para
// DocumentoExtraidoDespesa, que guarda essa sugestão em origemIaSugestao)
// ------------------------------------------------------------
interface DadosBrutosGemini {
  tipoDocumento: DocumentoExtraidoDespesa['tipoDocumento']
  categoriaFinanceira: DocumentoExtraidoDespesa['categoriaFinanceira']
  favorecido: DocumentoExtraidoDespesa['favorecido']
  documentoOrigem?: DocumentoExtraidoDespesa['documentoOrigem']
  parcelas: Parcela[]
  valores: DocumentoExtraidoDespesa['valores']
  extensaoCategoria: DocumentoExtraidoDespesa['extensaoCategoria']
  origemDespesaSugeridaIA: { tipoSugerido: string; nomeBeneficiarioMencionado: string | null; justificativa: string }
}

// ------------------------------------------------------------
// Função: validarEMontarDocumento
// Valida a resposta bruta do Gemini contra as regras mínimas exigidas
// pela spec (campos obrigatórios presentes, valores numéricos, datas
// válidas, mínimo 1 parcela) e remonta no shape DocumentoExtraidoDespesa.
// Campos mascarados/ausentes (ex: CPF, linha digitável) resolvem para
// null SEM bloquear a validação — isso é esperado, não é erro.
// ------------------------------------------------------------
function validarEMontarDocumento(bruto: DadosBrutosGemini): DocumentoExtraidoDespesa {
  // Campos obrigatórios no nível raiz — sem eles a extração é inutilizável
  if (!bruto.tipoDocumento || !bruto.categoriaFinanceira) {
    throw new Error('Resposta do Gemini sem tipoDocumento ou categoriaFinanceira — extração inválida.')
  }
  if (!bruto.favorecido || !bruto.favorecido.nome) {
    throw new Error('Resposta do Gemini sem favorecido.nome — extração inválida.')
  }
  if (!Array.isArray(bruto.parcelas) || bruto.parcelas.length === 0) {
    throw new Error('Resposta do Gemini sem nenhuma parcela — documento precisa de ao menos 1 parcela.')
  }
  if (!bruto.valores || typeof bruto.valores.valorTotal !== 'number') {
    throw new Error('Resposta do Gemini sem valores.valorTotal numérico — extração inválida.')
  }

  // Valida cada parcela individualmente: valor numérico e data no
  // formato ISO (YYYY-MM-DD) — sem isso a parcela não pode ser persistida
  const regexDataIso = /^\d{4}-\d{2}-\d{2}$/
  bruto.parcelas.forEach((p, index) => {
    if (typeof p.valor !== 'number') {
      throw new Error(`Parcela ${index + 1}: valor não é numérico.`)
    }
    if (!p.dataVencimento || !regexDataIso.test(p.dataVencimento)) {
      throw new Error(`Parcela ${index + 1}: dataVencimento ausente ou fora do formato ISO (YYYY-MM-DD).`)
    }
  })

  // Remonta no shape final, movendo a sugestão da IA para origemIaSugestao
  return {
    tipoDocumento: bruto.tipoDocumento,
    categoriaFinanceira: bruto.categoriaFinanceira,
    favorecido: {
      nome: bruto.favorecido.nome,
      cnpjCpf: bruto.favorecido.cnpjCpf ?? null,
      endereco: bruto.favorecido.endereco ?? null,
    },
    documentoOrigem: {
      numeroDocumento: bruto.documentoOrigem?.numeroDocumento ?? null,
      dataEmissao: bruto.documentoOrigem?.dataEmissao ?? null,
      competencia: bruto.documentoOrigem?.competencia ?? null,
    },
    parcelas: bruto.parcelas,
    valores: {
      valorOriginal: bruto.valores.valorOriginal ?? bruto.valores.valorTotal,
      valorDesconto: bruto.valores.valorDesconto ?? 0,
      valorJurosMulta: bruto.valores.valorJurosMulta ?? 0,
      valorTotal: bruto.valores.valorTotal,
    },
    extensaoCategoria: bruto.extensaoCategoria ?? {},
    origemIaSugestao: bruto.origemDespesaSugeridaIA
      ? {
          tipoSugerido: bruto.origemDespesaSugeridaIA.tipoSugerido as 'empresarial' | 'pessoal_socio' | 'indefinido',
          nomeBeneficiarioMencionado: bruto.origemDespesaSugeridaIA.nomeBeneficiarioMencionado,
          justificativa: bruto.origemDespesaSugeridaIA.justificativa,
        }
      : null,
  }
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
  const token = (req.headers.authorization ?? '').replace('Bearer ', '').trim() || null
  if (!token) return res.status(401).json({ erro: 'Não autorizado' })

  const supabaseAdmin = getSupabaseAdmin()
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ erro: 'Não autorizado' })

  // ── Body ──────────────────────────────────────────────────
  const { arquivoBase64, mimeType } = req.body as CorpoRequisicaoImportarDocumento

  if (!arquivoBase64 || !mimeType) {
    return res.status(400).json({ erro: 'Corpo da requisição incompleto: arquivoBase64 e mimeType são obrigatórios.' })
  }

  try {
    // ── Passo 0: chama o Gemini e valida a resposta ──
    const { dadosExtraidos } = await extrairDocumentoComGemini({ arquivoBase64, mimeType })
    const documento = validarEMontarDocumento(dadosExtraidos as DadosBrutosGemini)

    // ── Guarda de defesa em profundidade (Handoff, Bug #1) ──
    // Aqui é onde essa guarda importa mais: diferente do XML (que já
    // valida estruturalmente o papel de destinatário/emitente), a IA
    // pode, em tese, confundir o favorecido com a própria empresa quando
    // o CNPJ da Ceras Babinete aparece no documento como cliente/tomador
    const cnpjFavorecidoLimpo = (documento.favorecido.cnpjCpf ?? '').replace(/\D/g, '')
    if (cnpjFavorecidoLimpo === '10666614000160') {
      return res.status(422).json({
        erro: 'A IA extraiu a própria Ceras Babinete como favorecido — isso é sempre um erro de extração (a empresa nunca é favorecido em Despesas, apenas pagador). Documento rejeitado antes de qualquer gravação.',
      })
    }

    // ── Passo 1: cross-reference + auto-criação de fornecedor ──
    const fornecedorMatch = await buscarOuCriarFornecedor(supabaseAdmin, documento.favorecido)

    // ── Passo 2: classificação determinística de origemDespesa ──
    // Os sinais de fallback já incluem a sugestão da IA (origemIaSugestao),
    // que entra como reforço do sinal "nome_alias", nunca decide sozinha
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
      origem_ia_sugestao: documento.origemIaSugestao ?? null, // guardado só como referência na UI, nunca decide

      documento_numero: documento.documentoOrigem.numeroDocumento,
      documento_data_emissao: documento.documentoOrigem.dataEmissao,
      documento_competencia: documento.documentoOrigem.competencia,

      valor_original: documento.valores.valorOriginal,
      valor_desconto: documento.valores.valorDesconto,
      valor_juros_multa: documento.valores.valorJurosMulta,
      valor_total: documento.valores.valorTotal,

      status_pagamento: 'em_aberto',

      extensao_categoria: documento.extensaoCategoria,

      origem_entrada: 'ia_gemini',

      deleted_at: null,
    }

    // ── Monta as parcelas prontas para revisão (ainda não persistidas) ──
    const parcelas: DespesaParcelaInsert[] = documento.parcelas.map((p) => ({
      despesa_id: '', // preenchido só na persistência (confirmar.ts)
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
    console.error('[importar-documento] erro no pipeline de processamento:', mensagemErro)
    return res.status(500).json({ erro: `Falha ao processar documento: ${mensagemErro}` })
  }
}
