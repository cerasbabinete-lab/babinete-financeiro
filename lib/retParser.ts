// ============================================================
// lib/retParser.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Receber
// Função: Parser do arquivo RET CNAB 240 (retorno bancário BB)
//         Extrai Segmentos T (ocorrências de liquidação/protesto)
//         Mapeamento de códigos: ver MAPEAMENTO_OCORRENCIAS_RET
//         em types/contasReceber.ts
// Conecta com: contasReceberService.ts (processarRegistrosRet)
//              ContasReceberHeader.tsx (dispara após seleção)
//              types/contasReceber.ts (RegistroRetSegmentoT)
// Sem dependências externas — pure TypeScript string parsing
//
// CNAB 240 Retorno BB — Posições Segmento T (0-indexed, validadas contra RET real):
// [13]    = 'T' (tipo de segmento)
// [15:17] = código de ocorrência (2 dígitos, ex: '06', '09', '23', '25')
// [37:54] = nosso_número (17 chars)
// [73:81] = data da ocorrência DDMMYYYY  ← CORRIGIDO (era [58:66])
// [81:96] = valor pago (15 dígitos em centavos) ← CORRIGIDO (era [85:100])
// ============================================================

import type { RegistroRetSegmentoT } from '@/types/contasReceber'

// ============================================================
// parseRet()
// Função principal — recebe o conteúdo texto do arquivo RET
// Retorna array de ocorrências parsed (apenas Segmentos T)
// Chamado por: ContasReceberHeader.tsx após leitura do arquivo
// ============================================================
export function parseRet(conteudo: string): RegistroRetSegmentoT[] {
  // Divide o arquivo em linhas, suporta CRLF e LF
  const linhas = conteudo.split(/\r?\n/)
  const resultado: RegistroRetSegmentoT[] = []

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]

    // Ignora linhas curtas ou que não sejam Segmento T
    // Segmento identificado pelo char na posição 13 (0-indexed)
    if (!linha || linha.length < 150) continue
    if (linha[13] !== 'T') continue

    try {
      const registro = parseSegmentoT(linha, i + 1)
      if (registro) {
        resultado.push(registro)
      }
    } catch (err: unknown) {
      // Segmento malformado — loga e continua para os próximos
      console.warn(
        `[retParser] Linha ${i + 1} (Seg T) malformada, ignorada:`,
        err instanceof Error ? err.message : err,
      )
    }
  }

  return resultado
}

// ============================================================
// parseSegmentoT()
// Extrai campos de um Segmento T do arquivo RET CNAB 240
// Retorna null se nosso_número ou código de ocorrência ausentes
// ============================================================
function parseSegmentoT(linha: string, numLinha: number): RegistroRetSegmentoT | null {
  // ── Código de Ocorrência ──────────────────────────────────
  // Posição [15:17]: 2 dígitos, ex '06' (liquidação), '09', '23', '25'
  // Todos os códigos são processados — desconhecidos viram eventos informativos
  const codigoOcorrencia = linha.slice(15, 17).trim()
  if (!codigoOcorrencia || codigoOcorrencia.length !== 2) {
    console.warn(`[retParser] Linha ${numLinha}: código ocorrência inválido '${codigoOcorrencia}'`)
    return null
  }

  // ── Nosso Número ──────────────────────────────────────────
  // Posição [37:54]: 17 chars, mesmo padrão do REM Segmento P
  const nossoNumero = linha.slice(37, 54).trim()
  if (!nossoNumero) {
    console.warn(`[retParser] Linha ${numLinha}: Nosso Número vazio no Segmento T`)
    return null
  }

  // ── Data da Ocorrência ────────────────────────────────────
  // Posição [73:81]: DDMMYYYY — data em que o evento ocorreu no banco
  // CORRIGIDO: era [58:66] que capturava o número do documento por engano
  const dataOcorrenciaRaw = linha.slice(73, 81)
  const dataOcorrencia    = dataOcorrenciaRaw // Mantém DDMMYYYY — service converte

  // ── Valor Pago ────────────────────────────────────────────
  // Posição [81:96]: 15 dígitos em centavos
  // CORRIGIDO: era [85:100] que produzia valores absurdos (ex: R$ 18.540.023,70)
  const valorPagoRaw = linha.slice(81, 96)
  const valorPago    = /^\d+$/.test(valorPagoRaw)
    ? parseInt(valorPagoRaw, 10) / 100  // Centavos → reais
    : 0                                  // Campo inválido → zero

  // ── Juros / Mora ─────────────────────────────────────────
  // Posição [96:111]
  const jurosRaw = linha.slice(96, 111)
  const juros    = /^\d+$/.test(jurosRaw)
    ? parseInt(jurosRaw, 10) / 100
    : 0

  // ── Desconto ─────────────────────────────────────────────
  // Posição [111:126]
  const descontoRaw = linha.slice(111, 126)
  const desconto    = /^\d+$/.test(descontoRaw)
    ? parseInt(descontoRaw, 10) / 100
    : 0

  return {
    nossoNumero,
    codigoOcorrencia,
    dataOcorrencia, // DDMMYYYY — convertido para YYYY-MM-DD no service
    valorPago,
    juros,
    desconto,
  }
}
