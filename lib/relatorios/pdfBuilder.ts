// ============================================================
// lib/relatorios/pdfBuilder.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Layout de PDF compartilhado pelos 6 relatórios — cabeçalho
//         (logo + nome + CNPJ + linha), título/período/data de
//         geração, cartões de resumo, gráfico (via pdfGrafico.ts),
//         tabela detalhada paginada com zebra, rodapé fixo em TODA
//         página (disclaimer + numeração). Cada relatório (Fases
//         2–7) monta seu PDF chamando estas funções na ordem que
//         fizer sentido para o seu conteúdo — este arquivo não sabe
//         nada sobre nenhum relatório específico.
// Conecta com: pages/api/relatorios/*.ts (cada rota chama
//              criarDocumentoRelatorio() e as demais funções, depois
//              faz doc.pipe(res), mesmo padrão de pages/api/danfe.ts),
//              lib/relatorios/pdfGrafico.ts (desenharGrafico),
//              types/relatorios.ts (DISCLAIMER_RELATORIOS)
// Referência: Especificacao_Modulo_Relatorios.md, Seção 1.1
//             (disclaimer obrigatório) e Seção 5.1 (layout do
//             documento exportado, aprovado por exemplo renderizado
//             — cabeçalho, cartões, gráfico, tabela zebrada, rodapé
//             fixo em toda página com paginação)
// ============================================================

import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'
import { DISCLAIMER_RELATORIOS } from '@/types/relatorios'

// ============================================================
// Constantes de layout — paleta e medidas
// ============================================================
const COR_PRIMARIA = '#1a6094'
const COR_TEXTO = '#2c4a60'
const COR_TEXTO_CLARO = '#5a84a6'
const COR_GRADE = '#dde8f0'
const COR_ZEBRA = '#f7f9fb'

const MARGEM = { top: 95, bottom: 55, left: 40, right: 40 }
const LARGURA_PAGINA_A4 = 595.28 // pt
const ALTURA_PAGINA_A4 = 841.89  // pt
export const LARGURA_UTIL = LARGURA_PAGINA_A4 - MARGEM.left - MARGEM.right

function mmParaPt(mm: number): number {
  return mm * 2.83464567
}

// ============================================================
// criarDocumentoRelatorio()
// Cria o PDFDocument (A4, bufferPages: true — necessário para o
// rodapé conseguir escrever "Página X de Y" depois que o total de
// páginas já é conhecido) e desenha o cabeçalho da Seção 5.1.
// Chamado por: cada pages/api/relatorios/*.ts, uma vez, no início
// ============================================================
export function criarDocumentoRelatorio(opcoes: {
  tituloRelatorio: string
  periodoDescricao: string
}): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: 'A4',
    margins: MARGEM,
    bufferPages: true, // permite calcular total de páginas no final, pro rodapé
  })

  desenharCabecalho(doc, opcoes)
  return doc
}

