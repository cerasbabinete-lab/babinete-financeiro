// ============================================================
// lib/pagar/parserComprovantePdf.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Pagar
// Função: Parsing determinístico (com fallback Gemini) do PDF de
//         comprovante individual de pagamento de boleto do BB —
//         um único registro por arquivo.
// Conecta com: pdf-parse (extração de texto do PDF — dependência nova,
//              aprovada por Maycon nesta sessão, mesma escolha usada
//              em parserRelatorioBB.ts), types/contasAPagar.ts
//              (RegistroComprovantePdf, tipo de retorno),
//              pages/api/pagar/importar-comprovante.ts (chamador)
// Referência: Especificacao_Modulo_Contas_a_Pagar.md, Seção 5,
//             "Function: Parsing de Comprovante Individual — PDF" —
//             formato confirmado a partir do arquivo real
//             1__07072026__Pagamento__32974.pdf (testado linha a
//             linha antes desta entrega — ver conversa de build)
// REGRA NÃO-NEGOCIÁVEL (Instruções obrigatórias do Builder, item 4):
//             o campo "PAGADOR:" deste documento NUNCA é usado para
//             identificar quem pagou — o pagador é sempre fixo em
//             código (PAGADOR_FIXO, types/contasAPagar.ts). Este
//             parser nem sequer extrai o nome/CPF de "PAGADOR:",
//             só pula esse bloco ao procurar o CNPJ/CPF do
//             beneficiário, para eliminar a tentação de usá-lo depois.
// ============================================================

// Biblioteca de extração de texto de PDF — dependência nova aprovada
// nesta sessão (não havia nenhuma no projeto antes deste módulo;
// Despesas manda o PDF inteiro pro Gemini, nunca extraiu texto
// deterministicamente)
// QA fix (bug real em uso, confirmado via documentação oficial do
// pacote): package.json instala pdf-parse@^2.4.5, cuja API é
// completamente diferente da v1 assumida pelo código original — v2
// não tem função default, exporta a classe nomeada `PDFParse`
// (`new PDFParse({ data: buffer }).getText()`). O helper anterior
// causava "pdfParse is not a function" em runtime.
import { PDFParse } from 'pdf-parse'

// SDK do Gemini — usado só no fallback (Especificação §2.4: IA nunca
// é o caminho primário)
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { Schema } from '@google/generative-ai'

// Tipo de retorno definido em types/contasAPagar.ts — fonte única de
// verdade do shape (corrigido nesta sessão: faltavam numeroDocumento
// e a linha digitável/código de barras na primeira versão do tipo)
import type { RegistroComprovantePdf } from '@/types/contasAPagar'


// ------------------------------------------------------------
// Helper: extrairTextoPdf
// Wrapper da API real de pdf-parse v2 — mesma implementação de
// parserRelatorioBB.ts (deliberadamente duplicada, cada parser
// auto-contido, mesmo padrão do resto do módulo)
// ------------------------------------------------------------
async function extrairTextoPdf(bufferArquivo: Buffer): Promise<string> {
  const parser = new PDFParse({ data: bufferArquivo })
  try {
    const resultado = await parser.getText()
    return resultado.text
  } finally {
    await parser.destroy()
  }
}


// ------------------------------------------------------------
// CONSTANTE: texto-âncora que confirma que o PDF é de fato um
// comprovante de pagamento de título do BB, antes de tentar parsear —
// mesmo princípio de validação de conteúdo (não só nome de arquivo)
// já usado no parser do Relatório BB
// ------------------------------------------------------------
const ANCORA_TIPO_DOCUMENTO = 'COMPROVANTE DE PAGAMENTO DE TITULOS'


// ------------------------------------------------------------
// CONSTANTE: nome do modelo Gemini usado no fallback — mesmo já
// validado no módulo Despesas
// ------------------------------------------------------------
const NOME_MODELO_GEMINI = 'gemini-2.5-flash'


// ------------------------------------------------------------
// Função: converterDataBrParaIso
// Converte "DD/MM/YYYY" para "YYYY-MM-DD". Retorna null se o formato
// não bater — nunca tenta adivinhar uma data malformada. (Duplicada
// deliberadamente de parserComprovanteTxt.ts — cada parser deste
// módulo é auto-contido, mesmo padrão já usado no projeto para
// remParser.ts/retParser.ts/txtBbParser.ts, que também não
// compartilham helpers de conversão entre si.)
// ------------------------------------------------------------
function converterDataBrParaIso(dataBr: string | null): string | null {
  if (!dataBr) return null
  const match = dataBr.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (!match) return null
  const [, dia, mes, ano] = match
  return `${ano}-${mes}-${dia}`
}


