// ============================================================
// lib/motorUniversal/geminiClient.ts
// Página avulsa: Motor Universal de Documentos Financeiros (teste)
// Função: Encapsular a chamada à API do Gemini (modelo 2.5 Flash) para
//         extrair um documento financeiro (PDF ou imagem) em formato
//         JSON Universal, usando saída estruturada (response_schema).
// Conecta com: lib/motorUniversal/promptMotorUniversal.ts (prompt +
//              GEMINI_RESPONSE_SCHEMA), types/motorUniversal.ts (tipo de
//              retorno), e é consumido pela API route
//              pages/api/teste-motor-universal/processar.ts
// Referência: spec seção 2.4 ("APIs & Integrations" — Gemini) e seção 5
//              ("Function: Document Classification & Extraction")
//
// CHAVE DE API: usa exclusivamente GEMINI_API_KEY_MOTOR_UNIVERSAL,
// variável de ambiente dedicada e isolada deste módulo de teste — NUNCA
// reaproveitar a chave do sistema de orçamentos existente (spec seção 2.5).
// ============================================================

// Importa o SDK oficial do Google para a API do Gemini
import { GoogleGenerativeAI } from '@google/generative-ai'

// Importa o prompt de instrução e o schema de saída estruturada definidos
// no arquivo companheiro deste módulo (fonte única de verdade do schema)
import { buildPromptMotorUniversal, GEMINI_RESPONSE_SCHEMA } from './promptMotorUniversal'

// ------------------------------------------------------------
// CONSTANTE: nome do modelo Gemini usado nesta fase de teste.
// Conforme spec seção 2.4 e seção 8 (Open Questions): ponto de partida é
// Flash, com possibilidade de migrar para Pro ou estratégia híbrida
// depois de avaliar os resultados reais deste teste.
// ------------------------------------------------------------
const NOME_MODELO_GEMINI = 'gemini-2.5-flash'

// ------------------------------------------------------------
// TIPO: parâmetros de entrada da função de extração — o arquivo já deve
// vir em base64 (o chamador, na API route, é responsável por ler o
// arquivo do upload e converter) junto com seu mimeType real.
// ------------------------------------------------------------
export interface ParametrosExtracaoGemini {
  arquivoBase64: string // conteúdo do arquivo (PDF ou imagem) codificado em base64
  mimeType: string // ex: "application/pdf", "image/jpeg", "image/png"
}

// ------------------------------------------------------------
// TIPO: retorno bruto da função — o JSON já parseado (ainda não validado
// contra o tipo JsonUniversal completo; essa validação/montagem final
// acontece na API route, que combina isto com pagador/statusPagamento
// fixos e com o resultado de origemDespesaClassifier.ts)
// ------------------------------------------------------------
export interface RespostaExtracaoGemini {
  dadosExtraidos: unknown // objeto JSON retornado pelo Gemini, conforme GEMINI_RESPONSE_SCHEMA
  modeloUsado: string // nome do modelo Gemini usado nesta chamada, para registro/auditoria
}

// ------------------------------------------------------------
// Função: extrairDocumentoComGemini
// Envia o arquivo (PDF/imagem) diretamente ao Gemini 2.5 Flash, que lê o
// documento nativamente (sem pré-processamento/rasterização, conforme
// spec seção 5), e retorna o JSON estruturado conforme o response_schema.
// ------------------------------------------------------------
export async function extrairDocumentoComGemini(
  parametros: ParametrosExtracaoGemini, // arquivo em base64 + mimeType
): Promise<RespostaExtracaoGemini> {
  // Lê a chave de API dedicada deste módulo — nunca a chave de outro sistema
  const chaveApi = process.env.GEMINI_API_KEY_MOTOR_UNIVERSAL

  // Validação defensiva: se a chave não estiver configurada, falha cedo
  // com mensagem clara, em vez de deixar o SDK lançar um erro genérico
  if (!chaveApi) {
    throw new Error(
      'GEMINI_API_KEY_MOTOR_UNIVERSAL não está definida em .env.local — configure a chave dedicada deste módulo antes de processar documentos.',
    )
  }

  // Instancia o client do SDK do Gemini com a chave dedicada
  const genAI = new GoogleGenerativeAI(chaveApi)

  // Obtém a referência do modelo, já configurado para saída estruturada:
  // responseMimeType força JSON puro, responseSchema valida o formato
  const modelo = genAI.getGenerativeModel({
    model: NOME_MODELO_GEMINI,
    generationConfig: {
      responseMimeType: 'application/json', // força a resposta a ser JSON puro, sem texto ao redor
      responseSchema: GEMINI_RESPONSE_SCHEMA as any, // schema definido em promptMotorUniversal.ts (cast: shape compatível, tipagem exata do SDK pode divergir em minúcias de casing)
    },
  })

  // Monta o conteúdo enviado ao modelo: o texto de instrução (prompt) +
  // o arquivo em si, como inlineData em base64 (Gemini lê PDFs nativamente,
  // sem necessidade de OCR ou conversão prévia)
  const resultado = await modelo.generateContent([
    { text: buildPromptMotorUniversal() }, // instruções de extração literal + regras de negócio
    {
      inlineData: {
        mimeType: parametros.mimeType, // tipo real do arquivo enviado (pdf/imagem)
        data: parametros.arquivoBase64, // conteúdo do arquivo em base64
      },
    },
  ])

  // Extrai o texto da resposta (que, por causa do responseMimeType, já
  // deve ser um JSON puro, sem markdown ou texto adicional ao redor)
  const textoResposta = resultado.response.text()

  // Tenta fazer o parse do JSON retornado; se falhar, propaga um erro
  // claro em vez de deixar o JSON.parse lançar um erro genérico difícil
  // de depurar na API route que chama esta função
  let dadosExtraidos: unknown
  try {
    dadosExtraidos = JSON.parse(textoResposta)
  } catch (err: unknown) {
    // Convenção do projeto: catch (err: unknown), nunca "any"
    const mensagemErro = err instanceof Error ? err.message : String(err)
    throw new Error(`Gemini retornou um JSON inválido: ${mensagemErro}. Resposta bruta: ${textoResposta}`)
  }

  // Retorna o objeto já parseado, junto com o nome do modelo usado
  // (útil para registro/auditoria e para decisões futuras sobre Flash vs Pro)
  return {
    dadosExtraidos,
    modeloUsado: NOME_MODELO_GEMINI,
  }
}
