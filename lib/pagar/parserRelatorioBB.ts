// ============================================================
// lib/pagar/parserRelatorioBB.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Pagar
// Função: Parsing determinístico (com fallback Gemini por linha) do
//         Relatório de Pagamentos Realizados BB (PDF consolidado,
//         múltiplos pagamentos por arquivo, baixa em lote).
// Conecta com: pdf-parse (extração de texto do PDF — dependência nova,
//              aprovada por Maycon nesta sessão), types/contasAPagar.ts
//              (RegistroRelatorioBB, tipo de retorno),
//              pages/api/pagar/importar-relatorio.ts (chamador,
//              responsável por checar hash contra
//              pagar_arquivos_importados ANTES de chamar este parser —
//              este arquivo não acessa banco)
// Referência: Especificacao_Modulo_Contas_a_Pagar.md, Seção 5,
//             "Function: Parsing do Relatório de Pagamentos BB" —
//             formato confirmado a partir do arquivo real
//             10072026_154410RelatorioBB.pdf (testado linha a linha
//             antes desta entrega — ver conversa de build)
//
// DESCOBERTA REAL CONFIRMADA POR MAYCON: em alguns registros pagos por
// CNPJ (observado nos pagamentos do Maycon-CNPJ), o relatório real traz
// um token numérico solto (11 ou 14 dígitos, sem rótulo) entre o nome
// do favorecido e o valor — não documentado no formato original da
// Especificação. Este parser SEPARA esse token do nome (nunca deixa
// vazar para dentro de nomeFavorecido) e preserva em
// identificadorInlineNaoRotulado, sem usá-lo no matching (o CNPJ/CPF
// da segunda linha do registro já é a fonte de verdade do documento).
// ============================================================

// Biblioteca de extração de texto de PDF — mesma dependência nova
// aprovada nesta sessão, já usada em parserComprovantePdf.ts
// QA fix (bug real em uso, confirmado via documentação oficial do
// pacote): o package.json instala pdf-parse@^2.4.5, cuja API é
// COMPLETAMENTE diferente da v1 que o código original assumia. Na
// v1, o pacote exportava uma função default (`pdf(buffer)`). Na v2,
// não existe mais função default nenhuma — o pacote exporta a
// classe nomeada `PDFParse`, usada como
// `new PDFParse({ data: buffer }).getText()`. O helper anterior
// (`'default' in pdfParseModule ? ... : ...`) sempre caía no branch
// errado e tentava chamar o módulo inteiro como função, causando
// "pdfParse is not a function" em runtime — o `tsc` não pegava
// porque o cast `as unknown as FuncaoPdfParse` escondia o erro do
// compilador.
import { PDFParse } from 'pdf-parse'

// SDK do Gemini — usado só no fallback por linha (Especificação §2.4)
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { Schema } from '@google/generative-ai'

// Tipo de retorno de cada registro, definido em types/contasAPagar.ts
import type { RegistroRelatorioBB } from '@/types/contasAPagar'


// ------------------------------------------------------------
// Helper: extrairTextoPdf
// Wrapper da API real de pdf-parse v2 — instancia o parser, extrai
// o texto, e SEMPRE libera os recursos via destroy() (mesmo em caso
// de erro, via try/finally), conforme a documentação oficial do
// pacote. Substitui a resolução em runtime da versão anterior.
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
// CONSTANTES: âncoras de conteúdo que confirmam que o PDF é de fato
// um Relatório de Pagamentos Realizados do BB da Ceras Babinete —
// Especificação §5: "Não confiar apenas no nome [do arquivo] —
// validar também o conteúdo"
// ------------------------------------------------------------
const ANCORA_TITULO_RELATORIO = 'Relatório de Pagamentos Realizados'
const ANCORA_CNPJ_EMPRESA = '10.666.614/0001-60' // CNPJ da Ceras Babinete — confirma que o relatório é da empresa certa

