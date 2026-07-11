// ============================================================
// lib/pagar/parserComprovanteTxt.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Pagar
// Função: Parsing determinístico (com fallback Gemini por bloco) do
//         arquivo de nome fixo Comprovantes_BB.txt, que pode conter
//         MÚLTIPLOS comprovantes Pix concatenados no mesmo arquivo
//         (o BB sempre sobrescreve o mesmo nome de arquivo a cada
//         exportação, por isso a dedupe é por comprovante individual,
//         não por hash de arquivo — ver duplicateCheckPagar.ts)
// Conecta com: types/contasAPagar.ts (RegistroComprovanteTxt, tipo de
//              retorno), pages/api/pagar/importar-comprovante.ts
//              (chamador — decide qual dos 2 parsers usar conforme o
//              tipo de arquivo recebido), lib/pagar/duplicateCheckPagar.ts
//              (dedupe por identificador_natural, chamado pela API route
//              APÓS este parser retornar os registros, não aqui dentro —
//              este arquivo é puro parsing de texto, sem acesso a banco)
// Referência: Especificacao_Modulo_Contas_a_Pagar.md, Seção 5,
//             "Function: Parsing de Comprovante — TXT (arquivo de nome
//             fixo, multi-comprovante)" — formato confirmado a partir
//             do arquivo real Comprovantes_BB.txt
// ============================================================

// Importa o SDK oficial do Gemini — usado só no fallback, quando o
// parsing determinístico de um bloco específico falha ou produz dado
// inconsistente (Especificação §2.4: "IA é sempre fallback, nunca
// caminho primário")
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { Schema } from '@google/generative-ai'

// Importa o tipo de retorno de cada registro individual extraído,
// definido em types/contasAPagar.ts (fonte única de verdade do shape)
import type { RegistroComprovanteTxt } from '@/types/contasAPagar'


// ------------------------------------------------------------
// CONSTANTE: linha usada como delimitador de início de cada novo
// bloco de comprovante dentro do arquivo (Especificação §5, passo 2).
// É o cabeçalho institucional fixo do sistema BB — estável, pois é
// gerado por sistema, não digitado à mão
// ------------------------------------------------------------
const MARCADOR_INICIO_BLOCO = 'SISBB  -  SISTEMA DE INFORMACOES BANCO DO BRASIL'


// ------------------------------------------------------------
// CONSTANTE: nome do modelo Gemini usado no fallback — mesmo modelo
// já validado no módulo Despesas (lib/despesas/extracaoIaCliente.ts),
// reaproveitado por consistência de comportamento/custo
// ------------------------------------------------------------
const NOME_MODELO_GEMINI = 'gemini-2.5-flash'


// ------------------------------------------------------------
// TIPO: retorno consolidado da função de parsing do arquivo inteiro —
// separa registros extraídos com sucesso de blocos que falharam mesmo
// após o fallback (para o resumo de importação exibir ao usuário)
// ------------------------------------------------------------
export interface ResultadoParsingComprovanteTxt {
  registros: RegistroComprovanteTxt[] // um item por comprovante Pix identificado no arquivo
  blocosComErro: number // blocos que nem o parsing determinístico nem o fallback Gemini conseguiram extrair
}


// ------------------------------------------------------------
// Função: dividirEmBlocos
// Divide o conteúdo bruto do arquivo em blocos individuais, usando
// MARCADOR_INICIO_BLOCO como delimitador de início de cada novo bloco
// (Especificação §5, passo 2) — cada bloco mantém o marcador no início,
// para que os regexes de extração encontrem o contexto completo
// ------------------------------------------------------------
function dividirEmBlocos(conteudoArquivo: string): string[] {
  // Normaliza quebras de linha (o arquivo real vem em CRLF, Windows/BB)
  // para \n simples, simplificando todos os regexes de linha abaixo
  const conteudoNormalizado = conteudoArquivo.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Divide o conteúdo pelo marcador, mantendo o próprio marcador como
  // prefixo de cada pedaço resultante (via lookahead), já que ele faz
  // parte do formato esperado pelos parsers de campo mais abaixo
  const partes = conteudoNormalizado.split(new RegExp(`(?=${MARCADOR_INICIO_BLOCO})`))

  // Remove pedaços vazios/só-whitespace que podem sobrar antes do
  // primeiro marcador (ex: linha em branco no topo do arquivo real)
  return partes.map((parte) => parte.trim()).filter((parte) => parte.length > 0)
}


