// ============================================================
// lib/remParser.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Receber
// Função: Parser do arquivo REM CNAB 240 (Banco do Brasil)
//         Extrai Segmentos P (cobrança) e Q (sacado)
//         Posições validadas contra arquivo REM real BB
// Conecta com: contasReceberService.ts (processarRegistrosRem)
//              ContasReceberHeader.tsx (dispara após seleção)
//              types/contasReceber.ts (RegistroRemSegmentoP)
// Sem dependências externas — pure TypeScript string parsing
// ============================================================

import type { RegistroRemSegmentoP } from '@/types/contasReceber'

// ============================================================
// POSIÇÕES CONFIRMADAS no arquivo REM CNAB 240 BB real (0-indexed):
//
// IDENTIFICAÇÃO DO SEGMENTO:
// [13] = tipo do segmento ('P', 'Q', 'R', 'T', 'U', 'Y', etc.)
//
// SEGMENTO P (dados do título):
// [37:54]  = nosso_número (17 chars)
// [58:73]  = número do documento cliente (15 chars, pode ter prefixo MIGRATE)
// [77:85]  = data vencimento DDMMYYYY
// [85:100] = valor (15 dígitos em centavos, dividir por 100)
//
// SEGMENTO Q (sacado):
// [19:33]  = CNPJ/CPF sem pontuação (14 dígitos)
// [33:73]  = nome sacado (40 chars)
// [73:113] = endereço (40 chars)
// CEP: regex \d{8} a partir de [113:]
// Município: CEP+8:CEP+23
// UF: CEP+23:CEP+25
// ============================================================

// ============================================================
// parseRem()
// Função principal — recebe o conteúdo texto do arquivo REM
// Agrupa Segmentos P e Q sequenciais por número sequencial de lote
// Retorna apenas os dados do Segmento P (necessários para vinculação)
// Chamado por: ContasReceberHeader.tsx após leitura do arquivo
// ============================================================
export function parseRem(conteudo: string): RegistroRemSegmentoP[] {
  // Divide o arquivo em linhas, suporta CRLF e LF
  const linhas = conteudo.split(/\r?\n/)
  const resultado: RegistroRemSegmentoP[] = []

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]

    // Ignora linhas com menos de 100 chars — inválidas para CNAB 240
    if (!linha || linha.length < 100) continue

    // Apenas processa segmentos P — segmentos Q, R, etc. são ignorados
    // O segmento é identificado pelo char na posição 13 (0-indexed)
    if (linha[13] !== 'P') continue

    try {
      const registro = parseSegmentoP(linha, i + 1)
      if (registro) {
        resultado.push(registro)
      }
    } catch (err: unknown) {
      // Segmento malformado — loga mas continua
      console.warn(
        `[remParser] Linha ${i + 1} (Seg P) malformada, ignorada:`,
        err instanceof Error ? err.message : err,
      )
    }
  }

  return resultado
}

// ============================================================
// parseSegmentoP()
// Extrai campos do Segmento P de uma linha CNAB 240
// Retorna null se os campos essenciais (nosso_numero, vencimento) falharem
// ============================================================
function parseSegmentoP(linha: string, numLinha: number): RegistroRemSegmentoP | null {
  // ── Nosso Número ──────────────────────────────────────────
  // Posição [37:54]: 17 chars, ex '21602610000007687'
  const nossoNumero = linha.slice(37, 54).trim()
  if (!nossoNumero || nossoNumero.length === 0) {
    console.warn(`[remParser] Linha ${numLinha}: Nosso Número vazio no Segmento P`)
    return null
  }

  // ── Número do Documento ───────────────────────────────────
  // Posição [58:73]: 15 chars — no MIGRATE pode ter prefixo como '1111'
  // Exemplo: '1111005413     ' → depois de limpar → '005413'
  // Estratégia: remove dígitos não-significativos do início (prefixo MIGRATE)
  const docRaw      = linha.slice(58, 73).trim()
  const numeroDocumento = limparNumeroDoc(docRaw)

  // ── Data de Vencimento ────────────────────────────────────
  // Posição [77:85]: DDMMYYYY ex '30062026'
  const dataVencimentoRaw = linha.slice(77, 85)
  const dataVencimento    = formatarDDMMYYYY(dataVencimentoRaw)
  if (!dataVencimento) {
    console.warn(`[remParser] Linha ${numLinha}: data vencimento inválida '${dataVencimentoRaw}'`)
    return null
  }

  // ── Valor ─────────────────────────────────────────────────
  // Posição [85:100]: 15 dígitos em centavos
  // Exemplo: '000000000079258' = R$792,58
  const valorRaw = linha.slice(85, 100)
  let valor      = 0
  if (/^\d+$/.test(valorRaw)) {
    valor = parseInt(valorRaw, 10) / 100 // Centavos → reais
  } else {
    console.warn(`[remParser] Linha ${numLinha}: valor inválido '${valorRaw}'`)
  }

  return {
    nossoNumero,
    numeroDocumento,
    dataVencimento,
    valor,
  }
}

// ============================================================
// limparNumeroDoc()
// Remove prefixos numéricos MIGRATE do número do documento
// Exemplo: '1111005413' → '005413'
//          '11111005414/1' → '005414/1'
// Estratégia: se o campo começa com dígitos seguidos de zeros (ex '1111'),
// procura o padrão real do documento (começa com '0' após os prefixos)
// ============================================================
function limparNumeroDoc(raw: string): string {
  if (!raw) return ''
  // Se começa com '0', o prefixo já foi removido pelo trim
  if (raw.startsWith('0') || raw.startsWith('/')) return raw
  // Procura o primeiro '0' que seja seguido pelo padrão de número de NF (dígitos ou /)
  const match = /0\d{4,}(?:\/\d)?/.exec(raw)
  if (match) return match[0]
  // Fallback: retorna o raw trimmed
  return raw
}

// ============================================================
// formatarDDMMYYYY()
// Converte string DDMMYYYY para ISO YYYY-MM-DD
// ============================================================
function formatarDDMMYYYY(s: string): string {
  if (!s || s.length < 8) return ''           // Input muito curto
  if (!/^\d{8}$/.test(s)) return ''           // Não são 8 dígitos
  const dd   = s.slice(0, 2)
  const mm   = s.slice(2, 4)
  const yyyy = s.slice(4, 8)
  if (parseInt(mm, 10) < 1 || parseInt(mm, 10) > 12) return ''
  if (parseInt(dd, 10) < 1 || parseInt(dd, 10) > 31) return ''
  return `${yyyy}-${mm}-${dd}`
}