// Nome do modelo Gemini usado no fallback — mesmo já validado no projeto
const NOME_MODELO_GEMINI = 'gemini-2.5-flash'


// ------------------------------------------------------------
// REGEX: primeira linha lógica de um registro — sequencial + data +
// nome do favorecido + opcionalmente "Nosso Número: XXX" (só quando
// o pagamento foi via boleto) + valor "R$ X.XXX,XX" no fim da linha.
// O grupo de nome é non-greedy (.+?) para não "engolir" o restante
// da linha — a âncora fixa "R$" no fim é o que resolve onde o nome
// termina, mesmo quando há o token inline não rotulado (tratado à
// parte, ver separarTokenInlineDoNome abaixo)
// ------------------------------------------------------------
const REGEX_LINHA_REGISTRO = /^(\d+)\s+(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(?:Nosso N[uú]mero:\s*(\S+)\s+)?R\$\s*([\d.,]+)\s*$/

// ------------------------------------------------------------
// REGEX: segunda linha lógica de um registro — CNPJ/CPF do favorecido
// + tipo de instrumento (Boleto/Pix) + canal. Usa "includes"-style
// (não startsWith) porque, no PDF real, essa linha vem prefixada por
// uma sequência de sublinhados de separação visual do relatório
// (ex: "_______ CNPJ: 05.902.953/0001-69 Boleto Pagamento(Online)") —
// a âncora "CNPJ:"/"CPF:" é buscada em qualquer posição da linha
// ------------------------------------------------------------
const REGEX_LINHA_DOCUMENTO = /(?:CNPJ|CPF):\s*([\d./-]+)\s+(Boleto|Pix)\s+(Pagamento\(Online\)|Transferência\(Online\))/

// Cabeçalho de período — "Período: DD/MM/YYYY a DD/MM/YYYY" (uso só
// informativo/exibição, Especificação §5, passo 4 — sem validação de
// continuidade entre importações sucessivas)
const REGEX_PERIODO = /Período:\s*(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})/

// Rodapé de totais — usado só como checagem de consistência interna,
// não bloqueante (adição própria, não pedida explicitamente na
// Especificação, mas de baixo custo e alto valor para detectar
// falhas silenciosas de parsing)
const REGEX_TOTAIS = /QUANTIDADE DE PAGAMENTOS:\s*(\d+).*VALOR TOTAL:\s*R\$\s*([\d.,]+)/


// ------------------------------------------------------------
// Função: converterDataBrParaIso / converterValorBrParaNumero
// Mesma lógica (deliberadamente duplicada, não compartilhada entre
// parsers — mesmo padrão já usado no projeto para remParser/retParser/
// txtBbParser, cada um auto-contido)
// ------------------------------------------------------------
function converterDataBrParaIso(dataBr: string): string | null {
  const match = dataBr.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (!match) return null
  const [, dia, mes, ano] = match
  return `${ano}-${mes}-${dia}`
}

function converterValorBrParaNumero(valorBr: string): number | null {
  const numeroFormatoJs = valorBr.replace(/\./g, '').replace(',', '.')
  const valor = parseFloat(numeroFormatoJs)
  return Number.isFinite(valor) ? valor : null
}


// ------------------------------------------------------------
// Função: separarTokenInlineDoNome
// Trata a descoberta real confirmada por Maycon: se o texto do nome
// capturado terminar em um token puramente numérico de 11 ou 14
// dígitos (CPF ou CNPJ sem pontuação), separa esse token do nome —
// nunca deixa esse ruído vazar para dentro de nomeFavorecido, que
// precisa continuar sendo o nome literal e limpo do favorecido
// ------------------------------------------------------------
function separarTokenInlineDoNome(nomeCru: string): { nome: string; tokenInline: string | null } {
  const match = nomeCru.match(/^(.*?)\s+(\d{11}|\d{14})$/)
  if (match) {
    return { nome: match[1].trim(), tokenInline: match[2] }
  }
  // Nenhum token solto encontrado — nome permanece como veio, literal
  return { nome: nomeCru.trim(), tokenInline: null }
}


