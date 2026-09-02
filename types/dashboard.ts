// ============================================================
// types/dashboard.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Dashboard (NOVO — Especificacao_Modulo_Dashboard.md)
// Camada: types (tipagem pura — sem lógica, sem I/O)
// Função: Tipagem TypeScript das respostas dos 3 endpoints novos do
//         módulo (resumo, titulos, rankings) e dos dados que os
//         componentes de tela consomem. Módulo é 100% somente-leitura
//         (Seção 0, regra 1 da spec) — não define nenhuma tabela
//         própria, só compõe/agrega dados que já existem em outros
//         módulos.
// Conecta com: pages/api/dashboard/resumo.ts, titulos.ts, rankings.ts
//              (produzem estes tipos), app/dashboard/page.tsx e todos
//              os components/dashboard/*.tsx (consomem estes tipos),
//              types/relatorios.ts (FiltroIntervaloDatas, DadosGrafico
//              — reaproveitados, não duplicados), types/contasAPagar.ts
//              (ContaAPagar), types/contasReceber.ts (ContaReceber),
//              types/fornecedores.ts (TipoChavePix)
// Referência: Especificacao_Modulo_Dashboard.md, Seção 10 ("Files —
//             New and Edited" lista types/dashboard.ts como novo)
// ============================================================

// Reaproveita o filtro de intervalo de datas já usado em todo o
// módulo Relatórios (Seção 9 da spec: nada de reimplementar um tipo
// que já existe) — usado pelos filtros de período dos 2 rankings
// (Seções 7 e 8) e, internamente, pela agregação diária do resumo
import type { FiltroIntervaloDatas, DadosGrafico } from '@/types/relatorios'

// Reaproveita o tipo de título já usado pelo módulo Contas a Pagar —
// a Lista de Títulos a Pagar do Dashboard (Seção 5) é composta a
// partir do MESMO objeto ContaAPagar retornado por
// lib/contasAPagarService.ts::buscarTitulos(), sem transformação de
// schema, só um campo extra anexado (ver TituloPagarComAcao abaixo)
import type { ContaAPagar } from '@/types/contasAPagar'

// Reaproveita o tipo de título já usado pelo módulo Contas a Receber
// — a Lista de Títulos a Receber do Dashboard (Seção 6) é puramente
// informativa, então usa ContaReceber sem nenhum campo extra
import type { ContaReceber } from '@/types/contasReceber'

// Reaproveita o tipo de chave Pix do módulo Fornecedores — usado só
// pelo campo tipoChave dentro de ChavePixResumo (ver abaixo), no
// contexto da hierarquia de ação da Lista a Pagar (Seção 5.3, item 2)
import type { TipoChavePix } from '@/types/fornecedores'

// ============================================================
// ────────────────────────────────────────────────────────────
// SEÇÃO 1 — CARD VERDE (RECEITAS) e CARD VERMELHO (DESPESAS)
// Especificacao_Modulo_Dashboard.md, Seções 2 e 3
// ────────────────────────────────────────────────────────────
// ============================================================

// Dados das 3 linhas do Card Verde — Seção 2 da spec. Nomes de campo
// seguem a ordem das linhas da tabela da spec (linha 1 = maior fonte)
export interface DashboardCardReceitas {
  // Linha 1 (fonte maior) — valor a receber no mês corrente, títulos
  // de Contas a Receber com vencimento no mês, status ainda não
  // liquidado. Bruto — SEM dedução de frete (regra travada, Seção 2)
  valorAReceberMes: number
  // Linha 2 — valor já recebido até hoje, dentro do mês corrente.
  // Bruto — SEM dedução de frete (mesma regra travada da linha 1)
  valorRecebidoAteHoje: number
  // Linha 3 — faturamento total do mês, LÍQUIDO de frete (única
  // linha do card que sofre a dedução, Seção 2: "frete deduction
  // applies ONLY to line 3"). Igual à Receita Bruta do relatório
  // Faturamento por período (lib/relatorios/faturamento.ts),
  // subtraindo SUM(receitas.valor_frete) do mesmo período
  faturamentoLiquidoFrete: number
}

