// ============================================================
// types/relatorios.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Tipagem TypeScript completa dos 6 relatórios da v1
//         (Faturamento, Fluxo de Caixa, Retiradas, Extrato
//         Consolidado, Curva ABC, Gastos por Tipo de Fornecedor),
//         mais os tipos compartilhados de filtro, gráfico e
//         exportação. Módulo é 100% somente-leitura — não define
//         nenhuma tabela própria, só consome dados de outros
//         módulos (receitas, despesas, contas_a_pagar, contas_receber).
// Conecta com: lib/relatorios/*.ts (um arquivo de serviço por
//              relatório), pages/api/relatorios/*.ts,
//              components/relatorios/*.tsx, app/relatorios/**/page.tsx
// Referência: Especificacao_Modulo_Relatorios.md — Seção 2
//             (um relatório por bloco abaixo), Seção 1.1
//             (disclaimer), Seção 1.5 (gráfico obrigatório)
// ============================================================

// ============================================================
// DISCLAIMER_RELATORIOS — REMOVIDO a pedido do Maycon (sessão de
// revisão pós-entrega do relatório 2.7). Texto fixo que existia por
// força da Seção 1.1 da spec ("disclaimer obrigatório", idêntico em
// tela e nas duas exportações) foi removido de types/relatorios.ts,
// lib/relatorios/pdfBuilder.ts (rodapé de PDF),
// lib/relatorios/excelBuilder.ts (última linha do Excel) e
// components/relatorios/DisclaimerRodape.tsx (tela) — os 3 únicos
// consumidores (confirmado por grep no módulo inteiro antes da
// remoção). Afeta os 7 relatórios do módulo, não só o 2.7, por ser
// infraestrutura compartilhada. O componente DisclaimerRodape.tsx
// foi mantido como no-op (não removido dos 7 componentes de tela que
// o importam) para minimizar o raio de alteração — se o disclaimer
// precisar voltar no futuro, é reativar num único lugar.
// ============================================================

// ============================================================
// FormatoExportacao
// Usado pelo query param `?formato=` de cada rota de API do
// módulo — decide se o handler devolve JSON (tela), PDF (stream
// application/pdf) ou Excel (stream .xlsx)
// ============================================================
export type FormatoExportacao = 'json' | 'pdf' | 'xlsx'

// ============================================================
// FiltroIntervaloDatas
// Filtro base de todos os 6 relatórios — cada um decide sobre
// qual coluna de data o intervalo é aplicado (ver Seção 2.X de
// cada relatório na spec)
// ============================================================
export interface FiltroIntervaloDatas {
  dataInicial: string // 'YYYY-MM-DD'
  dataFinal: string    // 'YYYY-MM-DD'
}

// ============================================================
// RelatorioSlug
// Identificador estável de cada um dos 6 relatórios — usado como
// nome de rota (app/relatorios/[slug]/page.tsx), chave de card na
// grade inicial (Seção 5) e valor do parâmetro de API
// ============================================================
export type RelatorioSlug =
  | 'faturamento'
  | 'fluxo-caixa'
  | 'retiradas'
  | 'extrato-consolidado'
  | 'curva-abc'
  | 'gastos-por-tipo-fornecedor'
  | 'receita-despesa'

// ============================================================
// RelatorioCardInfo
// Metadado estático de cada card da grade inicial do módulo
// (Seção 5 — "tela inicial: grade de 6 cards, ícone, título,
// descrição curta, botão Gerar relatório"). IMPORTANTE (Seção 1.4):
// a descricaoCurta do card de Retiradas NÃO pode citar nomes de
// sócios/beneficiários — é texto estático visível a qualquer
// usuário autenticado antes mesmo de gerar o relatório
// ============================================================
export interface RelatorioCardInfo {
  slug: RelatorioSlug
  titulo: string
  descricaoCurta: string
  icone: string // nome do ícone Tabler, sem prefixo "ti ti-"
}

// ============================================================
// ────────────────────────────────────────────────────────────
// GRÁFICOS (Seção 1.5) — tipos compartilhados por GraficoSvg.tsx
// (tela) e lib/relatorios/pdfGrafico.ts (PDF), para os dois
// desenharem exatamente o mesmo dado, só que em tecnologias
// diferentes (SVG vs. primitivas PDFKit)
// ────────────────────────────────────────────────────────────
// ============================================================