// ============================================================
// desenharCabecalho()
// Espaço reservado à esquerda para logomarca (26mm × 20mm) — usa
// public/img/logo_cb.png se existir, senão desenha um placeholder
// tracejado (mesmo padrão defensivo de pages/api/danfe.ts, que já
// checa fs.existsSync antes de tentar carregar a imagem)
// ============================================================
function desenharCabecalho(doc: PDFKit.PDFDocument, opcoes: { tituloRelatorio: string; periodoDescricao: string }) {
  const larguraLogo = mmParaPt(26)
  const alturaLogo = mmParaPt(20)
  const xLogo = MARGEM.left
  const yLogo = 28

  const logoPath = path.join(process.cwd(), 'public', 'img', 'logo_cb.png')
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, xLogo, yLogo, { fit: [larguraLogo, alturaLogo] })
  } else {
    doc.strokeColor(COR_GRADE).lineWidth(1).dash(3, { space: 2 })
       .rect(xLogo, yLogo, larguraLogo, alturaLogo).stroke()
    doc.undash()
    doc.fontSize(6).fillColor(COR_TEXTO_CLARO)
       .text('LOGO', xLogo, yLogo + alturaLogo / 2 - 3, { width: larguraLogo, align: 'center' })
  }

  // Nome da empresa + CNPJ à direita do espaço da logo
  const xTexto = xLogo + larguraLogo + 14
  const larguraTexto = LARGURA_UTIL - larguraLogo - 14
  doc.font('Helvetica-Bold').fontSize(12).fillColor(COR_PRIMARIA)
     .text('CERAS BABINETE LTDA ME', xTexto, yLogo + 4, { width: larguraTexto })
  doc.font('Helvetica').fontSize(8).fillColor(COR_TEXTO_CLARO)
     .text('CNPJ: 10.666.614/0001-60', xTexto, yLogo + 20, { width: larguraTexto })

  // Linha horizontal separadora, cor primária
  const yLinha = yLogo + alturaLogo + 8
  doc.strokeColor(COR_PRIMARIA).lineWidth(1.2)
     .moveTo(MARGEM.left, yLinha).lineTo(MARGEM.left + LARGURA_UTIL, yLinha).stroke()

  // Título do relatório + período + data/hora de geração
  const agora = new Date()
  const dataHoraGeracao = agora.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

  doc.font('Helvetica-Bold').fontSize(14).fillColor(COR_PRIMARIA)
     .text(opcoes.tituloRelatorio, MARGEM.left, yLinha + 10)
  doc.font('Helvetica').fontSize(9).fillColor(COR_TEXTO)
     .text(`Período: ${opcoes.periodoDescricao}  |  Gerado em ${dataHoraGeracao}`, MARGEM.left, yLinha + 28)

  doc.y = yLinha + 46
}

// ============================================================
// CartaoResumo / desenharCartoesResumo()
// Linha única de cartões, largura igual, fundo levemente
// destacado, valor em destaque tipográfico (Seção 5.1)
// ============================================================
export interface CartaoResumo {
  rotulo: string
  valor: string // já formatado pelo chamador (moeda, %, etc.)
}

export function desenharCartoesResumo(doc: PDFKit.PDFDocument, cartoes: CartaoResumo[]) {
  if (cartoes.length === 0) return

  const gap = 10
  const larguraCartao = (LARGURA_UTIL - gap * (cartoes.length - 1)) / cartoes.length
  const alturaCartao = 46
  const y = doc.y

  cartoes.forEach((cartao, i) => {
    const x = MARGEM.left + i * (larguraCartao + gap)
    doc.rect(x, y, larguraCartao, alturaCartao).fill(COR_ZEBRA)
    doc.font('Helvetica').fontSize(8).fillColor(COR_TEXTO_CLARO)
       .text(cartao.rotulo, x + 8, y + 8, { width: larguraCartao - 16 })
    doc.font('Helvetica-Bold').fontSize(13).fillColor(COR_PRIMARIA)
       .text(cartao.valor, x + 8, y + 22, { width: larguraCartao - 16 })
  })

  doc.y = y + alturaCartao + 16
}

// ============================================================
// ColunaTabela / desenharTabela()
// Cabeçalho com fundo cor primária e texto branco, linhas
// zebradas, valores monetários alinhados à direita (Seção 5.1).
// Pagina automaticamente: quando uma linha não cabe mais na
// página atual, abre nova página e repete o cabeçalho da tabela
// (decisão de engenharia — a spec não detalha esse caso, mas é
// o padrão usual em relatório tabular; sinalizar ao Maycon se
// preferir comportamento diferente)
// ============================================================
export interface ColunaTabela {
  chave: string
  rotulo: string
  larguraProporcional: number // soma das proporções de todas as colunas define a divisão de LARGURA_UTIL
  alinhamento?: 'left' | 'right' | 'center'
}

