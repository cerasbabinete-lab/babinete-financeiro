// ============================================================
// lib/relatorios/excelBuilder.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Geração de exportação .xlsx no SERVIDOR (Node, dentro da
//         rota de API), diferente do uso já existente de `xlsx` no
//         projeto (lib/fornecedoresService.ts usa XLSX.writeFile no
//         browser, que dispara download direto). Aqui o fluxo é
//         XLSX.write(..., { type: 'buffer' }) -> Buffer -> stream
//         de resposta HTTP, mesmo princípio de streaming do PDF
//         (lib/relatorios/pdfBuilder.ts), sem depender de disco.
// Conecta com: pages/api/relatorios/*.ts (cada rota, quando
//              ?formato=xlsx, chama gerarBufferExcel() e envia o
//              buffer como resposta), types/relatorios.ts
//              (DISCLAIMER_RELATORIOS)
// Referência: Especificacao_Modulo_Relatorios.md, Seção 1.2
//             ("Excel é peça nova — Builder deve avaliar biblioteca
//             compatível já presente no stack" -> xlsx/SheetJS
//             já instalado, reaproveitado sem dependência nova) e
//             Seção 1.1 (disclaimer também na exportação Excel)
// ============================================================

import * as XLSX from 'xlsx'
import { DISCLAIMER_RELATORIOS } from '@/types/relatorios'

// ============================================================
// ColunaExcel
// ============================================================
export interface ColunaExcel {
  chave: string
  rotulo: string
  larguraCaracteres?: number // largura da coluna no Excel — padrão 20 se omitido
}

// ============================================================
// gerarBufferExcel()
// Monta uma planilha única: título + período (linhas informativas),
// linha em branco, cabeçalho de colunas, linhas de dado, linha em
// branco, disclaimer fixo (Seção 1.1) — mesma ordem de informação
// do PDF (Seção 5.1), só que em formato de planilha
// ============================================================
export function gerarBufferExcel(opcoes: {
  nomeAba: string
  tituloRelatorio: string
  periodoDescricao: string
  colunas: ColunaExcel[]
  linhas: Record<string, string | number>[]
}): Buffer {
  const aoa: (string | number)[][] = []

  aoa.push([opcoes.tituloRelatorio])
  aoa.push([`Período: ${opcoes.periodoDescricao}`])
  aoa.push([]) // linha em branco separando o cabeçalho informativo da tabela

  const linhaCabecalhoIndex = aoa.length
  aoa.push(opcoes.colunas.map(c => c.rotulo))

  opcoes.linhas.forEach(linha => {
    aoa.push(opcoes.colunas.map(c => linha[c.chave] ?? ''))
  })

  aoa.push([]) // linha em branco antes do disclaimer
  const linhaDisclaimerIndex = aoa.length
  aoa.push([DISCLAIMER_RELATORIOS])

  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // Largura de coluna — usa a sugerida por coluna ou 20 como padrão
  ws['!cols'] = opcoes.colunas.map(c => ({ wch: c.larguraCaracteres ?? 20 }))

  // Mescla a linha de título e a linha do disclaimer por toda a
  // largura da tabela, pra não ficarem espremidas na coluna A
  const ultimaColuna = Math.max(opcoes.colunas.length - 1, 0)
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: ultimaColuna } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: ultimaColuna } },
    { s: { r: linhaDisclaimerIndex, c: 0 }, e: { r: linhaDisclaimerIndex, c: ultimaColuna } },
  ]

  // Marca o cabeçalho de colunas em negrito, quando o writer
  // suportar estilo básico de célula (SheetJS community edition
  // tem suporte limitado a estilo — aplicado de forma best-effort,
  // sem quebrar a geração caso não tenha efeito visual)
  opcoes.colunas.forEach((_, i) => {
    const endereco = XLSX.utils.encode_cell({ r: linhaCabecalhoIndex, c: i })
    if (ws[endereco]) {
      ws[endereco].s = { font: { bold: true } }
    }
  })

  const wb = XLSX.utils.book_new()
  // Nome de aba do Excel tem limite de 31 caracteres
  XLSX.utils.book_append_sheet(wb, ws, opcoes.nomeAba.slice(0, 31))

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}
