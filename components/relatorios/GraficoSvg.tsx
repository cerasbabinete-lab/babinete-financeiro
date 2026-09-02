// ============================================================
// components/relatorios/GraficoSvg.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Renderiza os 5 tipos de gráfico exigidos pela Seção 1.5
//         da spec (linha, barras, barras_agrupadas, pareto, pizza)
//         como SVG nativo — decisão de arquitetura aprovada por
//         Maycon: sem lib de gráfico nova (recharts/chart.js etc.),
//         mesmo espírito de "zero dependência supérflua" do projeto.
//         O desenho aqui é espelhado em lib/relatorios/pdfGrafico.ts,
//         que reproduz os MESMOS 5 tipos com primitivas PDFKit para
//         a exportação em PDF — os dois consomem o mesmo tipo
//         DadosGrafico (types/relatorios.ts), garantindo que tela e
//         PDF mostrem exatamente o mesmo gráfico.
// Conecta com: types/relatorios.ts (DadosGrafico e variantes),
//              usado por todos os 6 componentes de relatório
//              (Fases 2–7), lib/relatorios/pdfGrafico.ts (espelho PDF)
// Referência: Especificacao_Modulo_Relatorios.md, Seção 1.5
//             (tabela de tipo de gráfico por relatório; paleta
//             aprovada do Pareto: barras #378ADD, linha #993c1d)
//
// EDIÇÃO (Especificacao_Modulo_Dashboard.md, Seção 4 — único arquivo
// de Relatórios que este módulo tem autorização de editar, Seção 10):
// GraficoBarrasAgrupadas ganhou (1) rótulo de valor acima de cada
// barra, requisito travado da Seção 4, e (2) props corA/corB
// opcionais para o Dashboard poder passar verde/vermelho em vez das
// cores fixas do Fluxo de Caixa. Decisão confirmada com Maycon: o
// rótulo de valor é incondicional — o Fluxo de Caixa também passa a
// exibi-lo a partir desta mudança, não é um comportamento exclusivo
// do Dashboard nem controlado por prop. Formato/orientação final dos
// rótulos ajustado numa segunda rodada, depois de um teste visual
// com 30 dias de dados reprovado por Maycon (rótulo horizontal
// sobrepondo): rótulos agora são desenhados na VERTICAL (rotate
// -90°) e usam formatarValorBarraAgrupada() — formato próprio,
// distinto de formatarMoedaCompacta, sempre com "R$" e abreviação
// "k" (não "mil") — em vez do formato/orientação da primeira versão.
// ============================================================

'use client'

import type { DadosGrafico } from '@/types/relatorios'
import { MARGEM_LINHA_BARRAS, MARGEM_BARRAS_AGRUPADAS, MARGEM_PARETO } from '@/lib/relatorios/graficoLayout'

// ============================================================
// Paleta do módulo — mantém o total de cores usadas no módulo
// inteiro pequeno e consistente com a marca (#1a6094)
// ============================================================
const COR_PRIMARIA = '#1a6094'   // marca — barras/linha simples, entradas
const COR_BARRA_PARETO = '#378ADD' // aprovada nesta sessão p/ Curva ABC
const COR_LINHA_ACUMULADA = '#993c1d' // aprovada nesta sessão p/ Curva ABC — reused p/ "saídas"
const COR_GRADE = '#dde8f0'
const COR_TEXTO_EIXO = '#5a84a6'
const PALETA_PIZZA = ['#1a6094', '#378ADD', '#5aa9e6', '#7fc4d9', '#a8dadc', '#c9e4de']

// ============================================================
// Props
// ============================================================
interface GraficoSvgProps {
  dados: DadosGrafico
  titulo?: string
  altura?: number // padrão 260 — largura sempre 100% do container via viewBox responsivo
  // corA/corB — NOVO (Especificacao_Modulo_Dashboard.md, Seção 4):
  // override de cor só usado quando dados.tipo === 'barras_agrupadas'.
  // Sem valor informado, GraficoBarrasAgrupadas cai no próprio default
  // (COR_PRIMARIA/COR_LINHA_ACUMULADA, aparência atual do Fluxo de
  // Caixa, byte-a-byte igual a antes desta mudança). Dashboard passa
  // explicitamente verde (a receber) e vermelho (a pagar)
  corA?: string
  corB?: string
}

