// ============================================================
// lib/xlsParser.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Receber
// Função: Parser do relatório XLS de consulta de títulos emitido
//         pelo autoatendimento.bb.com.br ("consultaCBR.xls" e
//         variações — algumas com mais colunas que outras)
//         Extrai Nosso Número, Situação, Data Situação e Valor
//         Liquidação para alimentar o fluxo "Importar Retorno"
//         junto com o RET CNAB 240 (ver retParser.ts)
// Conecta com: contasReceberService.ts (processarRegistrosXls,
//              gerarPreviewImportacao)
//              ContasReceberHeader.tsx (dispara após seleção do arquivo)
//              types/contasReceber.ts (RegistroXls, MAPEAMENTO_SITUACAO_XLS)
// Dependência externa: xlsx (SheetJS) — já usado em contasReceberService.ts
//                       para exportarExcel()
//
// NOTA SOBRE COLUNAS: o relatório do BB tem ao menos duas variações:
// - Formato simples: Nr, Nome do Pagador, CPF/CNPJ do Pagador,
//   Emissão, Vencimento, Nosso Número, Seu Número, Situação, Valor
// - Formato completo: o mesmo + Data Situação, Valor Liquidação,
//   Tipo Liquidação
// O parser lê pelo NOME da coluna (não pela posição), então funciona
// com qualquer uma das variações — colunas ausentes ficam como null.
// ============================================================

import * as XLSX from 'xlsx'
import type { RegistroXls } from '@/types/contasReceber'

// ============================================================
// parseXls()
// Função principal — recebe o File do input e retorna o array
// de registros parseados (RegistroXls), ignorando linhas sem
// Nosso Número válido (ex: linha de total no rodapé da planilha)
// Chamado por: ContasReceberHeader.tsx após seleção do arquivo
// ============================================================
export async function parseXls(file: File): Promise<RegistroXls[]> {
  // 1. Lê o arquivo como ArrayBuffer — formato exigido pelo SheetJS
  //    para arquivos binários (.xls/.xlsx), diferente da leitura
  //    de texto usada para TXT BB / REM / RET
  const buffer = await file.arrayBuffer()

  // 2. Faz o parse do workbook — cellDates:true converte células de
  //    data nativas do Excel para objeto Date automaticamente;
  //    datas armazenadas como texto (ex: "26/01/2026") continuam
  //    chegando como string e são tratadas em converterDataXls()
  //    AUDITORIA FIX: XLSX.read com type:'array' espera um Uint8Array,
  //    não um ArrayBuffer puro — sem essa conversão o parse podia
  //    falhar dependendo da versão do SheetJS instalada
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true })

  // 3. Usa sempre a primeira planilha do arquivo — os relatórios do
  //    BB exportam uma única aba por consulta
  const nomeAba   = workbook.SheetNames[0]
  const planilha  = workbook.Sheets[nomeAba]

  // 4. Converte a planilha para array de objetos chave/valor, usando
  //    a primeira linha como cabeçalho (comportamento padrão do
  //    sheet_to_json) — defval garante que colunas vazias na linha
  //    não fiquem `undefined`, evitando erros de acesso abaixo
  const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(planilha, {
    defval: '', // Célula vazia vira string vazia em vez de ausente
  })

  const resultado: RegistroXls[] = []

  // 5. Processa cada linha, ignorando as que não têm Nosso Número
  //    válido (ex: linha de rodapé com o somatório de "Valor")
  for (const linha of linhas) {
    const registro = parseLinhaXls(linha)
    if (registro) {
      resultado.push(registro)
    }
  }

  return resultado
}