// ------------------------------------------------------------
// Função: extrairCampo
// Helper genérico: procura, dentro das linhas de um bloco, a primeira
// linha que começa com o rótulo informado e retorna o texto após o
// rótulo, já trimado. Retorna null se o rótulo não for encontrado —
// nunca lança erro aqui, quem decide se é obrigatório é o chamador
// ------------------------------------------------------------
function extrairCampo(linhasDoBloco: string[], rotulo: string): string | null {
  // Percorre cada linha do bloco procurando o rótulo no início
  for (const linha of linhasDoBloco) {
    // Compara ignorando espaços à esquerda da linha (o BB às vezes
    // indenta campos de forma inconsistente entre exportações)
    const linhaTrimada = linha.trimStart()
    if (linhaTrimada.startsWith(rotulo)) {
      // Retorna tudo depois do rótulo, trimado nas duas pontas
      return linhaTrimada.slice(rotulo.length).trim()
    }
  }
  // Rótulo não encontrado neste bloco
  return null
}


// ------------------------------------------------------------
// Função: converterDataBrParaIso
// Converte "DD/MM/YYYY" (ou "DD/MM/YYYY - HH:MM:SS", usa só a parte
// de data) para o formato ISO "YYYY-MM-DD" exigido pelos tipos do
// projeto. Retorna null se o formato não bater com o esperado —
// nunca tenta "adivinhar" uma data malformada
// ------------------------------------------------------------
function converterDataBrParaIso(dataBr: string | null): string | null {
  if (!dataBr) return null

  // Extrai só os primeiros 10 caracteres no padrão DD/MM/YYYY,
  // ignorando qualquer sufixo de hora que venha depois (" - HH:MM:SS")
  const match = dataBr.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (!match) return null

  // Reordena para ISO — nunca reformata os dígitos em si (extração literal)
  const [, dia, mes, ano] = match
  return `${ano}-${mes}-${dia}`
}


// ------------------------------------------------------------
// Função: converterValorBrParaNumero
// Converte "R$3.000,00" (formato monetário brasileiro) para número
// (3000.00). Retorna null se o formato não for reconhecível
// ------------------------------------------------------------
function converterValorBrParaNumero(valorBr: string | null): number | null {
  if (!valorBr) return null

  // Remove o prefixo "R$" e qualquer espaço, mantendo só dígitos/pontuação
  const somenteNumero = valorBr.replace('R$', '').trim()

  // Remove separador de milhar (ponto) e troca separador decimal
  // (vírgula) por ponto, formato que o parseFloat do JS entende
  const numeroFormatoJs = somenteNumero.replace(/\./g, '').replace(',', '.')

  const valor = parseFloat(numeroFormatoJs)

  // Se o resultado não for um número válido, retorna null em vez de NaN —
  // NaN silencioso é um dos padrões incorretos já encontrados em outros
  // parsers do projeto (ver Relatorio_Auditoria_Modulo_Despesas.md)
  return Number.isFinite(valor) ? valor : null
}


// ------------------------------------------------------------
// Função: normalizarSomenteDigitos
// Remove toda pontuação de uma string, deixando só os dígitos —
// usado para testar se a CHAVE PIX é um CPF/CNPJ numérico
// ------------------------------------------------------------
function normalizarSomenteDigitos(texto: string): string {
  return texto.replace(/\D/g, '')
}


// ------------------------------------------------------------
// Função: resolverDocumentoIdentificado
// Aplica a "nota crítica de parsing — CPF mascarado" da Especificação
// §5: se CHAVE PIX for um CPF (11 dígitos) ou CNPJ (14 dígitos)
// numérico sem máscara, ela é a fonte primária de identificação do
// favorecido. Caso contrário, retorna null — o CPF mascarado e o nome
// ficam como sinais auxiliares para o Motor de Conciliação decidir,
// nunca resolvidos aqui (este parser não faz matching contra roster/
// fornecedores, é responsabilidade exclusiva do motor de conciliação)
// ------------------------------------------------------------
function resolverDocumentoIdentificado(chavePix: string | null): string | null {
  if (!chavePix) return null

  const somenteDigitos = normalizarSomenteDigitos(chavePix)

  // CPF (11 dígitos) ou CNPJ (14 dígitos) numérico sem máscara —
  // retorna os dígitos limpos; o Motor de Conciliação já sabe lidar
  // com fallback de dígito bruto vs. valor formatado (mesmo padrão já
  // documentado no projeto para busca de CNPJ/CPF)
  if (somenteDigitos.length === 11 || somenteDigitos.length === 14) {
    return somenteDigitos
  }

  // Chave aleatória, e-mail ou telefone — não serve como documento
  return null
}