// ------------------------------------------------------------
// Função: converterValorBrParaNumero
// Converte "329,74" ou "1.585,15" (formato monetário brasileiro, sem
// prefixo "R$" neste documento) para número. Retorna null se inválido
// ------------------------------------------------------------
function converterValorBrParaNumero(valorBr: string | null): number | null {
  if (!valorBr) return null
  const numeroFormatoJs = valorBr.replace(/\./g, '').replace(',', '.')
  const valor = parseFloat(numeroFormatoJs)
  return Number.isFinite(valor) ? valor : null
}


// ------------------------------------------------------------
// Função: extrairValorAposLabel
// Procura, entre as linhas já trimadas do documento, a primeira linha
// que começa com o rótulo informado e retorna o texto após o rótulo,
// trimado. Usado para os campos "LABEL valor" na mesma linha
// (ex: "NR. DOCUMENTO 70.703")
// ------------------------------------------------------------
function extrairValorAposLabel(linhas: string[], rotulo: string): string | null {
  for (const linha of linhas) {
    if (linha.startsWith(rotulo)) {
      return linha.slice(rotulo.length).trim()
    }
  }
  return null
}


// ------------------------------------------------------------
// Função: extrairNomeAposBeneficiario
// Localiza a linha exata "BENEFICIARIO:" (comparação exata, não
// startsWith, para não confundir com "BENEFICIARIO FINAL:") e retorna
// a próxima linha não-vazia — que é o nome do favorecido
// ------------------------------------------------------------
function extrairNomeAposBeneficiario(linhas: string[]): string | null {
  const indiceBeneficiario = linhas.findIndex((linha) => linha === 'BENEFICIARIO:')
  if (indiceBeneficiario === -1) return null

  for (let i = indiceBeneficiario + 1; i < linhas.length; i++) {
    if (linhas[i].length > 0) return linhas[i]
  }
  return null
}


// ------------------------------------------------------------
// Função: extrairCnpjCpfDoBeneficiario
// Aplica a regra da Especificação §5, passo 3: "o primeiro CNPJ após
// BENEFICIARIO:, nunca o do PAGADOR". Varre as linhas entre
// "BENEFICIARIO:" e "PAGADOR:" (delimitador de fim da janela de
// busca) procurando a primeira linha "CNPJ:" ou "CPF:" — nunca lê
// nada depois de "PAGADOR:" neste bloco
// ------------------------------------------------------------
function extrairCnpjCpfDoBeneficiario(linhas: string[]): string | null {
  const indiceBeneficiario = linhas.findIndex((linha) => linha === 'BENEFICIARIO:')
  if (indiceBeneficiario === -1) return null

  // "PAGADOR:" marca o limite — nada depois dele entra nesta busca,
  // regra não-negociável do topo da Especificação
  const indicePagador = linhas.findIndex((linha, i) => i > indiceBeneficiario && linha === 'PAGADOR:')
  const limiteFim = indicePagador === -1 ? linhas.length : indicePagador

  for (let i = indiceBeneficiario + 1; i < limiteFim; i++) {
    if (linhas[i].startsWith('CNPJ:')) return linhas[i].slice('CNPJ:'.length).trim()
    if (linhas[i].startsWith('CPF:')) return linhas[i].slice('CPF:'.length).trim()
  }
  return null
}


// ------------------------------------------------------------
// Função: extrairLinhaDigitavelOuCodigoBarras
// A string numérica longa (linha digitável/código de barras) aparece
// imediatamente ANTES da linha "BENEFICIARIO:" no documento real
// (Especificação §5, formato documentado). Procura a primeira linha
// puramente numérica (10+ dígitos) andando para trás a partir de
// "BENEFICIARIO:", parando no primeiro obstáculo não-numérico
// não-vazio (evita pegar algo de um bloco anterior por engano)
// ------------------------------------------------------------
function extrairLinhaDigitavelOuCodigoBarras(linhas: string[]): string | null {
  const indiceBeneficiario = linhas.findIndex((linha) => linha === 'BENEFICIARIO:')
  if (indiceBeneficiario <= 0) return null

  for (let i = indiceBeneficiario - 1; i >= 0; i--) {
    if (/^\d{10,}$/.test(linhas[i])) return linhas[i]
    if (linhas[i].length > 0) break // linha não-vazia que não bate — para de procurar
  }
  return null
}


