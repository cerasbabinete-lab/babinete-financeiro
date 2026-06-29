// ============================================================
// lib/txtBbParser.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Receber
// Função: Parser do arquivo TXT BB (formato MIGRATE fixo)
//         Extrai registros de cobrança de linhas tipo '01'
//         Posições validadas contra o arquivo brasil.txt real
// Conecta com: contasReceberService.ts (processarRegistrosTxtBb)
//              ContasReceberHeader.tsx (dispara após seleção do arquivo)
//              types/contasReceber.ts (RegistroTxtBb)
// Sem dependências externas — pure TypeScript string parsing
// ============================================================

import type { RegistroTxtBb } from '@/types/contasReceber'

// ============================================================
// POSIÇÕES CONFIRMADAS no arquivo brasil.txt real (0-indexed):
// [0:2]     = tipo de linha ('01' = dados, '00' = header, '99' = trailer)
// [8:10]    = carteira (ex: '17')
// [23:40]   = nosso_número BB (17 chars)
// [43:56]   = número do documento (13 chars, padded com espaços)
// [73:81]   = data emissão DDMMYYYY
// [81:89]   = data vencimento DDMMYYYY
// [89:102]  = valor em centavos (13 dígitos, dividir por 100)
// [303:]    = bloco do sacado, iniciado por 'N' + tipo(2) + cnpj(14) + nome(40)
//             CEP encontrado por regex \d{8} após o bloco de nome
// ============================================================

// ============================================================
// parseTxtBb()
// Função principal — recebe o conteúdo texto do arquivo TXT BB
// Retorna array de registros parsed (apenas linhas '01')
// Linhas malformadas são ignoradas (logged no console)
// ============================================================
export function parseTxtBb(conteudo: string): RegistroTxtBb[] {
  // Divide o arquivo em linhas, suporta CRLF (Windows) e LF (Unix)
  const linhas = conteudo.split(/\r?\n/)
  const resultado: RegistroTxtBb[] = []

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]

    // Ignora linhas vazias, de header (00) e trailer (99)
    // Processa apenas linhas de dados tipo '01'
    if (!linha || linha.length < 200 || linha.slice(0, 2) !== '01') {
      continue
    }

    try {
      const registro = parseLinhaDados(linha, i + 1) // i+1 = número da linha para log
      if (registro) {
        resultado.push(registro)
      }
    } catch (err: unknown) {
      // Linha malformada — loga mas continua processando as demais
      console.warn(
        `[txtBbParser] Linha ${i + 1} malformada, ignorada:`,
        err instanceof Error ? err.message : err,
      )
    }
  }

  return resultado
}

// ============================================================
// parseLinhaDados()
// Extrai todos os campos de uma linha de dados tipo '01'
// Retorna null se a linha não puder ser parseada com segurança
// ============================================================
function parseLinhaDados(linha: string, numLinha: number): RegistroTxtBb | null {
  // ── Carteira ──────────────────────────────────────────────
  // Posição [8:10]: ex '17' (carteira de cobrança BB)
  const carteira = linha.slice(8, 10).trim()

  // ── Nosso Número BB ───────────────────────────────────────
  // Posição [23:40]: 17 caracteres, ex '21602610000007687'
  const nossoNumero = linha.slice(23, 40).trim()
  if (!nossoNumero) {
    // Nosso Número vazio — linha inútil para o módulo
    console.warn(`[txtBbParser] Linha ${numLinha}: Nosso Número vazio`)
    return null
  }

  // ── Número do Documento ───────────────────────────────────
  // Posição [43:56]: 13 chars padded, ex '005413       ' ou '005414/1     '
  const numeroDocumento = linha.slice(43, 56).trim()

  // ── Data de Emissão ───────────────────────────────────────
  // Posição [73:81]: DDMMYYYY ex '15062026'
  const dataEmissaoRaw = linha.slice(73, 81)
  const dataEmissao    = formatarDDMMYYYY(dataEmissaoRaw)

  // ── Data de Vencimento ────────────────────────────────────
  // Posição [81:89]: DDMMYYYY ex '30062026'
  const dataVencimentoRaw = linha.slice(81, 89)
  const dataVencimento    = formatarDDMMYYYY(dataVencimentoRaw)

  if (!dataVencimento) {
    // Data de vencimento inválida — bloqueia o registro
    console.warn(`[txtBbParser] Linha ${numLinha}: data vencimento inválida '${dataVencimentoRaw}'`)
    return null
  }

  // ── Valor ─────────────────────────────────────────────────
  // Posição [89:102]: 13 dígitos em centavos, ex '0000000079258' = R$792.58
  const valorRaw = linha.slice(89, 102)
  let valor      = 0
  if (/^\d+$/.test(valorRaw)) {
    valor = parseInt(valorRaw, 10) / 100 // Converte centavos para reais
  } else {
    console.warn(`[txtBbParser] Linha ${numLinha}: valor inválido '${valorRaw}'`)
  }

  // ── Bloco do Sacado ───────────────────────────────────────
  // O bloco começa com 'N' seguido de tipo(2) + CNPJ/CPF(14) + nome(40)
  // Posição típica: ~303 em linhas de 500 chars
  // Busca pela última ocorrência de 'N0' (CNPJ) ou 'N1' (CPF) na linha
  const sacado = parseBlocoSacado(linha, numLinha)

  return {
    carteira,
    nossoNumero,
    numeroDocumento,
    dataEmissao,
    dataVencimento,
    valor,
    cnpjCpf:      sacado.cnpjCpf,
    nomeSacado:   sacado.nome,
    endereco:     sacado.endereco,
    cep:          sacado.cep,
    municipio:    sacado.municipio,
    uf:           sacado.uf,
    linhaDigitavel: undefined, // TXT BB não contém linha digitável diretamente
  }
}