// Dados das 3 linhas do Card Vermelho — Seção 3 da spec
export interface DashboardCardDespesas {
  // Linha 1 (fonte maior) — total de despesas/títulos de Contas a
  // Pagar lançados no mês corrente (soma de todos os títulos
  // em_aberto + pago_parcial + pago com vencimento no mês — decisão
  // confirmada com Maycon: "em aberto" para este card inclui
  // pago_parcial; "lançado no mês" em si não filtra por status,
  // conta todo título do mês independente de já ter sido pago)
  totalLancadoMes: number
  // Linha 2 — total já pago até hoje, dentro do mês corrente (soma
  // dos valores efetivamente baixados, não do valor de face do
  // título)
  totalPagoAteHoje: number
  // Linha 3 (informativa, NUNCA somada nas linhas 1/2 nem em nenhum
  // outro total do card — regra travada, Seção 3) — SUM(valor_frete)
  // das notas de Receitas emitidas no mês corrente. Mesmo número da
  // dedução usada em DashboardCardReceitas.faturamentoLiquidoFrete,
  // exibido aqui só para visibilidade, sem duplicar o total de
  // despesa (o boleto real da transportadora já entra como despesa
  // normal quando chega, por outro caminho)
  valorFretesMes: number
}

// ============================================================
// ────────────────────────────────────────────────────────────
// SEÇÃO 2 — GRÁFICO DE BARRAS AGRUPADAS (FLUXO DO MÊS)
// Especificacao_Modulo_Dashboard.md, Seção 4
// ────────────────────────────────────────────────────────────
// ============================================================
// Não define um tipo de ponto novo — reaproveita DadosGrafico (união
// discriminada por 'tipo') de types/relatorios.ts, especificamente a
// variante 'barras_agrupadas' (PontoGraficoAgrupado: rotulo, valorA,
// valorB), que já foi projetada para granularidade diária (Seção 4:
// "já foi desenhado para suportar granularidade de dia, não só mês").
// O componente GraficoFluxoDiario.tsx (Seção 10) recebe esse mesmo
// tipo e repassa para GraficoSvg.tsx sem transformação, só define
// corA/corB (verde/vermelho) e legendaA/legendaB ("A Receber"/"A Pagar")
export type { DadosGrafico }

// ============================================================
// ────────────────────────────────────────────────────────────
// SEÇÃO 3 — RESPOSTA COMPLETA DE pages/api/dashboard/resumo.ts
// Um único endpoint que devolve os dois cards + o gráfico diário,
// numa chamada só (Seção 10: "cards + daily chart data, one call")
// ────────────────────────────────────────────────────────────
// ============================================================
export interface DashboardResumoResponse {
  cardReceitas: DashboardCardReceitas
  cardDespesas: DashboardCardDespesas
  // tipo sempre 'barras_agrupadas' nesta resposta — a união mais
  // ampla de DadosGrafico é reaproveitada por conveniência de tipo
  // compartilhado com Relatórios, mas o endpoint sempre monta esta
  // variante específica
  graficoFluxoDiario: DadosGrafico
}

// ============================================================
// ────────────────────────────────────────────────────────────
// SEÇÃO 4 — LISTAS DE TÍTULOS (pages/api/dashboard/titulos.ts)
// Especificacao_Modulo_Dashboard.md, Seções 5 e 6
// ────────────────────────────────────────────────────────────
// ============================================================

// Resumo mínimo de uma chave Pix preferencial, anexado a um título a
// pagar pelo endpoint (Seção 5.3, item 2) — não é o ChavePix inteiro
// de types/fornecedores.ts (que tem id, fornecedor_id, timestamps
// etc.), só os 2 campos que a linha da lista realmente exibe: tipo
// (rótulo do tipo de chave) e o valor a copiar
export interface ChavePixResumo {
  tipoChave: TipoChavePix
  valorChave: string
}

// Título a pagar já enriquecido com o dado de ação da linha (Seção
// 5.3) — estende ContaAPagar (mesmo objeto de
// lib/contasAPagarService.ts::buscarTitulos(), sem alteração de
// schema) só acrescentando o campo abaixo, resolvido no endpoint
// (pages/api/dashboard/titulos.ts) cruzando com
// lib/fornecedoresService.ts::listarChavesPixPreferenciais().
// A hierarquia de ação em si (2ª via > Pix > nada) é decidida no
// componente de tela (ListaTitulosPagar.tsx) a partir dos campos já
// presentes em ContaAPagar (linha_digitavel, nosso_numero) + este
// campo novo — o componente não recalcula nada que o endpoint já
// resolveu, só decide QUAL botão mostrar
export interface TituloPagarComAcao extends ContaAPagar {
  // null quando o fornecedor deste título não tem nenhuma chave
  // marcada como preferencial (ou o título não tem fornecedor_id
  // vinculado) — nesse caso a linha 3 da hierarquia (Seção 5.3) se
  // aplica: sem ação, puramente informativa
  chavePixPreferencial: ChavePixResumo | null
}