// ------------------------------------------------------------
// TIPO: schema de saída estruturada pedido ao Gemini no fallback —
// espelha o shape de RegistroComprovantePdf
// ------------------------------------------------------------
const SCHEMA_FALLBACK_COMPROVANTE_PDF = {
  type: 'object',
  properties: {
    nrAutenticacao: { type: 'string', description: 'Valor do campo "NR.AUTENTICACAO"' },
    numeroDocumento: { type: 'string', description: 'Valor do campo "NR. DOCUMENTO", literal (ex: "70.703")' },
    dataVencimento: { type: 'string', nullable: true, description: 'Campo "DATA DE VENCIMENTO", convertido para ISO YYYY-MM-DD' },
    dataPagamento: { type: 'string', description: 'Campo "DATA DO PAGAMENTO", convertido para ISO YYYY-MM-DD' },
    nomeFavorecido: { type: 'string', description: 'Nome logo após o rótulo "BENEFICIARIO:" — literal, nunca o de "PAGADOR:"' },
    cnpjCpfFavorecido: { type: 'string', nullable: true, description: 'Primeiro CNPJ ou CPF que aparece após "BENEFICIARIO:", nunca o de "PAGADOR:"' },
    valorDocumento: { type: 'number', nullable: true, description: 'Campo "VALOR DO DOCUMENTO", numérico' },
    valor: { type: 'number', description: 'Campo "VALOR COBRADO", numérico — é o valor efetivo pago' },
    linhaDigitavelOuCodigoBarras: { type: 'string', nullable: true, description: 'String numérica longa que aparece antes de "BENEFICIARIO:"' },
  },
  required: ['nrAutenticacao', 'numeroDocumento', 'dataPagamento', 'nomeFavorecido', 'valor'],
} as const


// ------------------------------------------------------------
// Função: extrairComGemini
// Fallback do documento inteiro — só acionado quando o parsing
// determinístico não conseguir extrair um campo obrigatório
// (Especificação §5, passo 4). Envia o TEXTO já extraído do PDF
// (não o arquivo binário de novo), pedindo re-extração estruturada
// ------------------------------------------------------------
async function extrairComGemini(textoDocumento: string): Promise<Partial<RegistroComprovantePdf> | null> {
  const chaveApi = process.env.GEMINI_API_KEY_MOTOR_UNIVERSAL
  if (!chaveApi) return null

  try {
    const genAI = new GoogleGenerativeAI(chaveApi)
    const modelo = genAI.getGenerativeModel({
      model: NOME_MODELO_GEMINI,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: SCHEMA_FALLBACK_COMPROVANTE_PDF as unknown as Schema,
      },
    })

    const resultado = await modelo.generateContent([
      {
        text:
          'Extraia os dados deste comprovante de pagamento de título do Banco do Brasil, ' +
          'campo a campo, de forma literal. IMPORTANTE: o CNPJ/CPF do favorecido é sempre o ' +
          'que aparece logo após o rótulo "BENEFICIARIO:" — NUNCA o que aparece após ' +
          '"PAGADOR:". Use "VALOR COBRADO" como o campo "valor" (não "VALOR DO DOCUMENTO"). ' +
          'Retorne exatamente conforme o schema JSON configurado.\n\n' +
          textoDocumento,
      },
    ])

    const textoResposta = resultado.response.text()
    return JSON.parse(textoResposta) as Partial<RegistroComprovantePdf>
  } catch (_err: unknown) {
    // Convenção do projeto: catch (err: unknown), nunca "any" — prefixo
    // _ (mesmo padrão já usado no projeto, ex: ContasReceberModal.tsx)
    // sinaliza intencionalmente não usado, sem perder a tipagem
    return null
  }
}


