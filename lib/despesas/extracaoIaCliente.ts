// ============================================================
// lib/despesas/extracaoIaCliente.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Despesas
// Função: Encapsular a chamada à API do Gemini (modelo 2.5 Flash) para
//         extrair um documento financeiro (PDF, imagem, TXT, DOC, XLS,
//         XLSX) em formato de modelo canônico de extração, usando saída
//         estruturada (response_schema).
// Conecta com: lib/despesas/promptExtracaoDespesa.ts (prompt +
//              GEMINI_RESPONSE_SCHEMA), consumido pelas rotas
//              pages/api/despesas/importar-documento.ts
// Referência: Especificacao_Modulo_Despesas.md §2.4 ("APIs & Integrations"
//             — Gemini) e §5 ("Function: AI-Assisted Import")
//
// CHAVE DE API: usa exclusivamente GEMINI_API_KEY_MOTOR_UNIVERSAL — a
// mesma chave dedicada já configurada em .env.local (reaproveitada como
// está, conforme spec §2.5: "existing key, reused as-is, no new key
// needed"). O NOME da variável de ambiente permanece o já existente no
// projeto (renomeá-la exigiria reconfigurar o .env.local do usuário sem
// nenhum ganho); o que muda é só o código que a consome, agora oficial.
//
// NOTA — FORMATOS ALÉM DE PDF/IMAGEM (TXT, DOC, XLS, XLSX): a spec pede
// suporte a esses formatos adicionais no caminho de IA. A função abaixo
// já é genérica o suficiente (envia qualquer mimeType como inlineData) —
// mas a compatibilidade real do SDK do Gemini com DOC/XLS/XLSX binários
// deve ser verificada em teste manual antes de assumir que funciona sem
// ajuste (ver Especificacao_Modulo_Despesas.md §9, nota sobre verificar
// capacidades do SDK antes de assumir zero trabalho extra).
// ============================================================

// Importa o SDK oficial do Google para a API do Gemini
import { GoogleGenerativeAI } from '@google/generative-ai'

// Importa o prompt de instrução e o schema de saída estruturada definidos
// no arquivo companheiro deste módulo (fonte única de verdade do schema)
import { buildPromptExtracaoDespesa, GEMINI_RESPONSE_SCHEMA } from './promptExtracaoDespesa'

// ------------------------------------------------------------
// CONSTANTE: nome do modelo Gemini usado.
// Ponto de partida validado (Flash performou bem em todos os tipos de
// documento testados, incluindo foto de celular) — possibilidade de
// migrar para Pro ou estratégia híbrida permanece em aberto conforme
// Especificacao_Modulo_Despesas.md §8, "Open Questions".
// ------------------------------------------------------------
const NOME_MODELO_GEMINI = 'gemini-2.5-flash'

// ------------------------------------------------------------
// TIPO: parâmetros de entrada da função de extração — o arquivo já deve
// vir em base64 (o chamador, na API route, é responsável por ler o
// arquivo do upload e converter, usando FileReader.readAsDataURL() no
// client — NUNCA loop manual de bytes, ver nota de performance abaixo)
// junto com seu mimeType real.
// ------------------------------------------------------------
export interface ParametrosExtracaoGemini {
  arquivoBase64: string // conteúdo do arquivo (PDF, imagem, TXT, DOC, XLS, XLSX) codificado em base64
  mimeType: string // ex: "application/pdf", "image/jpeg", "text/plain", "application/vnd.ms-excel" etc.
}

// ------------------------------------------------------------
// TIPO: retorno bruto da função — o JSON já parseado (ainda não validado
// contra o tipo DocumentoExtraidoDespesa completo; essa validação/montagem
// final acontece na API route, que combina isto com fornecedor_id/
// origemDespesa/statusPagamento fixos e com o resultado do classificador)
// ------------------------------------------------------------
export interface RespostaExtracaoGemini {
  dadosExtraidos: unknown // objeto JSON retornado pelo Gemini, conforme GEMINI_RESPONSE_SCHEMA
  modeloUsado: string // nome do modelo Gemini usado nesta chamada, para registro/auditoria
}

// ------------------------------------------------------------
// Função: extrairDocumentoComGemini
// Envia o arquivo diretamente ao Gemini 2.5 Flash, que lê o documento
// nativamente (sem pré-processamento/rasterização), e retorna o JSON
// estruturado conforme o response_schema.
// ------------------------------------------------------------
export async function extrairDocumentoComGemini(
  parametros: ParametrosExtracaoGemini, // arquivo em base64 + mimeType
): Promise<RespostaExtracaoGemini> {
  // Lê a chave de API dedicada — GEMINI_API_KEY_MOTOR_UNIVERSAL, já
  // existente em .env.local, reaproveitada como está (spec §2.5)
  const chaveApi = process.env.GEMINI_API_KEY_MOTOR_UNIVERSAL

  // Validação defensiva: se a chave não estiver configurada, falha cedo
  // com mensagem clara, em vez de deixar o SDK lançar um erro genérico
  if (!chaveApi) {
    throw new Error(
      'GEMINI_API_KEY_MOTOR_UNIVERSAL não está definida em .env.local — configure a chave antes de processar documentos.',
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
      responseSchema: GEMINI_RESPONSE_SCHEMA as any, // schema definido em promptExtracaoDespesa.ts (cast: shape compatível, tipagem exata do SDK pode divergir em minúcias de casing)
    },
  })

  // Monta o conteúdo enviado ao modelo: o texto de instrução (prompt) +
  // o arquivo em si, como inlineData em base64 (Gemini lê PDFs/imagens
  // nativamente, sem necessidade de OCR ou conversão prévia)
  const resultado = await modelo.generateContent([
    { text: buildPromptExtracaoDespesa() }, // instruções de extração literal + regras de negócio
    {
      inlineData: {
        mimeType: parametros.mimeType, // tipo real do arquivo enviado
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