// ============================================================
// parseBlocoSacado()
// Extrai dados do sacado do bloco 'N' no final da linha
// Formato: N + tipo(2) + cnpj/cpf(14) + nome(40) + end(var) + cep(8) + mun(15) + uf(2)
// ============================================================
function parseBlocoSacado(linha: string, numLinha: number): {
  cnpjCpf:  string
  nome:     string
  endereco: string
  cep:      string
  municipio: string
  uf:       string
} {
  // Padrão vazio para retorno em caso de falha — não aborta o parse principal
  const vazio = { cnpjCpf: '', nome: '', endereco: '', cep: '', municipio: '', uf: '' }

  // Busca a última ocorrência de 'N' seguida de 2 dígitos (tipo pessoa)
  // O bloco de sacado no MIGRATE TXT BB começa sempre com N + tipo(2 chars: '01', '02')
  // C-1 FIX: aceita tanto CNPJ (14 dígitos) quanto CPF (11 dígitos)
  // Verificar se os primeiros 11 chars do campo são dígitos cobre ambos os casos:
  // CPF  → 11 dígitos exatos (ex: '78892295691   ')
  // CNPJ → 14 dígitos — /^\d{11}/ bate nos 11 primeiros dos 14
  let nPos = -1
  // Percorre a linha de trás para frente buscando o padrão N + 2 dígitos + ≥11 dígitos
  for (let i = linha.length - 20; i >= 200; i--) {
    if (
      linha[i] === 'N' &&
      /^\d{2}/.test(linha.slice(i + 1, i + 3)) &&              // tipo pessoa: 2 dígitos
      /^\d{11}/.test(linha.slice(i + 3, i + 14).trimEnd())     // CPF (11) ou CNPJ (14 — primeiros 11)
    ) {
      nPos = i
      break
    }
  }

  if (nPos === -1) {
    console.warn(`[txtBbParser] Linha ${numLinha}: bloco sacado 'N' não encontrado`)
    return vazio
  }

  // tipo pessoa: N+1:N+3 (ex: '02' para CNPJ, '01' para CPF)
  // CNPJ/CPF: N+3:N+17 (14 dígitos sem pontuação)
  const cnpjCpf = linha.slice(nPos + 3, nPos + 17).trim()

  // Nome do sacado: N+17:N+57 (40 caracteres)
  const nome = linha.slice(nPos + 17, nPos + 57).trim()

  // O bloco após o nome: endereço (comprimento variável) + CEP(8) + município(15) + UF(2)
  // Estratégia: buscar o CEP por regex \d{8} no trecho após o nome
  const aposNome = linha.slice(nPos + 57)

  const cepMatch = /\d{8}/.exec(aposNome)
  if (!cepMatch) {
    // Sem CEP encontrado — retorna com o que temos
    return { cnpjCpf, nome, endereco: '', cep: '', municipio: '', uf: '' }
  }

  // Endereço: do início do bloco pós-nome até o início do CEP
  const endereco = aposNome.slice(0, cepMatch.index).trim()
  const cep      = cepMatch[0] // 8 dígitos sem formatação

  // Município: 15 chars imediatamente após o CEP
  const municipio = aposNome.slice(cepMatch.index + 8, cepMatch.index + 23).trim()

  // UF: 2 chars após o município
  const uf = aposNome.slice(cepMatch.index + 23, cepMatch.index + 25).trim()

  return { cnpjCpf, nome, endereco, cep, municipio, uf }
}

// ============================================================
// formatarDDMMYYYY()
// Converte string DDMMYYYY para YYYY-MM-DD (formato ISO)
// Retorna string vazia se o input for inválido
// ============================================================
function formatarDDMMYYYY(s: string): string {
  if (!s || s.length < 8) return ''           // Input muito curto
  if (!/^\d{8}$/.test(s)) return ''           // Não são 8 dígitos
  const dd   = s.slice(0, 2)                  // Dia
  const mm   = s.slice(2, 4)                  // Mês
  const yyyy = s.slice(4, 8)                  // Ano
  // Valida mês (01-12) e dia (01-31) básico — banco de dados valida o resto
  if (parseInt(mm, 10) < 1 || parseInt(mm, 10) > 12) return ''
  if (parseInt(dd, 10) < 1 || parseInt(dd, 10) > 31) return ''
  return `${yyyy}-${mm}-${dd}`                // ISO 8601
}

// ============================================================
// calcularHashSha256()
// Calcula SHA-256 do conteúdo do arquivo para deduplicação
// Usa a Web Crypto API (disponível em todos os browsers modernos)
// Chamado por: ContasReceberHeader.tsx antes de processar o arquivo
// ============================================================
export async function calcularHashSha256(conteudo: string): Promise<string> {
  const encoder = new TextEncoder()                          // Converte string para bytes
  const data    = encoder.encode(conteudo)                   // Array de bytes UTF-8
  const hashBuf = await crypto.subtle.digest('SHA-256', data) // Hash como ArrayBuffer
  const hashArr = Array.from(new Uint8Array(hashBuf))        // Converte para array de bytes
  // Converte cada byte para hexadecimal de 2 chars e junta
  return hashArr.map(b => b.toString(16).padStart(2, '0')).join('')
}