// ------------------------------------------------------------
// Função: parseComprovantePdf (export principal deste arquivo)
// Recebe o buffer do PDF, extrai o texto (pdf-parse), tenta parsing
// determinístico via os anchors documentados, e aciona fallback
// Gemini no documento inteiro se algum campo obrigatório faltar.
// A dedupe contra pagar_comprovantes_processados (por nrAutenticacao)
// é responsabilidade do CHAMADOR, via duplicateCheckPagar.ts — esta
// função não acessa banco.
// ------------------------------------------------------------
export async function parseComprovantePdf(
  bufferArquivo: Buffer, // conteúdo binário do PDF, como veio do upload
): Promise<RegistroComprovantePdf> {
  // Extrai o texto do PDF via pdf-parse
  const textoDocumento = await extrairTextoPdf(bufferArquivo)

  // Validação de conteúdo — confirma que é de fato um comprovante de
  // pagamento de título do BB antes de tentar parsear (Especificação
  // §5, mesmo princípio de validação já aplicado no Relatório BB)
  if (!textoDocumento.includes(ANCORA_TIPO_DOCUMENTO)) {
    throw new Error(
      'Arquivo não reconhecido como comprovante de pagamento de título do BB ' +
      '(âncora de conteúdo "COMPROVANTE DE PAGAMENTO DE TITULOS" não encontrada).',
    )
  }

  // Normaliza quebras de linha e trima cada linha, mesma preparação
  // usada em parserComprovanteTxt.ts
  const linhas = textoDocumento
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((linha) => linha.trim())

  // Primeira tentativa: parsing determinístico via anchors textuais
  const nrAutenticacao = extrairValorAposLabel(linhas, 'NR.AUTENTICACAO')
  const numeroDocumento = extrairValorAposLabel(linhas, 'NR. DOCUMENTO')
  const dataVencimento = converterDataBrParaIso(extrairValorAposLabel(linhas, 'DATA DE VENCIMENTO'))
  const dataPagamento = converterDataBrParaIso(extrairValorAposLabel(linhas, 'DATA DO PAGAMENTO'))
  const nomeFavorecido = extrairNomeAposBeneficiario(linhas)
  const cnpjCpfFavorecido = extrairCnpjCpfDoBeneficiario(linhas)
  const valorDocumento = converterValorBrParaNumero(extrairValorAposLabel(linhas, 'VALOR DO DOCUMENTO'))
  // Regra da Especificação §5, edge case: VALOR DO DOCUMENTO e VALOR
  // COBRADO podem divergir (juros/desconto) — VALOR COBRADO é o valor
  // EFETIVO da baixa, é o que usamos como "valor" do registro
  const valor = converterValorBrParaNumero(extrairValorAposLabel(linhas, 'VALOR COBRADO'))
  const linhaDigitavelOuCodigoBarras = extrairLinhaDigitavelOuCodigoBarras(linhas)

  // Campos obrigatórios para considerar o parsing determinístico
  // bem-sucedido (Especificação §5, "Inputs/Outputs")
  const parsingDeterministicoCompleto =
    !!nrAutenticacao && !!numeroDocumento && !!dataPagamento && !!nomeFavorecido && valor !== null

  if (parsingDeterministicoCompleto) {
    return {
      nrAutenticacao: nrAutenticacao as string,
      numeroDocumento: numeroDocumento as string,
      dataVencimento,
      dataPagamento: dataPagamento as string,
      nomeFavorecido: nomeFavorecido as string,
      cnpjCpfFavorecido,
      valorDocumento,
      valor: valor as number,
      linhaDigitavelOuCodigoBarras,
    }
  }

  // Parsing determinístico não completou todos os campos obrigatórios
  // — aciona fallback Gemini no texto já extraído do documento inteiro
  // (Especificação §5, passo 4; §2.4: IA é sempre fallback)
  const registroViaFallback = await extrairComGemini(textoDocumento)

  if (
    registroViaFallback &&
    registroViaFallback.nrAutenticacao &&
    registroViaFallback.numeroDocumento &&
    registroViaFallback.dataPagamento &&
    registroViaFallback.nomeFavorecido &&
    typeof registroViaFallback.valor === 'number'
  ) {
    return {
      nrAutenticacao: registroViaFallback.nrAutenticacao,
      numeroDocumento: registroViaFallback.numeroDocumento,
      dataVencimento: registroViaFallback.dataVencimento ?? null,
      dataPagamento: registroViaFallback.dataPagamento,
      nomeFavorecido: registroViaFallback.nomeFavorecido,
      cnpjCpfFavorecido: registroViaFallback.cnpjCpfFavorecido ?? null,
      valorDocumento: registroViaFallback.valorDocumento ?? null,
      valor: registroViaFallback.valor,
      linhaDigitavelOuCodigoBarras: registroViaFallback.linhaDigitavelOuCodigoBarras ?? null,
    }
  }

  // Nem o parsing determinístico nem o fallback conseguiram extrair os
  // campos obrigatórios — falha explícita, nunca inventa dado
  // (Especificação §5, "Edge cases")
  throw new Error(
    'Não foi possível extrair os campos obrigatórios deste comprovante, ' +
    'nem via parsing determinístico nem via fallback Gemini. Documento pode ' +
    'estar em um layout diferente do esperado — revisão manual necessária.',
  )
}