// Tipo de gráfico por relatório — tabela da Seção 1.5, não opcional
export type TipoGrafico = 'linha' | 'barras' | 'barras_agrupadas' | 'pareto' | 'pizza'

// Ponto simples — usado por 'linha', 'barras' e como fatia de 'pizza'
export interface PontoGraficoSimples {
  rotulo: string
  valor: number
}

// Ponto de barras agrupadas — usado só no Fluxo de Caixa (Entradas x Saídas)
export interface PontoGraficoAgrupado {
  rotulo: string   // sub-período (ex: dia ou mês, conforme granularidade do intervalo)
  valorA: number   // Entradas
  valorB: number   // Saídas
}

// Ponto de gráfico de Pareto — usado só na Curva ABC (Seção 1.5,
// "modelo padrão de mercado para este relatório, não opcional").
// Cores fixas aprovadas: barras #378ADD, linha de % acumulado #993c1d
export interface PontoGraficoPareto {
  rotulo: string
  valor: number               // eixo primário (R$) — barra
  percentualAcumulado: number // eixo secundário (%) — linha, 0–100
}

// Union de dado de gráfico — o componente/desenhista decide como
// interpretar com base em `tipo`
export type DadosGrafico =
  | { tipo: 'linha' | 'barras'; pontos: PontoGraficoSimples[] }
  | { tipo: 'barras_agrupadas'; pontos: PontoGraficoAgrupado[]; legendaA: string; legendaB: string }
  | { tipo: 'pareto'; pontos: PontoGraficoPareto[] }
  | { tipo: 'pizza'; pontos: PontoGraficoSimples[] }

// ============================================================
// ────────────────────────────────────────────────────────────
// 2.1 — FATURAMENTO POR PERÍODO
// ────────────────────────────────────────────────────────────
// ============================================================

export interface FaturamentoMes {
  mes: string // 'YYYY-MM'
  receitaBruta: number
  quantidadeNotas: number
  ticketMedio: number
  clientesNovos: number
  clientesRecorrentes: number
}

export interface RelatorioFaturamento {
  periodo: FiltroIntervaloDatas
  meses: FaturamentoMes[]
  totalizador: {
    receitaBruta: number
    ticketMedio: number
    clientesNovosTotal: number
    clientesRecorrentesTotal: number
  }
  grafico: DadosGrafico // tipo: 'linha' — evolução mensal da receita bruta
}

// ============================================================
// ────────────────────────────────────────────────────────────
// 2.2 — FLUXO DE CAIXA REALIZADO
// ────────────────────────────────────────────────────────────
// ============================================================

export interface LancamentoFluxoCaixa {
  data: string        // data_baixa
  descricao: string   // favorecido (saída) ou cliente (entrada)
  entrada: number      // 0 quando o lançamento é uma saída
  saida: number        // 0 quando o lançamento é uma entrada
}

export interface RelatorioFluxoCaixa {
  periodo: FiltroIntervaloDatas
  entradas: number
  saidas: number
  saldoPeriodo: number
  lancamentos: LancamentoFluxoCaixa[]
  grafico: DadosGrafico // tipo: 'barras_agrupadas' — Entradas x Saídas por sub-período
}

// ============================================================
// ────────────────────────────────────────────────────────────
// 2.3 — RETIRADAS E BENEFÍCIOS POR BENEFICIÁRIO
// ────────────────────────────────────────────────────────────
// ============================================================

// Espelha ExtensaoContabilidade.subtipo (types/despesas.ts) — só os
// 3 valores relevantes para retiradas/benefícios pessoais
export type SubtipoRetirada = 'retirada_socio' | 'folha_pro_labore' | 'bonus_anual'

// Rótulo amigável de exibição — Seção 2.3 pede "nome de exibição
// amigável a definir"
export const SUBTIPO_RETIRADA_LABELS: Record<SubtipoRetirada, string> = {
  retirada_socio: 'Retirada de sócio',
  folha_pro_labore: 'Pró-labore',
  bonus_anual: 'Bônus anual',
}

