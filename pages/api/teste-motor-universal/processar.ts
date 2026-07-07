// ============================================================
// pages/api/teste-motor-universal/processar.ts
// Página avulsa: Motor Universal de Documentos Financeiros (teste)
// Função: Endpoint que recebe um documento já convertido em dados de
//         entrada (PDF/imagem em base64 PARA a IA extrair, OU o JSON
//         Universal já parseado no client via nfseXmlParser.ts) e executa
//         o restante do pipeline: extração (se aplicável), classificação
//         de origemDespesa, cross-reference de fornecedor, e checagem de
//         duplicidade — retornando tudo pronto para a UI exibir.
// Conecta com: lib/motorUniversal/geminiClient.ts, fornecedorMatch.ts,
//              origemDespesaClassifier.ts, duplicateCheck.ts,
//              types/motorUniversal.ts (ResultadoProcessamento)
// Referência: spec seção 5 (funções de extração, cross-reference,
//              classificação, e duplicate check) e seção 2.7 (rota isolada)
//
// NOTA DE ARQUITETURA — POR QUE O XML NÃO É PARSEADO AQUI:
// Conforme decisão confirmada com o usuário ("xml, não vai pra API"), o
// parse do XML de NFS-e acontece inteiramente no client
// (app/teste-motor-universal/page.tsx, via lib/motorUniversal/nfseXmlParser.ts,
// que usa DOMParser — indisponível neste runtime Node.js). Esta rota
// recebe o JSON Universal já pronto nesse caso, e só executa os passos
// pós-extração (classificação, cross-reference, dedup), que são os mesmos
// para os dois caminhos (IA ou XML).
// ============================================================

// Importa os tipos padrão de request/response do Pages Router
import type { NextApiRequest, NextApiResponse } from 'next'

// Importa a função de extração via Gemini (usada apenas no caminho PDF/imagem)
import { extrairDocumentoComGemini } from '@/lib/motorUniversal/geminiClient'

// Importa a função de cross-reference com a tabela fornecedores
import { buscarFornecedorPorCrossReference } from '@/lib/motorUniversal/fornecedorMatch'

// Importa a função de classificação determinística de origemDespesa
import { classificarOrigemDespesa } from '@/lib/motorUniversal/origemDespesaClassifier'

// Importa a função de checagem de duplicidade
import { verificarDuplicidade } from '@/lib/motorUniversal/duplicateCheck'

// Importa os tipos do JSON Universal e do envelope de resultado
import type { JsonUniversal, ResultadoProcessamento, Pagador } from '@/types/motorUniversal'

// ------------------------------------------------------------
// CONSTANTE: pagador fixo — nunca extraído de documento, sempre a
// própria Ceras Babinete (conforme spec seção 2.1.1)
// ------------------------------------------------------------
const PAGADOR_FIXO: Pagador = {
  nome: 'CERAS BABINETE LTDA. ME',
  cnpj: '10.666.614/0001-60',
}

// ------------------------------------------------------------
// TIPO: shape do bloco parcial de JSON Universal que chega até aqui,
// sem os campos que só são preenchidos nesta própria rota
// ------------------------------------------------------------
type JsonUniversalParcial = Omit<JsonUniversal, 'pagador' | 'origemDespesa' | 'statusPagamento' | 'anexoOriginal'>

// ------------------------------------------------------------
// TIPO: shape esperado do corpo da requisição — dois formatos possíveis,
// diferenciados pelo campo "origem"
// ------------------------------------------------------------
type CorpoRequisicaoProcessar =
  | {
      origem: 'ia' // caminho PDF/imagem, precisa chamar o Gemini
      arquivoBase64: string
      mimeType: string
      hashArquivo: string // já calculado no client via crypto.subtle.digest
    }
  | {
      origem: 'xml' // caminho XML, já parseado no client via nfseXmlParser.ts
      jsonUniversalParcial: JsonUniversalParcial
      hashArquivo: string
    }

// ------------------------------------------------------------
// CONFIGURAÇÃO DA ROTA: aumenta o limite padrão do body parser do
// Pages Router (1MB por padrão), insuficiente para receber fotos de
// celular convertidas em base64 (que facilmente passam de 5-10MB).
// Sem isso, a requisição falha silenciosamente/trava para arquivos
// grandes — foi um dos problemas reais encontrados ao testar via celular.
// ------------------------------------------------------------
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '25mb', // margem confortável para fotos de celular em alta resolução
    },
  },
}