// ------------------------------------------------------------
// TIPO: retorno consolidado do parsing do arquivo inteiro
// ------------------------------------------------------------
export interface ResultadoParsingRelatorioBB {
  registros:          RegistroRelatorioBB[] // um item por pagamento identificado no relatório
  periodoDe:          string | null // ISO date — só informativo (Especificação §5, passo 4)
  periodoAte:         string | null
  linhasComErro:      number // linhas que nem o parsing determinístico nem o fallback conseguiram extrair
  // Checagem de consistência interna (adição própria, não bloqueante):
  // compara os totais extraídos do rodapé do relatório contra a soma
  // real dos registros parseados — se divergir, sinaliza para revisão
  // manual, mas NUNCA bloqueia a importação nem descarta registros
  totalDeclaradoRelatorio: { quantidade: number; valor: number } | null
  consistenteComRodape: boolean | null // null se o rodapé não pôde ser lido
}


// ------------------------------------------------------------
// TIPO: schema de saída estruturada pedido ao Gemini no fallback por
// linha — espelha o shape de RegistroRelatorioBB (sem o campo
// identificadorInlineNaoRotulado, que é resolvido depois pela mesma
// função separarTokenInlineDoNome, reaplicada sobre o nome retornado
// pelo fallback, para manter consistência de lógica entre os 2 caminhos)
// ------------------------------------------------------------
const SCHEMA_FALLBACK_LINHA_RELATORIO = {
  type: 'object',
  properties: {
    sequencial: { type: 'number', description: 'Número sequencial no início da linha' },
    dataPagamento: { type: 'string', description: 'Data da linha, convertida para ISO YYYY-MM-DD' },
    nomeFavorecido: { type: 'string', description: 'Nome do favorecido, literal — sem incluir "Nosso Número:" nem tokens numéricos soltos' },
    cnpjCpfFavorecido: { type: 'string', description: 'CNPJ ou CPF da linha seguinte, literal' },
    valor: { type: 'number', description: 'Valor em reais, numérico' },
    nossoNumero: { type: 'string', nullable: true, description: 'Nosso Número, só presente em pagamentos via Boleto' },
    tipoInstrumento: { type: 'string', enum: ['boleto', 'pix'] },
    canal: { type: 'string', enum: ['pagamento_online', 'transferencia_online'] },
  },
  required: ['sequencial', 'dataPagamento', 'nomeFavorecido', 'cnpjCpfFavorecido', 'valor', 'tipoInstrumento', 'canal'],
} as const


// ------------------------------------------------------------
// Função: extrairLinhaComGemini
// Fallback só para UMA linha/registro problemático — nunca reenvia o
// relatório inteiro (Especificação §5, passo 5: "aciona Gemini como
// fallback só para aquela linha problemática")
// ------------------------------------------------------------
async function extrairLinhaComGemini(textoLinha1: string, textoLinha2: string | undefined): Promise<Partial<RegistroRelatorioBB> | null> {
  const chaveApi = process.env.GEMINI_API_KEY_MOTOR_UNIVERSAL
  if (!chaveApi) return null

  try {
    const genAI = new GoogleGenerativeAI(chaveApi)
    const modelo = genAI.getGenerativeModel({
      model: NOME_MODELO_GEMINI,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: SCHEMA_FALLBACK_LINHA_RELATORIO as unknown as Schema,
      },
    })

    const resultado = await modelo.generateContent([
      {
        text:
          'Extraia os dados desta linha (ou par de linhas) de um Relatório de Pagamentos ' +
          'Realizados do Banco do Brasil, de forma literal. A primeira linha tem: número ' +
          'sequencial, data, nome do favorecido, opcionalmente "Nosso Número:" (só em ' +
          'boletos), e o valor "R$". A segunda linha tem: CNPJ ou CPF do favorecido, e o ' +
          'tipo de instrumento (Boleto ou Pix) com o canal. Ignore qualquer token numérico ' +
          'solto sem rótulo entre o nome e o valor — não inclua no nome. Retorne conforme o schema.\n\n' +
          `Linha 1: ${textoLinha1}\nLinha 2: ${textoLinha2 ?? '(não disponível)'}`,
      },
    ])

    const textoResposta = resultado.response.text()
    return JSON.parse(textoResposta) as Partial<RegistroRelatorioBB>
  } catch (_err: unknown) {
    // Convenção do projeto: catch (err: unknown), nunca "any" — prefixo
    // _ sinaliza intencionalmente não usado, sem perder a tipagem
    return null
  }
}