// ============================================================
// formatarMoedaCompacta
// Rótulos de eixo/fatia precisam ser curtos — formato compacto
// em milhares (ex: "R$ 12,4 mil"), sem casas decimais de centavos
// ============================================================
function formatarMoedaCompacta(valor: number): string {
  if (Math.abs(valor) >= 1000) {
    return `R$ ${(valor / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  }
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

// ============================================================
// formatarValorBarraAgrupada
// Formato NOVO, exclusivo dos rótulos de valor de GraficoBarrasAgrupadas
// (Especificacao_Modulo_Dashboard.md — decisão confirmada com Maycon
// nesta sessão): "R$" sempre presente (nunca omitido), abreviação
// "k" em vez de "mil" a partir de R$ 1.000, valor cheio com centavos
// abaixo disso (ex: "R$ 890,00"). Deliberadamente um formatador
// separado de formatarMoedaCompacta acima — aquele é usado pelo modo
// 'barras' single-série (Relatórios) e não deve mudar de
// comportamento por causa de uma decisão visual específica do
// Dashboard
// ============================================================
function formatarValorBarraAgrupada(valor: number): string {
  if (Math.abs(valor) >= 1000) {
    return `R$ ${(valor / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`
  }
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ============================================================
// GraficoSvg
// ============================================================
export default function GraficoSvg({ dados, titulo, altura = 260, corA, corB }: GraficoSvgProps) {
  const LARGURA_VIEWBOX = 680
  const ALTURA_VIEWBOX = altura

  return (
    <div style={{ width: '100%', fontFamily: 'Tahoma, Geneva, sans-serif' }}>
      {titulo && (
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#1a6094', marginBottom: '6px' }}>
          {titulo}
        </div>
      )}
      <svg
        viewBox={`0 0 ${LARGURA_VIEWBOX} ${ALTURA_VIEWBOX}`}
        width="100%"
        height={altura}
        role="img"
        aria-label={titulo ?? 'Gráfico do relatório'}
      >
        {dados.tipo === 'linha' && (
          <GraficoLinhaOuBarras pontos={dados.pontos} largura={LARGURA_VIEWBOX} altura={ALTURA_VIEWBOX} modo="linha" />
        )}
        {dados.tipo === 'barras' && (
          <GraficoLinhaOuBarras pontos={dados.pontos} largura={LARGURA_VIEWBOX} altura={ALTURA_VIEWBOX} modo="barras" />
        )}
        {dados.tipo === 'barras_agrupadas' && (
          <GraficoBarrasAgrupadas
            pontos={dados.pontos}
            legendaA={dados.legendaA}
            legendaB={dados.legendaB}
            largura={LARGURA_VIEWBOX}
            altura={ALTURA_VIEWBOX}
            corA={corA}
            corB={corB}
          />
        )}
        {dados.tipo === 'pareto' && (
          <GraficoPareto pontos={dados.pontos} largura={LARGURA_VIEWBOX} altura={ALTURA_VIEWBOX} />
        )}
        {dados.tipo === 'pizza' && (
          <GraficoPizza pontos={dados.pontos} largura={LARGURA_VIEWBOX} altura={ALTURA_VIEWBOX} />
        )}
      </svg>
    </div>
  )
}

// ============================================================
// GraficoLinhaOuBarras
// Cobre os tipos 'linha' e 'barras' — ambos usam PontoGraficoSimples
// e a mesma área de plotagem, só muda o desenho da série
// ============================================================
function GraficoLinhaOuBarras({
  pontos,
  largura,
  altura,
  modo,
}: {
  pontos: { rotulo: string; valor: number }[]
  largura: number
  altura: number
  modo: 'linha' | 'barras'
}) {
  if (pontos.length === 0) return <SemDados largura={largura} altura={altura} />

  const MARGEM = MARGEM_LINHA_BARRAS
  const areaLargura = largura - MARGEM.esquerda - MARGEM.direita
  const areaAltura = altura - MARGEM.topo - MARGEM.baixo

  const valorMax = Math.max(...pontos.map(p => p.valor), 0)
  const escalaY = (v: number) => (valorMax === 0 ? 0 : (v / valorMax) * areaAltura)
  const passoX = areaLargura / pontos.length

  return (
    <g>
      <LinhaBase largura={largura} altura={altura} margem={MARGEM} />

      {modo === 'barras' &&
        pontos.map((p, i) => {
          const alturaBarra = escalaY(p.valor)
          const x = MARGEM.esquerda + i * passoX + passoX * 0.15
          const larguraBarra = passoX * 0.7
          const y = MARGEM.topo + (areaAltura - alturaBarra)
          return (
            <g key={p.rotulo + i}>
              <rect x={x} y={y} width={larguraBarra} height={alturaBarra} fill={COR_PRIMARIA} rx={2} />
              <text x={x + larguraBarra / 2} y={y - 4} textAnchor="middle" fontSize="9" fill={COR_TEXTO_EIXO}>
                {formatarMoedaCompacta(p.valor)}
              </text>
            </g>
          )
        })}

      {modo === 'linha' && (
        <polyline
          fill="none"
          stroke={COR_PRIMARIA}
          strokeWidth={2}
          points={pontos
            .map((p, i) => {
              const x = MARGEM.esquerda + i * passoX + passoX / 2
              const y = MARGEM.topo + (areaAltura - escalaY(p.valor))
              return `${x},${y}`
            })
            .join(' ')}
        />
      )}
      {modo === 'linha' &&
        pontos.map((p, i) => {
          const x = MARGEM.esquerda + i * passoX + passoX / 2
          const y = MARGEM.topo + (areaAltura - escalaY(p.valor))
          return (
            <g key={p.rotulo + i}>
              <circle cx={x} cy={y} r={3} fill={COR_PRIMARIA} />
              <text x={x} y={y - 8} textAnchor="middle" fontSize="9" fill={COR_TEXTO_EIXO}>
                {formatarMoedaCompacta(p.valor)}
              </text>
            </g>
          )
        })}

      {pontos.map((p, i) => {
        const x = MARGEM.esquerda + i * passoX + passoX / 2
        return (
          <text
            key={'rotulo-' + p.rotulo + i}
            x={x}
            y={altura - MARGEM.baixo + 16}
            textAnchor="middle"
            fontSize="9"
            fill={COR_TEXTO_EIXO}
          >
            {p.rotulo}
          </text>
        )
      })}
    </g>
  )
}

// ============================================================
// GraficoBarrasAgrupadas
// Exclusivo do Fluxo de Caixa — duas barras lado a lado por
// sub-período (Entradas x Saídas)
// ============================================================
function GraficoBarrasAgrupadas({
  pontos,
  legendaA,
  legendaB,
  largura,
  altura,
  // Default nos próprios parâmetros — se o chamador não passar
  // corA/corB (caso do Fluxo de Caixa, único consumidor existente
  // antes desta mudança), o valor cai exatamente nas constantes que
  // já eram usadas hardcoded aqui, preservando a aparência atual
  corA = COR_PRIMARIA,
  corB = COR_LINHA_ACUMULADA,
}: {
  pontos: { rotulo: string; valorA: number; valorB: number }[]
  legendaA: string
  legendaB: string
  largura: number
  altura: number
  corA?: string
  corB?: string
}) {
  if (pontos.length === 0) return <SemDados largura={largura} altura={altura} />

  const MARGEM = MARGEM_BARRAS_AGRUPADAS
  const areaLargura = largura - MARGEM.esquerda - MARGEM.direita
  const areaAltura = altura - MARGEM.topo - MARGEM.baixo

  const valorMax = Math.max(...pontos.map(p => Math.max(p.valorA, p.valorB)), 0)
  const escalaY = (v: number) => (valorMax === 0 ? 0 : (v / valorMax) * areaAltura)
  const passoX = areaLargura / pontos.length

  return (
    <g>
      <LinhaBase largura={largura} altura={altura} margem={MARGEM} />

      {/* Legenda — usa corA/corB (parâmetro com default), não mais a
          constante fixa direto, pra bater com a cor real das barras */}
      <rect x={MARGEM.esquerda} y={6} width={9} height={9} fill={corA} />
      <text x={MARGEM.esquerda + 13} y={14} fontSize="9" fill={COR_TEXTO_EIXO}>{legendaA}</text>
      <rect x={MARGEM.esquerda + 90} y={6} width={9} height={9} fill={corB} />
      <text x={MARGEM.esquerda + 103} y={14} fontSize="9" fill={COR_TEXTO_EIXO}>{legendaB}</text>

      {pontos.map((p, i) => {
        const grupoX = MARGEM.esquerda + i * passoX
        const larguraBarra = passoX * 0.32
        const alturaA = escalaY(p.valorA)
        const alturaB = escalaY(p.valorB)
        const yA = MARGEM.topo + (areaAltura - alturaA)
        const yB = MARGEM.topo + (areaAltura - alturaB)
        const xA = grupoX + passoX * 0.14
        const xB = xA + larguraBarra + 4

        return (
          <g key={p.rotulo + i}>
            <rect x={xA} y={yA} width={larguraBarra} height={alturaA} fill={corA} rx={2} />
            <rect x={xB} y={yB} width={larguraBarra} height={alturaB} fill={corB} rx={2} />
            {/* Rótulo de valor da barra A — vertical (rotate -90°),
                ancorado 3px à direita do centro da barra e 4px acima
                do topo dela, lendo de baixo pra cima. Decisão
                confirmada com Maycon nesta sessão: a primeira versão
                (rótulo horizontal) foi reprovada por sobreposição em
                31 dias × 2 barras — rotacionar resolve sem precisar
                aumentar MARGEM.topo (testado visualmente, Versão A
                aprovada). Só desenha quando valorA > 0, pra não
                poluir dias sem título nenhum */}
            {p.valorA > 0 && (
              <text
                x={xA + larguraBarra / 2 + 3}
                y={yA - 4}
                textAnchor="start"
                fontSize="9"
                fill={COR_TEXTO_EIXO}
                transform={`rotate(-90, ${xA + larguraBarra / 2 + 3}, ${yA - 4})`}
              >
                {formatarValorBarraAgrupada(p.valorA)}
              </text>
            )}
            {/* Rótulo de valor da barra B — mesmo raciocínio do
                rótulo A acima, só troca xA/yA por xB/yB */}
            {p.valorB > 0 && (
              <text
                x={xB + larguraBarra / 2 + 3}
                y={yB - 4}
                textAnchor="start"
                fontSize="9"
                fill={COR_TEXTO_EIXO}
                transform={`rotate(-90, ${xB + larguraBarra / 2 + 3}, ${yB - 4})`}
              >
                {formatarValorBarraAgrupada(p.valorB)}
              </text>
            )}
            <text x={grupoX + passoX / 2} y={altura - MARGEM.baixo + 16} textAnchor="middle" fontSize="9" fill={COR_TEXTO_EIXO}>
              {p.rotulo}
            </text>
          </g>
        )
      })}
    </g>
  )
}

// ============================================================
// GraficoPareto
// Exclusivo da Curva ABC — barras decrescentes (R$, eixo primário)
// + linha de % acumulado (eixo secundário 0–100%). Layout e cores
// aprovadas nesta sessão (Seção 1.5)
// ============================================================
function GraficoPareto({
  pontos,
  largura,
  altura,
}: {
  pontos: { rotulo: string; valor: number; percentualAcumulado: number }[]
  largura: number
  altura: number
}) {
  if (pontos.length === 0) return <SemDados largura={largura} altura={altura} />

  const MARGEM = MARGEM_PARETO
  const areaLargura = largura - MARGEM.esquerda - MARGEM.direita
  const areaAltura = altura - MARGEM.topo - MARGEM.baixo

  const valorMax = Math.max(...pontos.map(p => p.valor), 0)
  const escalaBarraY = (v: number) => (valorMax === 0 ? 0 : (v / valorMax) * areaAltura)
  const escalaLinhaY = (pct: number) => (pct / 100) * areaAltura
  const passoX = areaLargura / pontos.length

  const pontosLinha = pontos
    .map((p, i) => {
      const x = MARGEM.esquerda + i * passoX + passoX / 2
      const y = MARGEM.topo + (areaAltura - escalaLinhaY(p.percentualAcumulado))
      return `${x},${y}`
    })
    .join(' ')

  return (
    <g>
      <LinhaBase largura={largura} altura={altura} margem={MARGEM} />

      {/* Linha de referência 80% (Classe A) — ajuda leitura visual do corte de Pareto */}
      <line
        x1={MARGEM.esquerda}
        x2={largura - MARGEM.direita}
        y1={MARGEM.topo + (areaAltura - escalaLinhaY(80))}
        y2={MARGEM.topo + (areaAltura - escalaLinhaY(80))}
        stroke={COR_GRADE}
        strokeDasharray="3,3"
      />

      {pontos.map((p, i) => {
        const alturaBarra = escalaBarraY(p.valor)
        const x = MARGEM.esquerda + i * passoX + passoX * 0.15
        const larguraBarra = passoX * 0.7
        const y = MARGEM.topo + (areaAltura - alturaBarra)
        return <rect key={p.rotulo + i} x={x} y={y} width={larguraBarra} height={alturaBarra} fill={COR_BARRA_PARETO} rx={2} />
      })}

      <polyline fill="none" stroke={COR_LINHA_ACUMULADA} strokeWidth={2} points={pontosLinha} />
      {pontos.map((p, i) => {
        const x = MARGEM.esquerda + i * passoX + passoX / 2
        const y = MARGEM.topo + (areaAltura - escalaLinhaY(p.percentualAcumulado))
        return <circle key={'pt-' + p.rotulo + i} cx={x} cy={y} r={2.5} fill={COR_LINHA_ACUMULADA} />
      })}

      {pontos.map((p, i) => {
        const x = MARGEM.esquerda + i * passoX + passoX / 2
        // Só exibe rótulo de nome quando couber sem espremer demais
        // (Curva ABC pode ter dezenas de itens — evita poluição visual)
        if (pontos.length > 15 && i % Math.ceil(pontos.length / 15) !== 0) return null
        return (
          <text key={'rotulo-' + p.rotulo + i} x={x} y={altura - MARGEM.baixo + 16} textAnchor="middle" fontSize="8" fill={COR_TEXTO_EIXO}>
            {p.rotulo.length > 10 ? p.rotulo.slice(0, 9) + '…' : p.rotulo}
          </text>
        )
      })}
    </g>
  )
}

// ============================================================
// GraficoPizza
// Usado em Gastos por tipo de fornecedor (visão do período)
// ============================================================
function GraficoPizza({
  pontos,
  largura,
  altura,
}: {
  pontos: { rotulo: string; valor: number }[]
  largura: number
  altura: number
}) {
  if (pontos.length === 0) return <SemDados largura={largura} altura={altura} />

  const total = pontos.reduce((soma, p) => soma + p.valor, 0)
  const cx = largura * 0.32
  const cy = altura / 2
  const raio = Math.min(cy, largura * 0.28) - 8

  let anguloAcumulado = -90 // começa no topo (12h)

  function coordenadasNoAngulo(angulo: number) {
    const rad = (angulo * Math.PI) / 180
    return [cx + raio * Math.cos(rad), cy + raio * Math.sin(rad)]
  }

  // Correção High §3.2 (Handoff_Modulo_Relatorios_Audit_para_QA.md) —
  // quando só existe 1 categoria com valor > 0 (100% do total), o
  // ângulo final da fatia (-90 + 360 = 270°) cai no MESMO ponto do
  // ângulo inicial (-90°), já que seno/cosseno são periódicos em
  // 360°. O <path> gerado nesse caso é degenerado (início = fim) e
  // não desenha nada — "Gastos por tipo de fornecedor" filtrado a 1
  // mês ou a 1 tipo específico cai nesse caso com frequência. Fix:
  // desenha um círculo cheio, não um path — nada de "quase 360°"
  // por epsilon, que deixaria uma fresta e reintroduziria o mesmo
  // bug em outro ângulo se a precisão de ponto flutuante mudar.
  const categoriasComValor = pontos.filter(p => p.valor > 0)

  return (
    <g>
      {total === 0 ? (
        <SemDados largura={largura} altura={altura} />
      ) : categoriasComValor.length === 1 ? (
        <circle cx={cx} cy={cy} r={raio} fill={PALETA_PIZZA[0]} stroke="#ffffff" strokeWidth={1} />
      ) : (
        pontos.map((p, i) => {
          const fatiaAngulo = total === 0 ? 0 : (p.valor / total) * 360
          const anguloInicial = anguloAcumulado
          const anguloFinal = anguloAcumulado + fatiaAngulo
          anguloAcumulado = anguloFinal

          const [x1, y1] = coordenadasNoAngulo(anguloInicial)
          const [x2, y2] = coordenadasNoAngulo(anguloFinal)
          const arcoGrande = fatiaAngulo > 180 ? 1 : 0
          const caminho = `M ${cx},${cy} L ${x1},${y1} A ${raio},${raio} 0 ${arcoGrande} 1 ${x2},${y2} Z`

          return <path key={p.rotulo + i} d={caminho} fill={PALETA_PIZZA[i % PALETA_PIZZA.length]} stroke="#ffffff" strokeWidth={1} />
        })
      )}

      {/* Legenda à direita — nome + percentual, evita rótulo espremido dentro da fatia */}
      {pontos.map((p, i) => {
        const pct = total === 0 ? 0 : (p.valor / total) * 100
        const yLegenda = 24 + i * 18
        return (
          <g key={'legenda-' + p.rotulo + i}>
            <rect x={largura * 0.62} y={yLegenda - 9} width={9} height={9} fill={PALETA_PIZZA[i % PALETA_PIZZA.length]} />
            <text x={largura * 0.62 + 13} y={yLegenda} fontSize="9" fill={COR_TEXTO_EIXO}>
              {p.rotulo} — {pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
            </text>
          </g>
        )
      })}
    </g>
  )
}

// ============================================================
// LinhaBase
// Eixo horizontal simples, reutilizado por todos os gráficos
// cartesianos (tudo exceto pizza)
// ============================================================
function LinhaBase({
  largura,
  altura,
  margem,
}: {
  largura: number
  altura: number
  margem: { topo: number; direita: number; baixo: number; esquerda: number }
}) {
  return (
    <line
      x1={margem.esquerda}
      x2={largura - margem.direita}
      y1={altura - margem.baixo}
      y2={altura - margem.baixo}
      stroke={COR_GRADE}
      strokeWidth={1}
    />
  )
}

// ============================================================
// SemDados
// Estado vazio — evita gráfico quebrado/em branco sem explicação
// quando o período filtrado não tem nenhum lançamento
// ============================================================
function SemDados({ largura, altura }: { largura: number; altura: number }) {
  return (
    <text x={largura / 2} y={altura / 2} textAnchor="middle" fontSize="11" fill={COR_TEXTO_EIXO}>
      Sem dados no período selecionado
    </text>
  )
}
