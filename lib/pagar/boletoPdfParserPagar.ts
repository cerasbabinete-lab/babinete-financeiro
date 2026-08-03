// ============================================================
// lib/pagar/boletoPdfParserPagar.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Pagar
// Função: Parser de boleto PDF recebido de um FORNECEDOR (a pagar) —
//         diferente de lib/boletoPdfParser.ts (Contas a Receber), que
//         só funciona porque TODO boleto de lá é emitido pela própria
//         Ceras Babinete via BB, com Nosso Número sempre prefixado
//         "2160261" e layout de texto fixo do MIGRATE.
//         Aqui o boleto vem de fornecedores diferentes (SKY, Casadei,
//         etc.), cada um podendo usar um banco e um layout de texto
//         diferente — não dá pra confiar em regex de layout específico.
//         A única parte verdadeiramente universal (padrão FEBRABAN,
//         válida pra qualquer banco do Brasil) é a LINHA DIGITÁVEL —
//         e ela sozinha já contém, codificados, o valor e a data de
//         vencimento do boleto, sem precisar achar rótulos de texto.
// Conecta com: pdf-parse (via pages/api/pagar/importar-boleto-pdf.ts,
//              que faz a extração de texto — este arquivo só recebe
//              o texto já extraído, mesma separação de responsabilidade
//              de lib/boletoPdfParser.ts em Contas a Receber),
//              lib/pagar/parserComprovantePdf.ts
//              (decodificarCampoLivreDaLinhaDigitavel, reaproveitado
//              verbatim — já validado contra o boleto real da SKY)
// Referência: usuário pediu "mesmo procedimento de Importar Boleto,
//             exatamente como funciona em Contas a Receber" — a
//             diferença de abordagem aqui (linha digitável decodificada
//             em vez de regex de layout fixo) foi confirmada com o
//             usuário antes de implementar, por causa da multiplicidade
//             de bancos/fornecedores neste módulo (Receber só tem um).
// ============================================================

import { decodificarCampoLivreDaLinhaDigitavel } from './parserComprovantePdf'

// ------------------------------------------------------------
// CONSTANTES: data-base do fator de vencimento FEBRABAN.
// O sistema original usava 07/10/1997 como base, mas o campo de 4
// dígitos estourou em 21/02/2025 (fator 9999) — a partir de
// 22/02/2025, o FEBRABAN definiu uma NOVA data-base, com o fator
// reiniciando em 1000 (não em 0, pra evitar ambiguidade visual).
// Testado e confirmado contra o boleto real da SKY (mesmo exemplo já
// validado pelo QA em parserComprovantePdf.ts): fator 1496 com a
// base nova decodifica para 2026-07-03, que é a data de vencimento
// real conhecida daquele boleto — com a base antiga o resultado
// estava errado (2001-11-11).
// ------------------------------------------------------------
const DATA_BASE_FEBRABAN_ANTIGA = Date.UTC(1997, 9, 7)  // 07/10/1997
const DATA_BASE_FEBRABAN_NOVA   = Date.UTC(2025, 1, 22) // 22/02/2025
const FATOR_INICIO_BASE_NOVA    = 1000

export interface BoletoPagarDecodificado {
  linhaDigitavel:  string       // 47 dígitos limpos (sem pontos/espaços)
  nossoNumero:     string       // campo livre de 25 dígitos — mesmo formato usado no Relatório BB
  dataVencimento:  string | null // ISO YYYY-MM-DD — decodificado direto da linha digitável
  valor:           number | null // decodificado direto da linha digitável
  codigoBanco:     string       // 3 primeiros dígitos — só informativo, não usado no matching
  cnpjCpfFornecedor: string | null // extração best-effort do texto (rótulos comuns), pode não achar
}

export interface ErroBoletoPagarPdf {
  campo:   string
  detalhe: string
}

// ------------------------------------------------------------
// Função: extrairLinhaDigitavelGenerica
// Busca a linha digitável em QUALQUER boleto brasileiro, sem assumir
// espaçamento/pontuação de um banco específico — procura blocos que
// pareçam uma linha digitável e confirma pelo comprimento exato de
// 47 dígitos depois de remover toda pontuação/espaço
// ------------------------------------------------------------
function extrairLinhaDigitavelGenerica(texto: string): string | null {
  // Candidatos: blocos de dígitos com pontos/espaços intercalados,
  // tamanho aproximado do padrão FEBRABAN (47 dígitos + até ~8
  // separadores = até ~55 caracteres)
  const candidatos = texto.match(/[\d](?:[\d.\s]){35,70}[\d]/g) ?? []
  for (const candidato of candidatos) {
    const digitos = candidato.replace(/\D/g, '')
    if (digitos.length === 47) return digitos
  }

  // Fallback: 47 dígitos consecutivos sem nenhuma pontuação (alguns
  // extratores de PDF colapsam os espaços da linha digitável)
  const direto = texto.match(/\b\d{47}\b/)
  if (direto) return direto[0]

  return null
}