export interface LancamentoRetirada {
  data: string // documento_data_emissao, com fallback created_at
  beneficiarioNome: string
  subtipo: SubtipoRetirada
  valor: number
  statusPagamento: string // 'em_aberto' | 'pago' | 'cancelado' (espelha despesas.status_pagamento)
}

export interface GrupoBeneficiarioRetiradas {
  beneficiarioNome: string
  lancamentos: LancamentoRetirada[]
  subtotal: number
}

export interface RelatorioRetiradas {
  periodo: FiltroIntervaloDatas
  beneficiarioFiltro?: string // filtro opcional (Seção 2.3)
  grupos: GrupoBeneficiarioRetiradas[]
  totalGeral: number
  grafico: DadosGrafico // tipo: 'barras' — total por beneficiário
}

// ============================================================
// ────────────────────────────────────────────────────────────
// 2.4 — EXTRATO CONSOLIDADO (CONFIGURÁVEL)
// ────────────────────────────────────────────────────────────
// ============================================================

export type LadoExtrato = 'a_pagar' | 'a_receber'
export type StatusFiltroExtrato = 'pago' | 'em_aberto' | 'tudo'
export type NivelDetalheExtrato = 'resumido' | 'detalhado'

// Faixas de aging — padrão de mercado (Seção 2.4), relativas a
// CURRENT_DATE no momento da geração, nunca armazenadas
export type FaixaAging = 'a_vencer' | '1_30' | '31_60' | '61_90' | '90_mais'

export const FAIXA_AGING_LABELS: Record<FaixaAging, string> = {
  a_vencer: 'A vencer',
  '1_30': '1–30 dias',
  '31_60': '31–60 dias',
  '61_90': '61–90 dias',
  '90_mais': '90+ dias',
}

export interface FiltrosExtratoConsolidado extends FiltroIntervaloDatas {
  lado: LadoExtrato | 'ambos'
  status: StatusFiltroExtrato
  nivelDetalhe: NivelDetalheExtrato
}

export interface ItemExtratoConsolidado {
  dataVencimento: string
  favorecidoOuCliente: string
  valor: number
  lado: LadoExtrato
  status: string
  faixa?: FaixaAging // presente só quando o item está em_aberto
}

export interface TotalPorFaixaAging {
  faixa: FaixaAging
  total: number
  quantidade: number
}

export interface RelatorioExtratoConsolidado {
  filtros: FiltrosExtratoConsolidado
  totaisPorFaixa: TotalPorFaixaAging[] // só populado quando status inclui "em aberto"
  itens: ItemExtratoConsolidado[] | null // null quando nivelDetalhe = 'resumido'
  grafico: DadosGrafico // tipo: 'barras' — total por faixa de aging
}

// ============================================================
// ────────────────────────────────────────────────────────────
// 2.5 — CURVA ABC
// ────────────────────────────────────────────────────────────
// ============================================================

export type DimensaoAbc = 'clientes' | 'fornecedores' | 'produtos'
export type ClasseAbc = 'A' | 'B' | 'C'

export interface ItemCurvaAbc {
  nome: string
  valor: number
  percentualIndividual: number
  percentualAcumulado: number
  classe: ClasseAbc
  // Exclusivo da dimensão 'fornecedores' — média de (data_baixa -
  // data_vencimento) em dias, só títulos pagos. Negativo = pago
  // antecipado, em média
  prazoMedioPagamentoDias?: number
}

// Drill-down exclusivo da dimensão 'produtos' (Seção 2.5) — evolução
// mensal de quantidade/valor de um item específico do ranking
export interface PontoEvolucaoProduto {
  mes: string // 'YYYY-MM'
  quantidade: number
  valor: number
}

export interface RelatorioCurvaAbc {
  dimensao: DimensaoAbc
  periodo: FiltroIntervaloDatas
  itens: ItemCurvaAbc[]
  totalPeriodo: number
  grafico: DadosGrafico // tipo: 'pareto' — obrigatório, não opcional (Seção 1.5)
}

// Resposta do drill-down de um produto específico — endpoint/consulta
// separada dentro do mesmo relatório, não é um relatório à parte
export interface DrillDownProdutoAbc {
  nomeProduto: string
  evolucao: PontoEvolucaoProduto[]
}