// ------------------------------------------------------------
// Função: parseRelatorioBB (export principal deste arquivo)
// Recebe o buffer do PDF, extrai o texto (pdf-parse), valida que é um
// Relatório BB reconhecível, e faz parsing linha a linha via os
// anchors documentados, com fallback Gemini por linha quando preciso.
// A checagem de hash contra pagar_arquivos_importados é
// responsabilidade do CHAMADOR (esta função não acessa banco).
// ------------------------------------------------------------
export async function parseRelatorioBB(
  bufferArquivo: Buffer, // conteúdo binário do PDF, como veio do upload
): Promise<ResultadoParsingRelatorioBB> {
  // Extrai o texto do PDF via pdf-parse
  const textoDocumento = await extrairTextoPdf(bufferArquivo)

  // Validação de conteúdo — Especificação §5: nunca confiar só no nome
  // do arquivo, checar as duas âncoras de texto obrigatórias
  if (!textoDocumento.includes(ANCORA_TITULO_RELATORIO) || !textoDocumento.includes(ANCORA_CNPJ_EMPRESA)) {
    throw new Error(
      'Arquivo não reconhecido como Relatório de Pagamentos Realizados BB da Ceras Babinete ' +
      '(âncoras de conteúdo obrigatórias não encontradas).',
    )
  }

  // Normaliza quebras de linha, trima cada linha e descarta linhas
  // vazias (que não carregam anchors relevantes para este parser)
  const linhas = textoDocumento
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((linha) => linha.trim())
    .filter((linha) => linha.length > 0)

  // Extrai o período do cabeçalho — só informativo, sem validação de
  // continuidade entre importações (Especificação §5, passo 4)
  const matchPeriodo = textoDocumento.match(REGEX_PERIODO)
  const periodoDe = matchPeriodo ? converterDataBrParaIso(matchPeriodo[1]) : null
  const periodoAte = matchPeriodo ? converterDataBrParaIso(matchPeriodo[2]) : null

  // Extrai os totais declarados no rodapé — usado só para a checagem
  // de consistência interna no final, nunca bloqueia o processamento
  const matchTotais = textoDocumento.match(REGEX_TOTAIS)
  const totalDeclaradoRelatorio = matchTotais
    ? {
        quantidade: parseInt(matchTotais[1], 10),
        valor: converterValorBrParaNumero(matchTotais[2]) ?? 0,
      }
    : null

  const registros: RegistroRelatorioBB[] = []
  let linhasComErro = 0

  // Percorre as linhas procurando o par (linha de registro + linha de
  // documento) — cada registro ocupa exatamente 2 linhas lógicas
  // consecutivas (Especificação §5, formato documentado)
  for (let i = 0; i < linhas.length; i++) {
    const matchLinhaRegistro = linhas[i].match(REGEX_LINHA_REGISTRO)

    // Linha não é o início de um registro (é cabeçalho, rodapé, ou a
    // segunda linha de um registro já consumido no passo anterior) —
    // segue para a próxima sem contar como erro
    if (!matchLinhaRegistro) continue

    const [, sequencialStr, dataStr, nomeCru, nossoNumero, valorStr] = matchLinhaRegistro
    const proximaLinha = linhas[i + 1]
    const matchLinhaDocumento = proximaLinha ? proximaLinha.match(REGEX_LINHA_DOCUMENTO) : null

    // Tenta montar o registro completo via parsing determinístico —
    // exige as duas linhas batendo E data/valor conversíveis
    const dataPagamento = converterDataBrParaIso(dataStr)
    const valor = converterValorBrParaNumero(valorStr)

    if (matchLinhaDocumento && dataPagamento !== null && valor !== null) {
      const { nome, tokenInline } = separarTokenInlineDoNome(nomeCru)
      const [, cnpjCpfFavorecido, instrumentoStr, canalStr] = matchLinhaDocumento

      registros.push({
        sequencial: parseInt(sequencialStr, 10),
        dataPagamento,
        nomeFavorecido: nome,
        identificadorInlineNaoRotulado: tokenInline,
        cnpjCpfFavorecido,
        valor,
        nossoNumero: nossoNumero || null,
        tipoInstrumento: instrumentoStr === 'Boleto' ? 'boleto' : 'pix',
        canal: canalStr.startsWith('Pagamento') ? 'pagamento_online' : 'transferencia_online',
      })

      // Pula a próxima linha, já consumida como a "linha de documento"
      // deste registro — evita que o loop tente reprocessá-la sozinha
      i += 1
      continue
    }

    // Parsing determinístico não completou este registro — aciona
    // fallback Gemini só para este par de linhas (Especificação §5,
    // passo 5: nunca o documento inteiro)
    const registroViaFallback = await extrairLinhaComGemini(linhas[i], proximaLinha)

    if (
      registroViaFallback &&
      typeof registroViaFallback.sequencial === 'number' &&
      registroViaFallback.dataPagamento &&
      registroViaFallback.nomeFavorecido &&
      registroViaFallback.cnpjCpfFavorecido &&
      typeof registroViaFallback.valor === 'number' &&
      registroViaFallback.tipoInstrumento &&
      registroViaFallback.canal
    ) {
      // Reaplica a mesma regra de separação de token inline sobre o
      // nome retornado pelo fallback, por consistência entre os
      // dois caminhos de extração
      const { nome, tokenInline } = separarTokenInlineDoNome(registroViaFallback.nomeFavorecido)

      registros.push({
        sequencial: registroViaFallback.sequencial,
        dataPagamento: registroViaFallback.dataPagamento,
        nomeFavorecido: nome,
        identificadorInlineNaoRotulado: tokenInline,
        cnpjCpfFavorecido: registroViaFallback.cnpjCpfFavorecido,
        valor: registroViaFallback.valor,
        nossoNumero: registroViaFallback.nossoNumero ?? null,
        tipoInstrumento: registroViaFallback.tipoInstrumento,
        canal: registroViaFallback.canal,
      })

      // Só pula a próxima linha se ela de fato parecia ser a "linha de
      // documento" deste registro (evita pular uma linha legítima de
      // outro registro, caso o layout real estivesse mesmo diferente)
      if (matchLinhaDocumento) i += 1
      continue
    }

    // Nem o determinístico nem o fallback resolveram este registro —
    // conta como erro, exibido no resumo final (Especificação §5,
    // "Edge cases": CNPJ/CPF ilegível → pendente/não processável,
    // nunca inventar dado)
    linhasComErro += 1
  }

  // Checagem de consistência interna — compara o total declarado no
  // rodapé contra a soma real dos registros parseados. Não bloqueante:
  // só sinaliza para o resumo de importação exibir ao usuário
  const somaValores = registros.reduce((soma, registro) => soma + registro.valor, 0)
  const consistenteComRodape = totalDeclaradoRelatorio
    ? registros.length === totalDeclaradoRelatorio.quantidade &&
      Math.abs(somaValores - totalDeclaradoRelatorio.valor) < 0.01
    : null

  return {
    registros,
    periodoDe,
    periodoAte,
    linhasComErro,
    totalDeclaradoRelatorio,
    consistenteComRodape,
  }
}
