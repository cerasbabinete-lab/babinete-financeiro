// ============================================================
// lib/boletoPdfParser.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Receber
// Função: Parser do texto extraído de boletos PDF emitidos
//         pelo sistema externo (MIGRATE/sistema de gestão)
//         para a Ceras Babinete Ltda. ME via Banco do Brasil.
//         Extrai os campos necessários para vincular o título
//         existente em contas_receber (criado via XML/TXT BB).
// Campos extraídos:
//   nossoNumero     — 17 dígitos (campo "Nosso Número")
//   linhaDigitavel  — linha digitável completa com espaços
//   numeroDocumento — "Num do Documento" (ex: "005431")
//   dataVencimento  — ISO YYYY-MM-DD
//   valor           — número (ex: 1758.30)
// Conecta com: contasReceberService.ts (processarBoletoPdf)
//              ContasReceberHeader.tsx (botão Importar Boleto)
//              BasebarContasReceber.tsx (botão Importar Boleto mobile)
// Sem dependências externas — pure string parsing
// ============================================================

export interface ResultadoBoletoPdf {
  nossoNumero:     string   // 17 dígitos
  linhaDigitavel:  string   // Linha digitável completa
  numeroDocumento: string   // Nº do documento (ex: "005431")
  dataVencimento:  string   // ISO YYYY-MM-DD
  valor:           number   // Valor em reais
}

export interface ErroBoletoPdf {
  campo:    string
  detalhe:  string
}

// ============================================================
// parsearBoletoPdf()
// Recebe o texto bruto extraído do PDF pelo pdf-parse
// e extrai os campos do boleto BB da Ceras Babinete.
// ============================================================
export function parsearBoletoPdf(texto: string): {
  resultado: ResultadoBoletoPdf | null
  erros:     ErroBoletoPdf[]
} {
  const erros: ErroBoletoPdf[] = []
  let nossoNumero:     string | null = null
  let linhaDigitavel:  string | null = null
  let numeroDocumento: string | null = null
  let dataVencimento:  string | null = null
  let valor:           number | null = null

  // Normaliza o texto: remove caracteres de controle, colapsa espaços múltiplos
  const texto2 = texto
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()

  // ── 1. Nosso Número ─────────────────────────────────────
  // Formato BB: 17 dígitos (ex: "21602610000007706")
  // No PDF aparece como "21602610000007706" em campo isolado
  // Regex: 17 dígitos consecutivos — pode aparecer após espaço ou quebra
  const reNossoNum = /\b(2160261\d{10})\b/g
  const matchesNn  = [...texto2.matchAll(reNossoNum)]
  if (matchesNn.length > 0) {
    // Usa a primeira ocorrência (todos devem ser iguais — boleto tem 2 vias)
    nossoNumero = matchesNn[0][1]
  } else {
    // Fallback: qualquer sequência de 17 dígitos
    const reFallback = /\b(\d{17})\b/g
    const fbMatches  = [...texto2.matchAll(reFallback)]
    if (fbMatches.length > 0) {
      nossoNumero = fbMatches[0][1]
    } else {
      erros.push({ campo: 'nossoNumero', detalhe: 'Não encontrado no PDF (esperado: 17 dígitos)' })
    }
  }

  // ── 2. Linha Digitável ───────────────────────────────────
  // Formato BB: "00190.00009 02160.261000 00007.706179 5 10610000175830"
  // Padrão: blocos de dígitos com pontos e espaços — 47 a 48 chars
  const reLinha = /\b(\d{5}\.\d{5}\s+\d{5}\.\d{6}\s+\d{5}\.\d{6}\s+\d\s+\d{14})\b/
  const mLinha  = reLinha.exec(texto2)
  if (mLinha) {
    linhaDigitavel = mLinha[1].trim()
  } else {
    erros.push({ campo: 'linhaDigitavel', detalhe: 'Linha digitável não encontrada no PDF' })
  }

  // ── 3. Número do Documento ───────────────────────────────
  // Formato MIGRATE: "005431" (parcela única) ou "005431/1" (múltiplas)
  // ATENÇÃO: o sistema externo gera com HÍFEN ("005430-1") mas o banco
  // armazena com BARRA ("005430/1") — normalizar após extração.
  // CRÍTICO: incluir o sufixo (/N ou -N) — é a chave de busca no banco.
  const reNumDoc = /\b(0\d{5}(?:[/\-]\d+)?)\b/g
  const numDocMatches = [...texto2.matchAll(reNumDoc)].filter(m => {
    const idx    = m.index ?? 0
    const antes  = texto2[idx - 1] ?? ''
    const depois = texto2[idx + m[1].length] ?? ''
    return antes !== '.' && depois !== '.'
  })
  if (numDocMatches.length > 0) {
    // Normaliza hífen → barra para bater com o formato do banco ("005430/1")
    numeroDocumento = numDocMatches[0][1].replace(/^(\d{6})-(\d+)$/, '$1/$2')
  } else {
    erros.push({ campo: 'numeroDocumento', detalhe: 'Número do documento não encontrado no PDF' })
  }

  // ── 4. Data de Vencimento ────────────────────────────────
  // Padrão EXATO confirmado do pdf-parse v2 com estes boletos BB:
  //   "R$\n12/08/2026\nR$ 857,00"
  // A data de vencimento aparece entre dois "R$":
  //   - primeiro R$ sem valor (campo vazio no layout)
  //   - data de vencimento sozinha numa linha
  //   - segundo R$ com o valor cobrado
  const reVenc = /R\$\n(\d{2}\/\d{2}\/\d{4})\nR\$/
  const mVenc  = reVenc.exec(texto2)
  if (mVenc) {
    const [dd, mm, yyyy] = mVenc[1].split('/')
    if (Number(mm) >= 1 && Number(mm) <= 12) {
      dataVencimento = `${yyyy}-${mm}-${dd}`
    }
  }
  if (!dataVencimento) {
    erros.push({ campo: 'dataVencimento', detalhe: 'Data de vencimento não encontrada (padrão esperado: R$\\n{data}\\nR$ {valor})' })
  }

  // ── 5. Valor ─────────────────────────────────────────────
  // Formato no PDF: "R$ 1.758,30" ou "1.758,30"
  const reValor = /R\$\s*([\d.,]+)/g
  const valoresEncontrados: number[] = []
  for (const m of texto2.matchAll(reValor)) {
    const raw = m[1].replace(/\./g, '').replace(',', '.')
    const v   = parseFloat(raw)
    if (!isNaN(v) && v > 0) valoresEncontrados.push(v)
  }
  if (valoresEncontrados.length > 0) {
    // Todos os valores no boleto são iguais (3 vias do mesmo título)
    // Pega o mais frequente (ou o primeiro, são sempre iguais)
    valor = valoresEncontrados[0]
  } else {
    erros.push({ campo: 'valor', detalhe: 'Valor não encontrado no PDF (esperado: R$ X.XXX,XX)' })
  }

  // ── Valida e retorna ─────────────────────────────────────
  if (nossoNumero && linhaDigitavel && numeroDocumento && dataVencimento && valor !== null) {
    return {
      resultado: { nossoNumero, linhaDigitavel, numeroDocumento, dataVencimento, valor },
      erros:     [],
    }
  }

  return { resultado: null, erros }
}