// ------------------------------------------------------------
// Função: decodificarValorEVencimento
// Decodifica valor e data de vencimento DIRETO da linha digitável —
// algoritmo padrão FEBRABAN, válido pra qualquer banco. Últimos 14
// dígitos = fator de vencimento (4) + valor em centavos (10).
//
// Sempre tenta primeiro a base NOVA (22/02/2025, fator-1000) — é a
// única que faz sentido pra boletos correntes importados por este
// módulo (a base antiga só produziria datas passadas, de 1997 a
// 2025, irrelevantes pra um fluxo de "importar boleto a pagar
// agora"). Só cai pra base antiga se a nova base der uma data
// claramente implausível (fator < 1000, o que indicaria um boleto
// pré-transição sendo importado hoje, cenário extremamente
// improvável mas tratado sem lançar erro).
// Fator 0 (alguns boletos de convênio/sem vencimento definido) é
// tratado como "sem data" — nunca inventa uma data.
// ------------------------------------------------------------
function decodificarValorEVencimento(linha47: string): { dataVencimento: string | null; valor: number | null } {
  const fatorVencimentoStr = linha47.slice(33, 37)
  const valorStr = linha47.slice(37, 47)

  const fatorVencimento = parseInt(fatorVencimentoStr, 10)
  let dataVencimento: string | null = null

  if (Number.isFinite(fatorVencimento) && fatorVencimento > 0) {
    if (fatorVencimento >= FATOR_INICIO_BASE_NOVA) {
      const dataCalculada = new Date(DATA_BASE_FEBRABAN_NOVA + (fatorVencimento - FATOR_INICIO_BASE_NOVA) * 86_400_000)
      dataVencimento = dataCalculada.toISOString().slice(0, 10)
    } else {
      // Fator abaixo de 1000 — só faz sentido como base antiga
      // (boleto emitido antes de 22/02/2025); tratado como fallback,
      // não como caminho principal
      const dataCalculada = new Date(DATA_BASE_FEBRABAN_ANTIGA + fatorVencimento * 86_400_000)
      dataVencimento = dataCalculada.toISOString().slice(0, 10)
    }
  }

  const valorCentavos = parseInt(valorStr, 10)
  const valor = Number.isFinite(valorCentavos) && valorCentavos > 0 ? valorCentavos / 100 : null

  return { dataVencimento, valor }
}

// ------------------------------------------------------------
// Função: extrairCnpjCpfFornecedorBestEffort
// Tentativa best-effort de achar o CNPJ/CPF do fornecedor no texto —
// rótulos "CNPJ:"/"CPF:" são comuns na maioria dos layouts de boleto,
// mas NÃO garantidos (por isso "best-effort" — o matching principal
// não depende disso, usa como filtro extra quando disponível)
// ------------------------------------------------------------
function extrairCnpjCpfFornecedorBestEffort(texto: string): string | null {
  const match = texto.match(/CNPJ[:\s]*([\d]{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2})/i)
    ?? texto.match(/CPF[:\s]*([\d]{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2})/i)
  return match ? match[1].replace(/\D/g, '') : null
}

// ------------------------------------------------------------
// Função: parsearBoletoPagarPdf (export principal)
// Recebe o texto bruto já extraído do PDF (pela rota, via pdf-parse)
// e retorna os dados decodificados do boleto a pagar
// ------------------------------------------------------------
export function parsearBoletoPagarPdf(texto: string): {
  resultado: BoletoPagarDecodificado | null
  erros: ErroBoletoPagarPdf[]
} {
  const erros: ErroBoletoPagarPdf[] = []
  const textoNormalizado = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()

  const linhaDigitavel = extrairLinhaDigitavelGenerica(textoNormalizado)
  if (!linhaDigitavel) {
    erros.push({ campo: 'linhaDigitavel', detalhe: 'Linha digitável (47 dígitos, padrão FEBRABAN) não encontrada no PDF' })
    return { resultado: null, erros }
  }

  const nossoNumero = decodificarCampoLivreDaLinhaDigitavel(linhaDigitavel)
  if (!nossoNumero) {
    // Não deveria acontecer se linhaDigitavel já tem 47 dígitos
    // confirmados, mas defensivo — nunca assume
    erros.push({ campo: 'nossoNumero', detalhe: 'Falha ao decodificar o campo livre da linha digitável' })
    return { resultado: null, erros }
  }

  const { dataVencimento, valor } = decodificarValorEVencimento(linhaDigitavel)
  if (!dataVencimento) erros.push({ campo: 'dataVencimento', detalhe: 'Fator de vencimento zerado ou ilegível na linha digitável' })
  if (valor === null) erros.push({ campo: 'valor', detalhe: 'Valor ilegível na linha digitável' })

  const codigoBanco = linhaDigitavel.slice(0, 3)
  const cnpjCpfFornecedor = extrairCnpjCpfFornecedorBestEffort(textoNormalizado)

  // Só retorna resultado utilizável se valor E vencimento decodificaram
  // — são a base do matching na rota (Especificação combinada com o
  // usuário: fornecedor+valor+vencimento, já que numero_documento não
  // é confiável entre bancos diferentes)
  if (valor === null || !dataVencimento) {
    return { resultado: null, erros }
  }

  return {
    resultado: { linhaDigitavel, nossoNumero, dataVencimento, valor, codigoBanco, cnpjCpfFornecedor },
    erros: [],
  }
}