// ------------------------------------------------------------
// TIPO: schema de saída estruturada pedido ao Gemini no fallback —
// espelha exatamente os campos que o parsing determinístico também
// tenta extrair, para que o resultado do fallback seja um "encaixe"
// direto no mesmo shape, sem lógica de conversão duplicada
// ------------------------------------------------------------
const SCHEMA_FALLBACK_COMPROVANTE_TXT = {
  type: 'object',
  properties: {
    id: { type: 'string', nullable: true, description: 'Valor do campo "ID:" — identificador único da transação Pix' },
    autenticacaoSisbb: { type: 'string', nullable: true, description: 'Valor do campo "AUTENTICACAO SISBB:"' },
    dataPagamento: { type: 'string', description: 'Data do campo "DATA:", convertida para ISO YYYY-MM-DD' },
    nomeFavorecido: { type: 'string', description: 'Valor literal do campo "PAGO PARA:" — nunca normalizar/corrigir' },
    cpfMascarado: { type: 'string', nullable: true, description: 'Valor literal do campo "CPF:", incluindo os asteriscos de máscara' },
    chavePix: { type: 'string', nullable: true, description: 'Valor literal do campo "CHAVE PIX:"' },
    valor: { type: 'number', description: 'Valor numérico do campo "VALOR:", já convertido de R$X.XXX,XX para número' },
  },
  required: ['dataPagamento', 'nomeFavorecido', 'valor'],
} as const


// ------------------------------------------------------------
// Função: extrairBlocoComGemini
// Fallback por bloco individual — só é chamado quando o parsing
// determinístico não conseguiu extrair um campo obrigatório ou
// produziu um valor estruturalmente inconsistente (Especificação
// §2.4). Envia SÓ o texto do bloco problemático, nunca o arquivo
// inteiro, mantendo o custo de IA mínimo
// ------------------------------------------------------------
async function extrairBlocoComGemini(textoBloco: string): Promise<Partial<RegistroComprovanteTxt> | null> {
  // Reaproveita a mesma chave dedicada já usada no módulo Despesas —
  // nenhuma chave nova é criada (Especificação §2.4)
  const chaveApi = process.env.GEMINI_API_KEY_MOTOR_UNIVERSAL

  // Sem chave configurada, não há como acionar o fallback — retorna
  // null e deixa o chamador contar este bloco como erro, em vez de
  // lançar uma exceção que interromperia o processamento dos demais
  // blocos do mesmo arquivo
  if (!chaveApi) return null

  try {
    // Instancia o client do SDK do Gemini com a chave dedicada
    const genAI = new GoogleGenerativeAI(chaveApi)

    // Configura o modelo para saída estruturada JSON, seguindo o
    // schema definido acima
    const modelo = genAI.getGenerativeModel({
      model: NOME_MODELO_GEMINI,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: SCHEMA_FALLBACK_COMPROVANTE_TXT as unknown as Schema,
      },
    })

    // Envia só o texto do bloco problemático + uma instrução curta —
    // não reenvia o arquivo inteiro (custo/escopo mínimo)
    const resultado = await modelo.generateContent([
      {
        text:
          'Extraia os dados deste comprovante de Pix do Banco do Brasil, campo a campo, ' +
          'de forma literal (não corrija nomes, não normalize valores além de convertê-los ' +
          'para número). Retorne exatamente conforme o schema JSON configurado.\n\n' +
          textoBloco,
      },
    ])

    // Extrai e faz parse do JSON retornado
    const textoResposta = resultado.response.text()
    return JSON.parse(textoResposta) as Partial<RegistroComprovanteTxt>
  } catch (err: unknown) {
    // Convenção do projeto: catch (err: unknown), nunca "any" — e o
    // fallback falhando não deve derrubar o processamento dos outros
    // blocos, só este bloco específico conta como erro
    return null
  }
}