// Resposta completa do endpoint de listas — Seção 10: "both a-pagar
// and a-receber lists, date-range params, one call"
export interface DashboardTitulosResponse {
  // Lista de títulos a pagar (Seção 5) — já com o campo de ação
  // resolvido, filtro padrão hoje+atrasados aplicado no servidor,
  // mas ajustável via query params (ver DashboardFiltroTitulos abaixo)
  titulosPagar: TituloPagarComAcao[]
  // Lista de títulos a receber (Seção 6) — ContaReceber puro, sem
  // enriquecimento nenhum, porque esta lista não tem ação de linha
  titulosReceber: ContaReceber[]
}

// Parâmetros de query aceitos pelo endpoint — mapeiam direto para
// vencimentoDe/vencimentoAte de FiltrosContasAPagar/
// FiltrosContasReceber (Seção 5.1: "construct the right
// FiltrosContasAPagar object and call the existing function", não
// um filtro novo). Ambos opcionais — quando ausentes, o endpoint usa
// o padrão "hoje + atrasados" descrito na Seção 5.2
export interface DashboardFiltroTitulos {
  vencimentoDe?: string // 'YYYY-MM-DD' — vazio/ausente = sem piso (traz atrasados de qualquer época)
  vencimentoAte?: string // 'YYYY-MM-DD' — vazio/ausente = hoje (padrão da Seção 5.2)
}

// ============================================================
// ────────────────────────────────────────────────────────────
// SEÇÃO 5 — RANKINGS (pages/api/dashboard/rankings.ts)
// Especificacao_Modulo_Dashboard.md, Seções 7 e 8
// ────────────────────────────────────────────────────────────
// ============================================================

// Item do Ranking Top 10 — Clientes que Mais Compraram (Seção 7).
// Reaproveita a MESMA forma de item que lib/relatorios/curvaAbc.ts
// já produz para a dimensão 'clientes' (nome, valor) — o endpoint
// chama gerarRelatorioCurvaAbc('clientes', filtros) e só recorta os
// 10 primeiros, sem reimplementar a agregação (Seção 7: "Reuse this
// function directly")
export interface DashboardRankingClienteTop {
  nome: string
  valor: number
}

// Item do Ranking Top 10 — Clientes Sem Comprar Há Mais Tempo (Seção
// 8) — agregação NOVA (não existe função pronta pra reaproveitar,
// Seção 8: "This is new aggregation logic"). Formato de exibição do
// tempo confirmado com Maycon: dias corridos, não data da última
// compra
export interface DashboardRankingClienteInativo {
  nome: string
  // Dias corridos entre a última compra do cliente (MAX(data_emissao)
  // em receitas, olhando todo o histórico) e hoje — calculado no
  // endpoint, não no componente de tela, pra manter o componente
  // livre de lógica de data/fuso
  diasSemComprar: number
}

// Resposta completa do endpoint de rankings — Seção 10: "both
// ranking lists, period params, one call"
export interface DashboardRankingsResponse {
  // Top 10 por valor, período ajustável, padrão = mês corrente (Seção 7)
  topClientes: DashboardRankingClienteTop[]
  // Top 10 por tempo sem comprar, período ajustável (janela de busca
  // do "última compra", não um filtro de exclusão), padrão = últimos
  // 6 meses (Seção 8)
  clientesInativos: DashboardRankingClienteInativo[]
}

// Parâmetros de query aceitos pelo endpoint de rankings — reaproveita
// FiltroIntervaloDatas (types/relatorios.ts) em vez de definir um
// tipo de filtro de período próprio, já que a forma é idêntica
// (dataInicial/dataFinal). Um único filtro serve pro Top Clientes;
// o filtro do Ranking de Inativos (Seção 8, "search window") usa o
// mesmo shape mas com semântica de "janela de busca do último
// vencimento", não de "intervalo de emissão" — documentado aqui pra
// não confundir os dois usos do mesmo tipo
export interface DashboardFiltroRankings {
  // Intervalo aplicado ao Top 10 Clientes (Seção 7) — filtra
  // receitas.data_emissao, mesmo campo usado por curvaAbc.ts
  periodoTopClientes: FiltroIntervaloDatas
  // Janela de busca do Ranking de Inativos (Seção 8) — dataInicial
  // é o limite mais antigo aceito pra MAX(data_emissao); dataFinal
  // normalmente é hoje, mas fica explícito pro endpoint não assumir
  periodoInativos: FiltroIntervaloDatas
}
