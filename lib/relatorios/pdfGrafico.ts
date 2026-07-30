// ============================================================
// lib/relatorios/pdfGrafico.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Desenha os 5 tipos de gráfico da Seção 1.5 diretamente
//         com primitivas PDFKit (retângulo, linha, círculo, path,
//         texto) — espelho de components/relatorios/GraficoSvg.tsx,
//         mesma paleta e mesma lógica de escala, só que em vez de
//         SVG usa a API de desenho do PDFKit. Os dois consomem o
//         mesmo tipo DadosGrafico (types/relatorios.ts) E as mesmas
//         margens (lib/relatorios/graficoLayout.ts), garantindo que
//         tela e PDF mostrem o mesmo gráfico com as mesmas proporções.
// Conecta com: types/relatorios.ts (DadosGrafico), lib/relatorios/
//              graficoLayout.ts (margens compartilhadas com
//              GraficoSvg.tsx), lib/relatorios/pdfBuilder.ts (chama
//              desenharGrafico() na posição certa do layout de cada
//              relatório)
// Referência: Especificacao_Modulo_Relatorios.md, Seção 1.5
//             (gráfico obrigatório no PDF como imagem estática —
//              aqui é desenho vetorial nativo, não rasterizado)
//
// CORREÇÕES aplicadas (Handoff_Modulo_Relatorios_Audit_para_QA.md):
//   - High §3.2 — pizza com 1 única categoria de valor > 0 desenhava
//     um path degenerado (início = fim do arco, por periodicidade de
//     seno/cosseno em 360°) e não aparecia nada na tela. Fix: círculo
//     cheio nesse caso específico, não um path quase-360° por epsilon.
//   - Medium §5.1 — margens de linha/barras, barras_agrupadas e
//     pareto agora vêm de lib/relatorios/graficoLayout.ts (antes,
//     este arquivo não tinha margem esquerda/direita nenhuma nos
//     tipos linha/barras/pareto — as barras/linha ficavam coladas
//     na borda no PDF, enquanto na tela (GraficoSvg.tsx) sempre
//     tiveram 16pt de respiro; visualmente os dois divergiam).
// ============================================================

import PDFDocument from 'pdfkit'
import type { DadosGrafico } from '@/types/relatorios'
import { MARGEM_LINHA_BARRAS, MARGEM_BARRAS_AGRUPADAS, MARGEM_PARETO, type MargemGrafico } from '@/lib/relatorios/graficoLayout'

// Mesma paleta de GraficoSvg.tsx — mantida sincronizada manualmente
// (arquivos em tecnologias diferentes, sem import compartilhado de
// constante de cor possível entre 'use client' e Node puro sem risco
// de puxar código de browser para o bundle de API route)
const COR_PRIMARIA = '#1a6094'
const COR_BARRA_PARETO = '#378ADD'
const COR_LINHA_ACUMULADA = '#993c1d'
const COR_GRADE = '#dde8f0'
const COR_TEXTO_EIXO = '#5a84a6'
const PALETA_PIZZA = ['#1a6094', '#378ADD', '#5aa9e6', '#7fc4d9', '#a8dadc', '#c9e4de']

interface OpcoesDesenho {
  x: number
  y: number
  largura: number
  altura: number
}