// ============================================================
// parseLinhaXls()
// Extrai um RegistroXls de uma linha (objeto chave/valor) da
// planilha — retorna null se a linha não tiver Nosso Número
// ============================================================
function parseLinhaXls(linha: Record<string, unknown>): RegistroXls | null {
  // ── Nosso Número ──────────────────────────────────────────
  // Coluna "Nosso Número" do BB vem com prefixo de zeros à esquerda
  // (ex: "00021602610000007661", 20 dígitos) enquanto o sistema
  // armazena o Nosso Número sem esse prefixo (17 dígitos, ex:
  // "21602610000007661" — mesmo padrão usado em retParser.ts e
  // txtBbParser.ts). Normalizamos removendo tudo que não é dígito
  // e pegando os 17 últimos caracteres, garantindo match exato
  // com o campo nosso_numero já gravado pelos outros imports.
  const nossoNumeroRaw = obterValor(linha, 'Nosso Número', 'Nosso Numero')
  const nossoNumeroDigitos = String(nossoNumeroRaw).replace(/\D/g, '')
  if (!nossoNumeroDigitos) {
    return null // Linha sem Nosso Número — provavelmente rodapé/total, ignorada
  }
  const nossoNumero = nossoNumeroDigitos.slice(-17) // Últimos 17 dígitos — padrão do sistema

  // ── Seu Número (número do documento) ──────────────────────
  // Apenas informativo na prévia — o matching real é por Nosso Número
  const numeroDocumento = String(obterValor(linha, 'Seu Número', 'Seu Numero')).trim()

  // ── Situação ──────────────────────────────────────────────
  // Texto bruto do BB — o mapeamento para StatusTitulo acontece
  // em contasReceberService.ts via MAPEAMENTO_SITUACAO_XLS, não aqui
  // (o parser só extrai, não decide regra de negócio)
  const situacao = String(obterValor(linha, 'Situação', 'Situacao')).trim()
  if (!situacao) {
    return null // Linha sem Situação não é um registro de título válido
  }

  // ── Data Situação ─────────────────────────────────────────
  // Coluna opcional — só existe no formato "completo" do relatório
  // (ex: consultaCBR3.xls). Ausente no formato simples.
  const dataSituacaoRaw = obterValor(linha, 'Data Situação', 'Data Situacao')
  const dataSituacao = converterDataXls(dataSituacaoRaw)

  // ── Valor (valor original do título) ───────────────────────
  const valorRaw = obterValor(linha, 'Valor')
  const valor = typeof valorRaw === 'number' ? valorRaw : parseFloat(String(valorRaw).replace(',', '.')) || 0

  // ── Valor Liquidação (valor efetivamente pago) ─────────────
  // Coluna opcional — ausente no formato simples vira null,
  // tratado em processarRegistrosXls() como "sem valor de baixa
  // específico" (usa o valor original do título nesse caso)
  const valorLiquidacaoRaw = obterValor(linha, 'Valor Liquidação', 'Valor Liquidacao')
  const valorLiquidacao = valorLiquidacaoRaw === '' || valorLiquidacaoRaw === undefined
    ? null
    : (typeof valorLiquidacaoRaw === 'number' ? valorLiquidacaoRaw : parseFloat(String(valorLiquidacaoRaw).replace(',', '.')) || null)

  return {
    nossoNumero,
    numeroDocumento,
    situacao,
    dataSituacao,
    valor,
    valorLiquidacao,
  }
}

// ============================================================
// obterValor()
// Busca o valor de uma coluna na linha tentando múltiplas
// variações do nome (com/sem acento) — protege contra arquivos
// salvos com encoding diferente onde o "ã"/"ç" pode não bater
// exatamente com a string esperada
// ============================================================
function obterValor(linha: Record<string, unknown>, ...nomesPossiveis: string[]): unknown {
  for (const nome of nomesPossiveis) {
    if (nome in linha) return linha[nome]
  }
  return ''
}

// ============================================================
// converterDataXls()
// Converte o valor de uma célula de data do XLS para ISO
// YYYY-MM-DD. Aceita três formatos possíveis vindos do SheetJS:
// - Date object (quando a célula é um tipo de data nativo do Excel)
// - string "DD/MM/YYYY" (quando a célula foi salva como texto —
//   caso mais comum nos relatórios do BB observados)
// - string vazia / ausente → retorna null (coluna opcional)
// ============================================================
function converterDataXls(valor: unknown): string | null {
  if (!valor || valor === '') return null

  // Caso 1: já é um objeto Date (cellDates:true converteu)
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    const ano = valor.getFullYear()
    const mes = String(valor.getMonth() + 1).padStart(2, '0')
    const dia = String(valor.getDate()).padStart(2, '0')
    return `${ano}-${mes}-${dia}`
  }

  // Caso 2: string no formato brasileiro "DD/MM/YYYY"
  const texto = String(valor).trim()
  const match = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (match) {
    const [, dia, mes, ano] = match
    return `${ano}-${mes}-${dia}`
  }

  // Formato não reconhecido — não trava a importação, só ignora a data
  console.warn(`[xlsParser] Data Situação em formato não reconhecido: "${texto}"`)
  return null
}

// ============================================================
// calcularHashXls()
// Gera o hash SHA-256 do conteúdo binário do arquivo XLS, para
// deduplicação via verificarHashRemessa() — mesmo padrão usado
// para TXT BB / REM / RET (ver calcularHashSha256 em txtBbParser.ts),
// mas operando sobre bytes brutos em vez de texto, já que o XLS
// é um arquivo binário (não pode ser lido com FileReader.readAsText
// sem corromper o conteúdo)
// ============================================================
export async function calcularHashXls(file: File): Promise<string> {
  const buffer    = await file.arrayBuffer()              // Bytes brutos do arquivo
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer) // Web Crypto API
  const hashArray  = Array.from(new Uint8Array(hashBuffer))        // Converte para array de bytes
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('') // Hex string final
}