// ------------------------------------------------------------
// Função: parsearBlocoDeterministico
// Tenta extrair todos os campos de UM bloco usando os anchors textuais
// fixos documentados na Especificação §5. Retorna null se algum campo
// obrigatório não for encontrado ou vier estruturalmente inválido —
// nesse caso o chamador aciona o fallback Gemini para este bloco
// ------------------------------------------------------------
function parsearBlocoDeterministico(textoBloco: string): RegistroComprovanteTxt | null {
  // Quebra o bloco em linhas individuais para os helpers de campo
  const linhasDoBloco = textoBloco.split('\n')

  // Extrai a chave de dedupe primária — "ID:" — e o fallback
  // "AUTENTICACAO SISBB:", ambos podem coexistir no mesmo bloco
  const id = extrairCampo(linhasDoBloco, 'ID:')
  const autenticacaoSisbb = extrairCampo(linhasDoBloco, 'AUTENTICACAO SISBB:')

  // Pelo menos UM dos dois identificadores precisa existir — sem
  // nenhum deles, não há como fazer dedupe deste comprovante, então
  // trata como falha do parsing determinístico (aciona fallback)
  if (!id && !autenticacaoSisbb) return null

  // Extrai e converte a data — campo "DATA:", formato "DD/MM/YYYY - HH:MM:SS"
  const dataBruta = extrairCampo(linhasDoBloco, 'DATA:')
  const dataPagamento = converterDataBrParaIso(dataBruta)
  if (!dataPagamento) return null // data obrigatória e inválida = falha determinística

  // Extrai o nome do favorecido — campo "PAGO PARA:", extração literal
  const nomeFavorecido = extrairCampo(linhasDoBloco, 'PAGO PARA:')
  if (!nomeFavorecido) return null // nome obrigatório

  // Extrai e converte o valor — campo "VALOR:", formato "R$X.XXX,XX"
  const valorBruto = extrairCampo(linhasDoBloco, 'VALOR:')
  const valor = converterValorBrParaNumero(valorBruto)
  if (valor === null) return null // valor obrigatório e numérico

  // Campos auxiliares — CPF mascarado e Chave Pix, ambos opcionais
  // no shape, mas usados pela regra de identificação do documento
  const cpfMascarado = extrairCampo(linhasDoBloco, 'CPF:')
  const chavePix = extrairCampo(linhasDoBloco, 'CHAVE PIX:')

  // Aplica a regra crítica da Especificação §5: Chave Pix numérica
  // sem máscara > CPF mascarado (sinal auxiliar apenas)
  const documentoIdentificado = resolverDocumentoIdentificado(chavePix)

  // IMPORTANTE — regra não-negociável do topo da Especificação: o campo
  // "CNPJ DO PAGADOR" deste bloco NUNCA é usado para identificar quem
  // pagou (é sempre a própria Ceras Babinete, fixado em código via
  // PAGADOR_FIXO em types/contasAPagar.ts) — por isso este parser nem
  // sequer extrai esse campo, para eliminar a tentação de usá-lo depois

  return {
    id,
    autenticacaoSisbb,
    dataPagamento,
    nomeFavorecido,
    cpfMascarado,
    chavePix,
    valor,
    documentoIdentificado,
  }
}


// ------------------------------------------------------------
// Função: parseComprovanteTxt (export principal deste arquivo)
// Recebe o conteúdo bruto do arquivo Comprovantes_BB.txt, divide em
// blocos, tenta parsing determinístico em cada um, aciona fallback
// Gemini bloco a bloco quando necessário, e retorna a lista completa
// de registros extraídos (a dedupe contra pagar_comprovantes_processados
// é responsabilidade do CHAMADOR, via duplicateCheckPagar.ts — este
// parser é uma função pura de texto, sem acesso a banco)
// ------------------------------------------------------------
export async function parseComprovanteTxt(
  conteudoArquivo: string, // conteúdo bruto do arquivo TXT, como veio do upload
): Promise<ResultadoParsingComprovanteTxt> {
  // Divide o arquivo inteiro em blocos individuais de comprovante
  const blocos = dividirEmBlocos(conteudoArquivo)

  // Acumuladores do resultado final
  const registros: RegistroComprovanteTxt[] = []
  let blocosComErro = 0

  // Processa cada bloco sequencialmente (poucos blocos por arquivo na
  // prática — não há necessidade de paralelizar e complicar o controle
  // de erro por bloco)
  for (const bloco of blocos) {
    // Primeira tentativa: parsing determinístico via anchors textuais
    const registroDeterministico = parsearBlocoDeterministico(bloco)

    if (registroDeterministico) {
      // Parsing determinístico teve sucesso — usa direto, sem acionar IA
      registros.push(registroDeterministico)
      continue
    }

    // Parsing determinístico falhou — aciona fallback Gemini só para
    // este bloco específico (Especificação §2.4: fallback nunca é o
    // caminho primário, só entra quando o determinístico não resolve)
    const registroViaFallback = await extrairBlocoComGemini(bloco)

    // Valida que o fallback retornou os campos mínimos obrigatórios
    // antes de aceitar o resultado — nunca assume que a IA acertou
    if (
      registroViaFallback &&
      registroViaFallback.dataPagamento &&
      registroViaFallback.nomeFavorecido &&
      typeof registroViaFallback.valor === 'number'
    ) {
      registros.push({
        id: registroViaFallback.id ?? null,
        autenticacaoSisbb: registroViaFallback.autenticacaoSisbb ?? null,
        dataPagamento: registroViaFallback.dataPagamento,
        nomeFavorecido: registroViaFallback.nomeFavorecido,
        cpfMascarado: registroViaFallback.cpfMascarado ?? null,
        chavePix: registroViaFallback.chavePix ?? null,
        valor: registroViaFallback.valor,
        // Reaplica a mesma regra de identificação de documento sobre o
        // resultado do fallback, para manter consistência de lógica
        documentoIdentificado: resolverDocumentoIdentificado(registroViaFallback.chavePix ?? null),
      })
    } else {
      // Nem o parsing determinístico nem o fallback conseguiram extrair
      // este bloco — conta como erro, exibido no resumo final ao usuário
      // (Especificação §5, "Edge cases": nunca inventar dado)
      blocosComErro += 1
    }
  }

  return { registros, blocosComErro }
}