export function desenharTabela(
  doc: PDFKit.PDFDocument,
  colunas: ColunaTabela[],
  linhas: Record<string, string>[],
) {
  const somaProporcoes = colunas.reduce((s, c) => s + c.larguraProporcional, 0)
  const larguras = colunas.map(c => (c.larguraProporcional / somaProporcoes) * LARGURA_UTIL)
  const ALTURA_LINHA = 18
  const ALTURA_CABECALHO = 20

  function desenharCabecalhoTabela() {
    const y = doc.y
    doc.rect(MARGEM.left, y, LARGURA_UTIL, ALTURA_CABECALHO).fill(COR_PRIMARIA)
    let x = MARGEM.left
    colunas.forEach((col, i) => {
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff')
         .text(col.rotulo, x + 6, y + 6, { width: larguras[i] - 12, align: col.alinhamento ?? 'left' })
      x += larguras[i]
    })
    doc.y = y + ALTURA_CABECALHO
  }

  // Correção Low §6.2 (Handoff_Modulo_Relatorios_Audit_para_QA.md) —
  // antes, o cabeçalho da tabela era desenhado incondicionalmente
  // aqui, sem checar se doc.y já estava perto do fim da página (a
  // checagem só existia dentro do loop de linhas, abaixo). Não é
  // reprodutível com os 6 relatórios atuais (cartões + gráfico têm
  // altura fixa, nunca empurram doc.y perto do limite antes da
  // tabela começar), mas é uma lacuna real para um relatório futuro
  // com mais cartões ou gráfico mais alto. Mesma guarda do loop,
  // reaplicada aqui antes do primeiro cabeçalho.
  if (doc.y + ALTURA_CABECALHO > ALTURA_PAGINA_A4 - MARGEM.bottom) {
    doc.addPage()
    doc.y = MARGEM.top
  }
  desenharCabecalhoTabela()

  if (linhas.length === 0) {
    doc.font('Helvetica').fontSize(9).fillColor(COR_TEXTO_CLARO)
       .text('Nenhum lançamento no período selecionado.', MARGEM.left, doc.y + 10, { width: LARGURA_UTIL, align: 'center' })
    doc.y += 30
    return
  }

  linhas.forEach((linha, index) => {
    // Quebra de página — deixa espaço para o rodapé (MARGEM.bottom)
    if (doc.y + ALTURA_LINHA > ALTURA_PAGINA_A4 - MARGEM.bottom) {
      doc.addPage()
      doc.y = MARGEM.top
      desenharCabecalhoTabela()
    }

    const y = doc.y
    if (index % 2 !== 0) {
      doc.rect(MARGEM.left, y, LARGURA_UTIL, ALTURA_LINHA).fill(COR_ZEBRA)
    }

    let x = MARGEM.left
    colunas.forEach((col, i) => {
      doc.font('Helvetica').fontSize(8).fillColor(COR_TEXTO)
         .text(linha[col.chave] ?? '—', x + 6, y + 5, { width: larguras[i] - 12, align: col.alinhamento ?? 'left' })
      x += larguras[i]
    })

    doc.y = y + ALTURA_LINHA
  })
}

// ============================================================
// finalizarComRodape()
// Percorre TODAS as páginas já desenhadas (bufferedPageRange —
// só funciona porque o doc foi criado com bufferPages: true) e
// escreve o disclaimer fixo + numeração em cada uma, inclusive a
// primeira (Seção 5.1: "não só na última"). Deve ser a ÚLTIMA
// chamada antes de doc.end()/pipe — depois dela não é seguro
// desenhar mais conteúdo de página (o PDFKit já fechou a régua
// de buffer ao trocar de página pela última vez aqui dentro)
// ============================================================
export function finalizarComRodape(doc: PDFKit.PDFDocument) {
  const paginas = doc.bufferedPageRange()

  for (let i = 0; i < paginas.count; i++) {
    doc.switchToPage(i)

    const yLinha = ALTURA_PAGINA_A4 - MARGEM.bottom + 6
    doc.strokeColor(COR_GRADE).lineWidth(0.8)
       .moveTo(MARGEM.left, yLinha).lineTo(MARGEM.left + LARGURA_UTIL, yLinha).stroke()

    doc.font('Helvetica').fontSize(6.5).fillColor(COR_TEXTO_CLARO)
       .text(DISCLAIMER_RELATORIOS, MARGEM.left, yLinha + 6, { width: LARGURA_UTIL - 70 })

    doc.font('Helvetica').fontSize(7).fillColor(COR_TEXTO_CLARO)
       .text(`Página ${i + 1} de ${paginas.count}`, MARGEM.left + LARGURA_UTIL - 70, yLinha + 6, { width: 70, align: 'right' })
  }
}

// Reexporta o construtor — mesmo motivo de lib/relatorios/pdfGrafico.ts
// (ponto único de import da lib pdfkit dentro do módulo Relatórios)
export { PDFDocument }
