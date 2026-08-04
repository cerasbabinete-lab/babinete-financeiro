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
//              lib/relatorios/pdfGrafico.ts (desenharGrafico)
// Referência: Especificacao_Modulo_Relatorios.md, Seção 1.1
//             (disclaimer obrigatório) e Seção 5.1 (layout do
//             documento exportado, aprovado por exemplo renderizado
//             — cabeçalho, cartões, gráfico, tabela zebrada, rodapé
//             fixo em toda página com paginação)
// ============================================================

import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'

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
// destacado, valor em destaque tipográfico (Seção 5.1).
//
// CORREÇÃO pós-entrega (relatório 2.7, 2ª rodada) — a 1ª correção
// só encolhia a fonte do VALOR. Com 6 cartões numa linha (mais que
// qualquer relatório anterior), o RÓTULO "Resultado Líquido" também
// não cabia em 1 linha a 8pt fixo e quebrava — como a posição do
// valor era um offset fixo (y+22), a 2ª linha do rótulo quebrado
// caía em cima do valor. Fix completo: mede a largura real de
// rótulo E valor (doc.widthOfString) e encolhe os dois
// independentemente até caberem em 1 linha (piso 6pt pro rótulo,
// 8pt pro valor) — e a posição do valor agora é calculada a partir
// da ALTURA REAL do rótulo já escolhido (doc.heightOfString), não
// mais um offset fixo. Isso elimina sobreposição mesmo no caso
// extremo em que um rótulo futuro não coubesse nem no piso de fonte
// (aí ele quebra em 2 linhas normalmente, e o valor desce a altura
// certa pra não sobrepor — não é assumido, é medido). Não muda o
// visual dos relatórios existentes: nos casos onde tudo já cabia em
// 8pt/13pt, o resultado é pixel-a-pixel equivalente ao anterior
// (diferença de fração de ponto por arredondamento de heightOfString,
// imperceptível).
// ============================================================
export interface CartaoResumo {
  rotulo: string
  valor: string // já formatado pelo chamador (moeda, %, etc.)
}