// ------------------------------------------------------------
// Handler principal da rota
// ------------------------------------------------------------
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Esta rota só aceita POST — qualquer outro método é rejeitado
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido. Use POST.' })
    return
  }

  try {
    // Lê o corpo da requisição já tipado conforme os dois formatos possíveis
    const corpo = req.body as CorpoRequisicaoProcessar

    // ── Passo 1: obtém o JSON Universal parcial, via IA ou via XML já pronto ──
    let jsonUniversalParcial: JsonUniversalParcial
    let modeloUsado: string | null = null

    if (corpo.origem === 'ia') {
      // Caminho PDF/imagem: chama o Gemini para extrair os dados
      const resultadoGemini = await extrairDocumentoComGemini({
        arquivoBase64: corpo.arquivoBase64,
        mimeType: corpo.mimeType,
      })

      // O retorno do Gemini já deve estar no shape esperado (validado pelo
      // responseSchema em promptMotorUniversal.ts), mas o tipo declarado é
      // "unknown" — fazemos o cast aqui, assumindo que o schema garantiu
      // a estrutura correta na resposta da API
      jsonUniversalParcial = resultadoGemini.dadosExtraidos as JsonUniversalParcial
      modeloUsado = resultadoGemini.modeloUsado

      // ── Trava de segurança: o favorecido NUNCA pode ser a própria Ceras
      // Babinete (regra 9 do prompt) — esta é uma checagem defensiva em
      // código, pois instrução de prompt sozinha não é garantia 100% de
      // comportamento do modelo (bug real observado em teste: a IA
      // confundiu o destinatário/cliente do documento com o favorecido) ──
      const cnpjFavorecidoLimpo = (jsonUniversalParcial.favorecido.cnpjCpf || '').replace(/\D/g, '')
      if (cnpjFavorecidoLimpo === '10666614000160') {
        throw new Error(
          'A IA identificou a própria Ceras Babinete como favorecido — isso é sempre um erro de extração (o favorecido deve ser quem emite/recebe o pagamento, nunca a empresa pagadora). Revise o documento ou tente novamente.',
        )
      }
    } else if (corpo.origem === 'xml') {
      // Caminho XML: dados já vieram prontos do client (nfseXmlParser.ts)
      jsonUniversalParcial = corpo.jsonUniversalParcial
    } else {
      // Origem desconhecida — corpo da requisição malformado
      res.status(400).json({ error: 'Campo "origem" inválido — esperado "ia" ou "xml".' })
      return
    }

    // ── Passo 2: classificação determinística de origemDespesa ──
    // Monta os sinais de fallback disponíveis a partir do que foi extraído
    // (nem toda categoria tem todos os sinais; os ausentes ficam null)
    const extensao = jsonUniversalParcial.extensaoCategoria
    const enderecoDocumento =
      jsonUniversalParcial.favorecido.endereco ||
      extensao.concessionariasUtilidades?.enderecoUnidadeConsumidora ||
      extensao.aluguel?.imovel.endereco ||
      null

    const unidadeConsumidoraOuMatricula =
      extensao.concessionariasUtilidades?.codigoClienteUnidade || extensao.tributosEstadualMunicipal?.identificadorBem || null

    // Sugestão da IA só existe quando a origem foi "ia" (o parser de XML
    // não produz esse campo, já que não passa pela IA) — leitura tolerante
    // via "in", pois o campo não faz parte do tipo oficial JsonUniversalParcial
    const sugestaoIA =
      corpo.origem === 'ia' && 'origemDespesaSugeridaIA' in jsonUniversalParcial
        ? (jsonUniversalParcial as unknown as {
            origemDespesaSugeridaIA: { tipoSugerido: string; nomeBeneficiarioMencionado: string | null }
          }).origemDespesaSugeridaIA
        : null

    const { origemDespesa, resultado: origemDespesaClassificacao } = await classificarOrigemDespesa(
      jsonUniversalParcial.favorecido,
      jsonUniversalParcial.categoriaFinanceira,
      {
        enderecoDocumento,
        unidadeConsumidoraOuMatricula,
        cpfParcialDocumento: null, // não disponível neste teste — reservado para quando algum documento expuser CPF mascarado parcial
        sugestaoIA,
      },
    )

    // ── Passo 3: cross-reference com a tabela de produção fornecedores ──
    const fornecedorMatch = await buscarFornecedorPorCrossReference(jsonUniversalParcial.favorecido)

    // ── Passo 4: checagem de duplicidade (hash + chave composta) ──
    const duplicateCheck = await verificarDuplicidade(corpo.hashArquivo, jsonUniversalParcial)

    // ── Passo 5: monta o JSON Universal completo, combinando os campos
    // extraídos/computados com os campos sempre fixos em código ──
    const jsonUniversalCompleto: JsonUniversal = {
      ...jsonUniversalParcial,
      pagador: PAGADOR_FIXO, // sempre fixo, nunca extraído
      origemDespesa, // calculado no passo 2
      statusPagamento: 'em_aberto', // toda extração nova começa em aberto
      anexoOriginal: null, // não utilizado nesta fase de teste (arquivo original não é persistido)
    }

    // ── Monta e retorna o envelope completo para a UI ──
    const resposta: ResultadoProcessamento = {
      jsonUniversal: jsonUniversalCompleto,
      fornecedorMatch,
      duplicateCheck,
      origemDespesaClassificacao,
      hashArquivo: corpo.hashArquivo,
    }

    // Loga qual modelo Gemini foi usado (quando aplicável), útil para
    // auditoria/depuração durante a fase de teste
    if (modeloUsado) {
      console.log(`[teste-motor-universal] Documento processado via Gemini (${modeloUsado})`)
    }

    res.status(200).json(resposta)
  } catch (err: unknown) {
    // Convenção do projeto: catch (err: unknown), nunca "any"
    const mensagemErro = err instanceof Error ? err.message : String(err)
    console.error('[teste-motor-universal/processar] Erro:', mensagemErro)
    res.status(500).json({ error: mensagemErro })
  }
}