// ============================================================
// ────────────────────────────────────────────────────────────
// 2.6 — GASTOS POR TIPO DE FORNECEDOR
// ────────────────────────────────────────────────────────────
// ============================================================

// Antes reexportava o enum fechado TipoFornecedor de types/fornecedores.ts
// — removido nesta revisão (Especificacao_Fornecedores_Pix_Categorias_
// WhatsApp.md, Seção 4.7): tipo_fornecedor virou tabela dinâmica
// (fornecedor_categorias), então o agrupamento passa a ser pela FK
// numérica (tipo_fornecedor_id) em vez de um union de strings fechado.
// 'nao_classificado' continua sendo o grupo virtual sempre visível
// (Seção 2.6: "nunca ser omitidos silenciosamente")
export type TipoFornecedorOuNaoClassificado = number | 'nao_classificado'

export interface GastoPorTipoFornecedor {
  tipo: TipoFornecedorOuNaoClassificado
  rotulo: string  // Nome da categoria resolvido NO MOMENTO da geração do relatório
                   // (lookup ao vivo contra fornecedor_categorias) — nunca armazenado
                   // nem cacheado, conforme exigido pela Seção 4.7 ("must always
                   // reflect the current category name at generation time")
  total: number
}

export interface GastoPorTipoFornecedorMes extends GastoPorTipoFornecedor {
  mes: string // 'YYYY-MM'
}

export interface RelatorioGastosPorTipoFornecedor {
  periodo: FiltroIntervaloDatas
  tipoFiltro?: TipoFornecedorOuNaoClassificado // filtro opcional (Seção 2.6)
  porTipo: GastoPorTipoFornecedor[]     // visão do período — usada no gráfico de pizza/rosca
  porTipoPorMes: GastoPorTipoFornecedorMes[] // visão mensal — usada no gráfico de barras
  totalGeral: number
  grafico: DadosGrafico // tipo: 'pizza' (visão período) ou 'barras' (visão mensal) — Seção 1.5
}

// ============================================================
// ────────────────────────────────────────────────────────────
// 2.7 — RECEITA X DESPESA (BRUTA E LÍQUIDA) POR PERÍODO
// ────────────────────────────────────────────────────────────
// ============================================================

// AVISO_RECEITA_DESPESA — aviso obrigatório ESPECÍFICO deste
// relatório (Seção 2.7), exibido em destaque próximo às colunas
// "Resultado", não no rodapé. Existe especificamente para impedir
// que "Resultado Líquido" seja lido como lucro contábil de verdade.
// Continua em uso mesmo após a remoção do disclaimer padrão
// (DISCLAIMER_RELATORIOS, removido a pedido do Maycon — ver nota
// acima) — são textos diferentes, com propósitos diferentes; a
// remoção pedida foi só do disclaimer genérico do rodapé. Fonte
// única de verdade — tela (AvisoDestaque em RelatorioUiComum.tsx),
// PDF (desenharAvisoDestacado em pdfBuilder.ts) e Excel (parâmetro
// avisoExtra de gerarBufferExcel em excelBuilder.ts) importam esta
// constante, nunca reescrevem o texto localmente.
export const AVISO_RECEITA_DESPESA =
  'Resultado aqui é a diferença aritmética entre receita e despesa lançadas no período. ' +
  'Não é apuração de lucro líquido contábil, não desconta tributos e não segue regime de competência formal.'

export interface ReceitaDespesaMes {
  mes: string // 'YYYY-MM'
  receitaBruta: number
  receitaLiquida: number
  despesaBruta: number
  despesaLiquida: number
  resultadoBruto: number
  resultadoLiquido: number
}

export interface RelatorioReceitaDespesa {
  periodo: FiltroIntervaloDatas
  meses: ReceitaDespesaMes[]
  totalizador: {
    receitaBruta: number
    receitaLiquida: number
    despesaBruta: number
    despesaLiquida: number
    resultadoBruto: number
    resultadoLiquido: number
  }
  grafico: DadosGrafico // tipo: 'barras_agrupadas' — Receita x Despesa por mês
}
