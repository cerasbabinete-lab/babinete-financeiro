// ============================================================
// lib/relatorios/graficoLayout.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Fonte ÚNICA das margens de cada tipo de gráfico cartesiano
//         (linha/barras, barras_agrupadas, pareto) — consumida tanto
//         por components/relatorios/GraficoSvg.tsx (tela, SVG) quanto
//         por lib/relatorios/pdfGrafico.ts (PDF, primitivas PDFKit).
//         Arquivo sem NENHUMA dependência de framework (nem React,
//         nem Node) — só constantes puras — para poder ser
//         importado com segurança tanto de um componente 'use
//         client' quanto de um módulo Node-only usado em rota de API,
//         sem puxar código de um lado para o bundle do outro.
// Conecta com: components/relatorios/GraficoSvg.tsx,
//              lib/relatorios/pdfGrafico.ts
// Referência: Handoff_Modulo_Relatorios_Audit_para_QA.md,
//             Finding Medium §5.1 — antes deste arquivo, as margens
//             eram definidas duas vezes, uma em cada tecnologia,
//             mantidas em sincronia manualmente — e já tinham
//             divergido de fato (PDF sem margem esquerda/direita
//             nenhuma nos tipos linha/barras e pareto, valores de
//             topo/baixo diferentes em barras_agrupadas). O objetivo
//             deste arquivo é os dois pararem de ter sua própria
//             cópia — os valores abaixo são os que já estavam
//             corretos e aprovados em GraficoSvg.tsx (fonte visual
//             original aprovada por Maycon na sessão de especificação);
//             pdfGrafico.ts passa a IMPORTAR daqui em vez de manter
//             constantes locais próprias.
// ============================================================

// Formato de margem usado por todo gráfico cartesiano (tudo exceto
// pizza, que usa proporção de largura/altura em vez de margem fixa —
// ver cx/cy/raio em GraficoSvg.tsx e pdfGrafico.ts, já idênticos
// entre os dois, não precisou de extração)
export interface MargemGrafico {
  topo: number
  direita: number
  baixo: number
  esquerda: number
}

// Tipos 'linha' e 'barras' (GraficoLinhaOuBarras / desenharLinhaOuBarras)
export const MARGEM_LINHA_BARRAS: MargemGrafico = { topo: 16, direita: 16, baixo: 34, esquerda: 16 }

// Tipo 'barras_agrupadas' — exclusivo do Fluxo de Caixa. Topo maior
// que os demais (30 em vez de 16) porque reserva espaço pra legenda
// "Entradas / Saídas" desenhada acima da área de plotagem
export const MARGEM_BARRAS_AGRUPADAS: MargemGrafico = { topo: 30, direita: 16, baixo: 34, esquerda: 16 }

// Tipo 'pareto' — exclusivo da Curva ABC. Direita maior que os
// demais (36 em vez de 16) para reservar espaço do eixo secundário
// de percentual acumulado
export const MARGEM_PARETO: MargemGrafico = { topo: 16, direita: 36, baixo: 34, esquerda: 16 }