// ============================================================
// formatarMoedaCompacta — idêntico ao de GraficoSvg.tsx
// ============================================================
function formatarMoedaCompacta(valor: number): string {
  if (Math.abs(valor) >= 1000) {
    return `R$ ${(valor / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  }
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

// ============================================================
// textoCentralizado
// PDFKit posiciona texto a partir do canto superior-esquerdo —
// este helper centraliza em torno de um X, imitando textAnchor=
// "middle" do SVG
// ============================================================
function textoCentralizado(
  doc: PDFKit.PDFDocument,
  texto: string,
  centroX: number,
  y: number,
  larguraMax: number,
  tamanho: number,
  cor: string,
) {
  doc.fontSize(tamanho).fillColor(cor)
     .text(texto, centroX - larguraMax / 2, y, { width: larguraMax, align: 'center' })
}

// ============================================================
// desenharGrafico
// Função pública única — recebe o tipo em `dados.tipo` e delega
// para o desenhista certo. Retorna o Y logo abaixo do gráfico
// desenhado, para o pdfBuilder saber onde continuar o layout.
// ============================================================
export function desenharGrafico(
  doc: PDFKit.PDFDocument,
  dados: DadosGrafico,
  opcoes: OpcoesDesenho,
): number {
  switch (dados.tipo) {
    case 'linha':
    case 'barras':
      desenharLinhaOuBarras(doc, dados.pontos, opcoes, dados.tipo)
      break
    case 'barras_agrupadas':
      desenharBarrasAgrupadas(doc, dados.pontos, dados.legendaA, dados.legendaB, opcoes)
      break
    case 'pareto':
      desenharPareto(doc, dados.pontos, opcoes)
      break
    case 'pizza':
      desenharPizza(doc, dados.pontos, opcoes)
      break
  }
  return opcoes.y + opcoes.altura + 12
}

// ============================================================
// desenharLinhaOuBarras
// Margens: MARGEM_LINHA_BARRAS (graficoLayout.ts) — mesma fonte que
// GraficoSvg.tsx usa na tela (Finding Medium §5.1)
// ============================================================
function desenharLinhaOuBarras(
  doc: PDFKit.PDFDocument,
  pontos: { rotulo: string; valor: number }[],
  opcoes: OpcoesDesenho,
  modo: 'linha' | 'barras',
) {
  if (pontos.length === 0) return desenharSemDados(doc, opcoes)

  const MARGEM = MARGEM_LINHA_BARRAS
  const x0 = opcoes.x + MARGEM.esquerda
  const y0 = opcoes.y + MARGEM.topo
  const areaLargura = opcoes.largura - MARGEM.esquerda - MARGEM.direita
  const areaAltura = opcoes.altura - MARGEM.topo - MARGEM.baixo
  const valorMax = Math.max(...pontos.map(p => p.valor), 0)
  const escalaY = (v: number) => (valorMax === 0 ? 0 : (v / valorMax) * areaAltura)
  const passoX = areaLargura / pontos.length

  desenharLinhaBase(doc, opcoes, MARGEM)

  if (modo === 'barras') {
    pontos.forEach((p, i) => {
      const alturaBarra = escalaY(p.valor)
      const x = x0 + i * passoX + passoX * 0.15
      const larguraBarra = passoX * 0.7
      const y = y0 + (areaAltura - alturaBarra)
      doc.rect(x, y, larguraBarra, alturaBarra).fill(COR_PRIMARIA)
      textoCentralizado(doc, formatarMoedaCompacta(p.valor), x + larguraBarra / 2, y - 10, larguraBarra + 20, 7, COR_TEXTO_EIXO)
    })
  } else {
    const coords = pontos.map((p, i) => {
      const x = x0 + i * passoX + passoX / 2
      const y = y0 + (areaAltura - escalaY(p.valor))
      return { x, y, valor: p.valor }
    })
    doc.strokeColor(COR_PRIMARIA).lineWidth(2)
    coords.forEach((c, i) => {
      if (i === 0) doc.moveTo(c.x, c.y)
      else doc.lineTo(c.x, c.y)
    })
    doc.stroke()
    coords.forEach(c => {
      doc.circle(c.x, c.y, 2.5).fill(COR_PRIMARIA)
      textoCentralizado(doc, formatarMoedaCompacta(c.valor), c.x, c.y - 16, 70, 7, COR_TEXTO_EIXO)
    })
  }

  pontos.forEach((p, i) => {
    const x = x0 + i * passoX + passoX / 2
    textoCentralizado(doc, p.rotulo, x, y0 + areaAltura + 4, passoX, 7, COR_TEXTO_EIXO)
  })
}

// ============================================================
// desenharBarrasAgrupadas
// Margens: MARGEM_BARRAS_AGRUPADAS (topo maior — espaço de legenda)
// ============================================================
function desenharBarrasAgrupadas(
  doc: PDFKit.PDFDocument,
  pontos: { rotulo: string; valorA: number; valorB: number }[],
  legendaA: string,
  legendaB: string,
  opcoes: OpcoesDesenho,
) {
  if (pontos.length === 0) return desenharSemDados(doc, opcoes)

  const MARGEM = MARGEM_BARRAS_AGRUPADAS
  const x0 = opcoes.x + MARGEM.esquerda
  const y0 = opcoes.y + MARGEM.topo
  const areaLargura = opcoes.largura - MARGEM.esquerda - MARGEM.direita
  const areaAltura = opcoes.altura - MARGEM.topo - MARGEM.baixo
  const valorMax = Math.max(...pontos.map(p => Math.max(p.valorA, p.valorB)), 0)
  const escalaY = (v: number) => (valorMax === 0 ? 0 : (v / valorMax) * areaAltura)
  const passoX = areaLargura / pontos.length

  // Legenda — desenhada dentro da faixa reservada por MARGEM.topo
  doc.rect(x0, opcoes.y + 6, 9, 9).fill(COR_PRIMARIA)
  doc.fontSize(9).fillColor(COR_TEXTO_EIXO).text(legendaA, x0 + 13, opcoes.y + 14)
  doc.rect(x0 + 90, opcoes.y + 6, 9, 9).fill(COR_LINHA_ACUMULADA)
  doc.fontSize(9).fillColor(COR_TEXTO_EIXO).text(legendaB, x0 + 103, opcoes.y + 14)

  desenharLinhaBase(doc, opcoes, MARGEM)

  pontos.forEach((p, i) => {
    const grupoX = x0 + i * passoX
    const larguraBarra = passoX * 0.32
    const alturaA = escalaY(p.valorA)
    const alturaB = escalaY(p.valorB)
    const xA = grupoX + passoX * 0.14
    const xB = xA + larguraBarra + 4

    doc.rect(xA, y0 + (areaAltura - alturaA), larguraBarra, alturaA).fill(COR_PRIMARIA)
    doc.rect(xB, y0 + (areaAltura - alturaB), larguraBarra, alturaB).fill(COR_LINHA_ACUMULADA)
    textoCentralizado(doc, p.rotulo, grupoX + passoX / 2, y0 + areaAltura + 4, passoX, 7, COR_TEXTO_EIXO)
  })
}

// ============================================================
// desenharPareto
// Margens: MARGEM_PARETO (direita maior — espaço do eixo secundário)
// ============================================================
function desenharPareto(
  doc: PDFKit.PDFDocument,
  pontos: { rotulo: string; valor: number; percentualAcumulado: number }[],
  opcoes: OpcoesDesenho,
) {
  if (pontos.length === 0) return desenharSemDados(doc, opcoes)

  const MARGEM = MARGEM_PARETO
  const x0 = opcoes.x + MARGEM.esquerda
  const y0 = opcoes.y + MARGEM.topo
  const areaLargura = opcoes.largura - MARGEM.esquerda - MARGEM.direita
  const areaAltura = opcoes.altura - MARGEM.topo - MARGEM.baixo
  const valorMax = Math.max(...pontos.map(p => p.valor), 0)
  const escalaBarraY = (v: number) => (valorMax === 0 ? 0 : (v / valorMax) * areaAltura)
  const escalaLinhaY = (pct: number) => (pct / 100) * areaAltura
  const passoX = areaLargura / pontos.length

  desenharLinhaBase(doc, opcoes, MARGEM)

  // Linha de referência 80% (Classe A)
  const y80 = y0 + (areaAltura - escalaLinhaY(80))
  doc.strokeColor(COR_GRADE).lineWidth(1).dash(3, { space: 3 })
     .moveTo(x0, y80).lineTo(x0 + areaLargura, y80).stroke()
  doc.undash()

  pontos.forEach((p, i) => {
    const alturaBarra = escalaBarraY(p.valor)
    const x = x0 + i * passoX + passoX * 0.15
    const larguraBarra = passoX * 0.7
    const y = y0 + (areaAltura - alturaBarra)
    doc.rect(x, y, larguraBarra, alturaBarra).fill(COR_BARRA_PARETO)
  })

  const coordsLinha = pontos.map((p, i) => {
    const x = x0 + i * passoX + passoX / 2
    const y = y0 + (areaAltura - escalaLinhaY(p.percentualAcumulado))
    return { x, y }
  })
  doc.strokeColor(COR_LINHA_ACUMULADA).lineWidth(2)
  coordsLinha.forEach((c, i) => {
    if (i === 0) doc.moveTo(c.x, c.y)
    else doc.lineTo(c.x, c.y)
  })
  doc.stroke()
  coordsLinha.forEach(c => doc.circle(c.x, c.y, 2).fill(COR_LINHA_ACUMULADA))

  // Rótulos — mesma amostragem de GraficoSvg.tsx pra não poluir
  // quando há muitos itens
  const passoRotulo = pontos.length > 15 ? Math.ceil(pontos.length / 15) : 1
  pontos.forEach((p, i) => {
    if (i % passoRotulo !== 0) return
    const x = x0 + i * passoX + passoX / 2
    const rotuloCurto = p.rotulo.length > 10 ? p.rotulo.slice(0, 9) + '…' : p.rotulo
    textoCentralizado(doc, rotuloCurto, x, y0 + areaAltura + 4, passoX, 6, COR_TEXTO_EIXO)
  })
}

// ============================================================
// desenharPizza
//
// CORREÇÃO High §3.2 (Handoff_Modulo_Relatorios_Audit_para_QA.md) —
// quando só existe 1 categoria com valor > 0 (100% do total), o
// ângulo final da fatia (-90 + 360 = 270°) cai no MESMO ponto do
// ângulo inicial (-90°) — seno/cosseno são periódicos em 360°. O
// path gerado nesse caso é degenerado (início = fim do arco-para-si-
// mesmo) e o PDFKit não desenha nada. "Gastos por tipo de
// fornecedor" filtrado a 1 mês, ou com tipoFiltro aplicado, cai
// nesse caso com frequência real, não é hipotético. Fix: desenha um
// círculo cheio nesse caso específico — nada de "quase 360°" por
// epsilon, que deixaria uma fresta e reintroduziria o mesmo bug em
// outro ângulo se a precisão de ponto flutuante mudar.
// ============================================================
function desenharPizza(
  doc: PDFKit.PDFDocument,
  pontos: { rotulo: string; valor: number }[],
  opcoes: OpcoesDesenho,
) {
  const total = pontos.reduce((soma, p) => soma + p.valor, 0)
  if (pontos.length === 0 || total === 0) return desenharSemDados(doc, opcoes)

  const cx = opcoes.x + opcoes.largura * 0.32
  const cy = opcoes.y + opcoes.altura / 2
  const raio = Math.min(opcoes.altura / 2, opcoes.largura * 0.28) - 8

  const categoriasComValor = pontos.filter(p => p.valor > 0)

  if (categoriasComValor.length === 1) {
    doc.circle(cx, cy, raio).fill(PALETA_PIZZA[0])
  } else {
    let anguloAcumulado = -90

    pontos.forEach((p, i) => {
      const fatiaAngulo = (p.valor / total) * 360
      const anguloInicial = anguloAcumulado
      const anguloFinal = anguloAcumulado + fatiaAngulo
      anguloAcumulado = anguloFinal

      const [x1, y1] = coordenadasNoAngulo(cx, cy, raio, anguloInicial)
      const [x2, y2] = coordenadasNoAngulo(cx, cy, raio, anguloFinal)
      const arcoGrande = fatiaAngulo > 180 ? 1 : 0
      // PDFKit .path() aceita a mesma sintaxe de path data usada no SVG
      const caminho = `M ${cx},${cy} L ${x1},${y1} A ${raio},${raio} 0 ${arcoGrande} 1 ${x2},${y2} Z`

      doc.path(caminho).fill(PALETA_PIZZA[i % PALETA_PIZZA.length])
    })
  }

  // Legenda à direita — desenhada sempre, independente do caso
  // degenerado acima (círculo cheio ainda precisa da legenda normal)
  pontos.forEach((p, i) => {
    const pct = (p.valor / total) * 100
    const yLegenda = opcoes.y + 8 + i * 14
    doc.rect(opcoes.x + opcoes.largura * 0.62, yLegenda, 8, 8).fill(PALETA_PIZZA[i % PALETA_PIZZA.length])
    doc.fontSize(7).fillColor(COR_TEXTO_EIXO)
       .text(`${p.rotulo} — ${pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`, opcoes.x + opcoes.largura * 0.62 + 12, yLegenda)
  })
}

function coordenadasNoAngulo(cx: number, cy: number, raio: number, angulo: number): [number, number] {
  const rad = (angulo * Math.PI) / 180
  return [cx + raio * Math.cos(rad), cy + raio * Math.sin(rad)]
}

// ============================================================
// desenharLinhaBase / desenharSemDados
// desenharLinhaBase agora recebe o objeto MargemGrafico completo
// (antes recebia só margemBaixo: number) para poder desenhar a
// linha entre x0..x0+areaLargura em vez de opcoes.x..opcoes.x+
// opcoes.largura — necessário pra linha base bater com a área de
// plotagem real depois da margem esquerda/direita entrar em vigor
// (Finding Medium §5.1)
// ============================================================
function desenharLinhaBase(doc: PDFKit.PDFDocument, opcoes: OpcoesDesenho, margem: MargemGrafico) {
  const yBase = opcoes.y + opcoes.altura - margem.baixo
  const xInicio = opcoes.x + margem.esquerda
  const xFim = opcoes.x + opcoes.largura - margem.direita
  doc.strokeColor(COR_GRADE).lineWidth(1)
     .moveTo(xInicio, yBase).lineTo(xFim, yBase).stroke()
}

function desenharSemDados(doc: PDFKit.PDFDocument, opcoes: OpcoesDesenho) {
  textoCentralizado(
    doc,
    'Sem dados no período selecionado',
    opcoes.x + opcoes.largura / 2,
    opcoes.y + opcoes.altura / 2,
    opcoes.largura,
    9,
    COR_TEXTO_EIXO,
  )
}

// Reexporta o construtor — pdfBuilder.ts usa este import em vez de
// `require('pdfkit')` direto, mantendo um único ponto de import da
// lib no módulo Relatórios inteiro
export { PDFDocument }
