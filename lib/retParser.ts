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
// CNAB 240 Retorno BB — Posições Segmento T (0-indexed):
// [13]     = 'T' (tipo de segmento)
// [37:54]  = nosso_número (17 chars)
// [15:17]  = código de ocorrência (2 dígitos, ex: '06', '09', '23', '25')
// [58:66]  = data da ocorrência DDMMYYYY
// [85:100] = valor pago (15 dígitos em centavos)
// [100:115]= valor de juros/mora (15 dígitos em centavos)
// [115:130]= valor de desconto (15 dígitos em centavos)
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
  // Posição [58:66]: DDMMYYYY — data em que o evento ocorreu no banco
  const dataOcorrenciaRaw = linha.slice(58, 66)
  const dataOcorrencia    = dataOcorrenciaRaw // Mantém DDMMYYYY — service converte

  // ── Valor Pago ────────────────────────────────────────────
  // Posição [85:100]: 15 dígitos em centavos
  // Representa o valor efetivamente creditado pelo banco
  const valorPagoRaw = linha.slice(85, 100)
  const valorPago    = /^\d+$/.test(valorPagoRaw)
    ? parseInt(valorPagoRaw, 10) / 100  // Centavos → reais
    : 0                                  // Campo inválido → zero

  // ── Juros / Mora ─────────────────────────────────────────
  // Posição [100:115]: juros cobrados por atraso
  const jurosRaw = linha.slice(100, 115)
  const juros    = /^\d+$/.test(jurosRaw)
    ? parseInt(jurosRaw, 10) / 100
    : 0

  // ── Desconto ─────────────────────────────────────────────
  // Posição [115:130]: desconto concedido pelo cedente
  const descontoRaw = linha.slice(115, 130)
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