export function desenharCartoesResumo(doc: PDFKit.PDFDocument, cartoes: CartaoResumo[]) {
  if (cartoes.length === 0) return

  const gap = 10
  const larguraCartao = (LARGURA_UTIL - gap * (cartoes.length - 1)) / cartoes.length
  const PADDING_INTERNO = 8
  const larguraDisponivel = larguraCartao - PADDING_INTERNO * 2
  const y = doc.y

  const ROTULO_FONTE_MAX = 8
  const ROTULO_FONTE_MIN = 6
  const VALOR_FONTE_MAX = 13
  const VALOR_FONTE_MIN = 8

  // Maior tamanho de fonte (dentro de [min,max]) que faz o texto
  // caber em 1 linha na largura disponível. Se nem no piso couber,
  // retorna o piso mesmo assim — doc.text() com width quebra sozinho,
  // e a altura real (não assumida) é medida à parte logo abaixo
  function tamanhoQueCabeEm1Linha(texto: string, fonte: string, max: number, min: number): number {
    doc.font(fonte)
    for (let tamanho = max; tamanho > min; tamanho--) {
      doc.fontSize(tamanho)
      if (doc.widthOfString(texto) <= larguraDisponivel) return tamanho
    }
    return min
  }

  // Pré-calcula fonte e altura real de cada rótulo ANTES de desenhar
  // qualquer cartão — todos os cartões da linha compartilham a mesma
  // altura e o mesmo offset de valor, então o pior caso entre eles
  // (rótulo mais alto) decide os dois pra linha inteira
  const infoRotulos = cartoes.map(cartao => {
    const tamanho = tamanhoQueCabeEm1Linha(cartao.rotulo, 'Helvetica', ROTULO_FONTE_MAX, ROTULO_FONTE_MIN)
    doc.font('Helvetica').fontSize(tamanho)
    const altura = doc.heightOfString(cartao.rotulo, { width: larguraDisponivel })
    return { tamanho, altura }
  })

  const alturaRotuloMax = Math.max(...infoRotulos.map(r => r.altura))
  const yOffsetValor = 8 + alturaRotuloMax + 4
  const alturaCartao = Math.max(46, yOffsetValor + 22)

  cartoes.forEach((cartao, i) => {
    const x = MARGEM.left + i * (larguraCartao + gap)
    doc.rect(x, y, larguraCartao, alturaCartao).fill(COR_ZEBRA)

    doc.font('Helvetica').fontSize(infoRotulos[i].tamanho).fillColor(COR_TEXTO_CLARO)
       .text(cartao.rotulo, x + PADDING_INTERNO, y + 8, { width: larguraDisponivel })

    const tamanhoValor = tamanhoQueCabeEm1Linha(cartao.valor, 'Helvetica-Bold', VALOR_FONTE_MAX, VALOR_FONTE_MIN)
    doc.font('Helvetica-Bold').fontSize(tamanhoValor).fillColor(COR_PRIMARIA)
       .text(cartao.valor, x + PADDING_INTERNO, y + yOffsetValor, { width: larguraDisponivel })
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
  const PADDING_CELULA = 6

  // CORREÇÃO pós-entrega (relatório 2.7, 3ª rodada) — mesmo bug de
  // "texto não cabe, quebra linha, próxima peça sobrepõe" das duas
  // correções anteriores (cartões de resumo), só que aqui é o
  // CABEÇALHO da tabela: com 7 colunas estreitas, "Resultado
  // Líquido" a 8pt bold (69,8pt) não cabia nos 64pt disponíveis da
  // coluna, quebrava em 2 linhas, e como ALTURA_CABECALHO era um
  // valor fixo (20pt), a 2ª linha vazava pra cima da primeira linha
  // de dados da tabela. As duas correções anteriores só tocaram
  // desenharCartoesResumo() — esta função (desenharTabela) tinha o
  // mesmo problema, sem fix, o que é exatamente o que apareceu no
  // teste seguinte. Fix: mesmo princípio de shrink-to-fit + altura
  // medida (não assumida) já usado nos cartões, aplicado aqui no
  // cabeçalho — calculado 1x antes do primeiro desenho, reaproveitado
  // em toda repetição de cabeçalho nas páginas seguintes.
  const FONTE_CABECALHO_MAX = 8
  const FONTE_CABECALHO_MIN = 6

  function tamanhoFonteCabecalhoQueCabe(texto: string, larguraDisponivel: number): number {
    doc.font('Helvetica-Bold')
    for (let tamanho = FONTE_CABECALHO_MAX; tamanho > FONTE_CABECALHO_MIN; tamanho--) {
      doc.fontSize(tamanho)
      if (doc.widthOfString(texto) <= larguraDisponivel) return tamanho
    }
    return FONTE_CABECALHO_MIN
  }

  const infoCabecalho = colunas.map((col, i) => {
    const larguraDisponivel = larguras[i] - PADDING_CELULA * 2
    const tamanho = tamanhoFonteCabecalhoQueCabe(col.rotulo, larguraDisponivel)
    doc.font('Helvetica-Bold').fontSize(tamanho)
    const altura = doc.heightOfString(col.rotulo, { width: larguraDisponivel })
    return { tamanho, altura }
  })
  const ALTURA_CABECALHO = Math.max(20, Math.max(...infoCabecalho.map(c => c.altura)) + PADDING_CELULA * 2)

  function desenharCabecalhoTabela() {
    const y = doc.y
    doc.rect(MARGEM.left, y, LARGURA_UTIL, ALTURA_CABECALHO).fill(COR_PRIMARIA)
    let x = MARGEM.left
    colunas.forEach((col, i) => {
      doc.font('Helvetica-Bold').fontSize(infoCabecalho[i].tamanho).fillColor('#ffffff')
         .text(col.rotulo, x + PADDING_CELULA, y + PADDING_CELULA, { width: larguras[i] - PADDING_CELULA * 2, align: col.alinhamento ?? 'left' })
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
// desenharAvisoDestacado()
// Bloco de aviso ADICIONAL ao disclaimer padrão (que só vai no
// rodapé via finalizarComRodape) — para avisos específicos de UM
// relatório que precisam ficar em destaque perto do conteúdo a que
// se referem, não escondidos no rodapé em fonte reduzida. Primeiro
// uso: Seção 2.7 (Receita x Despesa), aviso de que "Resultado" não
// é apuração contábil de lucro — chamado pela rota de API logo após
// desenharCartoesResumo(), antes do gráfico. Genérico o suficiente
// pra qualquer relatório futuro que precise do mesmo recurso.
// ============================================================
export function desenharAvisoDestacado(doc: PDFKit.PDFDocument, texto: string) {
  const PADDING = 8
  // Calcula a altura do bloco antes de desenhar o fundo — o PDFKit
  // não tem "medir texto sem desenhar" direto, mas doc.heightOfString
  // faz exatamente isso, respeitando a largura que o texto vai usar
  const larguraTexto = LARGURA_UTIL - PADDING * 2
  doc.font('Helvetica-Oblique').fontSize(8)
  const alturaTexto = doc.heightOfString(texto, { width: larguraTexto })
  const alturaBloco = alturaTexto + PADDING * 2

  const y = doc.y
  // Fundo âmbar suave — deliberadamente diferente de COR_ZEBRA (usada
  // nos cartões de resumo) pra não parecer "mais um cartão", e sim um
  // aviso — mesma lógica visual de FaixaErro na tela (cor distinta
  // de alerta), só que em tom neutro de atenção, não de erro
  doc.rect(MARGEM.left, y, LARGURA_UTIL, alturaBloco).fill('#fdf6e8')
  doc.strokeColor('#e8d5a3').lineWidth(1).rect(MARGEM.left, y, LARGURA_UTIL, alturaBloco).stroke()

  doc.font('Helvetica-Oblique').fontSize(8).fillColor('#7a5c1e')
     .text(texto, MARGEM.left + PADDING, y + PADDING, { width: larguraTexto })

  doc.y = y + alturaBloco + 12
}

// ============================================================
// finalizarComRodape()
// Percorre TODAS as páginas já desenhadas (bufferedPageRange —
// só funciona porque o doc foi criado com bufferPages: true) e
// escreve a numeração em cada uma, inclusive a primeira (Seção
// 5.1: "não só na última"). Deve ser a ÚLTIMA chamada antes de
// doc.end()/pipe — depois dela não é seguro desenhar mais conteúdo
// de página (o PDFKit já fechou a régua de buffer ao trocar de
// página pela última vez aqui dentro).
// Não desenha mais o disclaimer fixo (DISCLAIMER_RELATORIOS,
// removido a pedido do Maycon — ver nota em types/relatorios.ts) —
// mantém a linha separadora e a numeração de página, só o texto foi
// removido.
//
// CORREÇÃO CRÍTICA pós-entrega (relatório 2.7, 4ª rodada) — bug do
// PDFKit em si, não introduzido por nenhuma das 3 correções
// anteriores, e provavelmente presente nos 6 relatórios antigos
// também (silencioso — só aparece gerando um PDF de verdade e
// olhando o número de páginas, nunca foi verificado). yLinha
// (792,89pt) fica DE PROPÓSITO abaixo da área de conteúdo (maxY =
// altura - MARGEM.bottom = 786,89pt) — é assim que um rodapé
// funciona, vive na margem. Só que o PDFKit, ao chamar doc.text()
// com uma coordenada Y além do maxY calculado a partir de
// page.margins.bottom, interpreta isso como "não cabe mais nesta
// página" e insere uma página EXTRA em branco automaticamente antes
// de desenhar — o texto do rodapé cai nessa página nova, não na
// página de conteúdo pretendida. Confirmado isoladamente com um
// PDFKit puro, fora de qualquer código deste projeto (não é bug de
// lógica nossa, é comportamento documentado do PDFKit). Fix padrão
// da comunidade PDFKit: zera page.margins.bottom só durante o
// desenho do texto do rodapé (então maxY vira a altura inteira da
// página, o Y do rodapé passa a caber) e restaura o valor original
// logo em seguida — sem isso, TODO PDF exportado por este módulo
// ganha uma página em branco extra ao final, com a numeração de
// página não aparecendo em nenhuma página de conteúdo real.
// ============================================================
export function finalizarComRodape(doc: PDFKit.PDFDocument) {
  const paginas = doc.bufferedPageRange()

  for (let i = 0; i < paginas.count; i++) {
    doc.switchToPage(i)

    const yLinha = ALTURA_PAGINA_A4 - MARGEM.bottom + 6
    doc.strokeColor(COR_GRADE).lineWidth(0.8)
       .moveTo(MARGEM.left, yLinha).lineTo(MARGEM.left + LARGURA_UTIL, yLinha).stroke()

    // Ver bloco de correção crítica acima — sem isso, esta chamada de
    // texto sozinha já provoca uma página em branco extra
    const margemInferiorOriginal = doc.page.margins.bottom
    doc.page.margins.bottom = 0
    doc.font('Helvetica').fontSize(7).fillColor(COR_TEXTO_CLARO)
       .text(`Página ${i + 1} de ${paginas.count}`, MARGEM.left + LARGURA_UTIL - 70, yLinha + 6, { width: 70, align: 'right' })
    doc.page.margins.bottom = margemInferiorOriginal
  }
}

// Reexporta o construtor — mesmo motivo de lib/relatorios/pdfGrafico.ts
// (ponto único de import da lib pdfkit dentro do módulo Relatórios)
export { PDFDocument }
