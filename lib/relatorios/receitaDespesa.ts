// ============================================================
// lib/relatorios/receitaDespesa.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Calcula o relatório "Receita x Despesa (Bruta e Líquida)
//         por período" (2.7) — evolução mensal de receita/despesa
//         bruta e líquida, e resultado bruto/líquido (diferença
//         aritmética simples, NÃO apuração contábil de lucro — ver
//         AVISO_RECEITA_DESPESA em types/relatorios.ts, exibido em
//         destaque na tela/PDF/Excel, não só no rodapé padrão).
// Conecta com: types/relatorios.ts (RelatorioReceitaDespesa,
//              ReceitaDespesaMes), pages/api/relatorios/receita-despesa.ts,
//              lib/relatorios/paginacao.ts (paginarConsulta),
//              lib/relatorios/formatadores.ts (limiteSuperiorIntervalo)
// Referência: Especificacao_Modulo_Relatorios.md, Seção 2.7
//
// ── Base de data — confirmado no schema real desta sessão ──────────
//   - receitas.data_emissao é TIMESTAMPTZ NOT NULL (sql/receitas_
//     contas_receber.sql) — sem fallback, consulta única. Esta
//     consulta replica DE PROPÓSITO a mesma forma de
//     lib/relatorios/faturamento.ts (2.1): mesma tabela, mesmo filtro
//     de data, sem filtro de status_nf (Finding Medium §6 do audit
//     aponta que nenhum relatório atual filtra NF-e cancelada — isso
//     não foi corrigido aqui de propósito, para "Receita Bruta" deste
//     relatório continuar batendo com "Receita bruta" do Faturamento
//     no mesmo mês, já que os dois usam a mesma fonte e o mesmo
//     regime de competência aproximada. Se o Finding §6 for corrigido
//     no futuro, deve ser corrigido nos dois arquivos juntos, não só
//     aqui — senão os dois relatórios passam a divergir sem motivo
//     documentado).
//   - despesas.documento_data_emissao é DATE nullable (sql/despesas_
//     contas_pagar.sql) — fallback created_at, duas consultas
//     filtradas no BANCO (não em JS), mesmo padrão já corrigido em
//     lib/relatorios/gastosPorTipoFornecedor.ts (Finding Medium §4.4).
//
// ── Decisão de escopo — retiradas pessoais de sócio/MEI ─────────────
//   despesas.origem_tipo = 'pessoal_socio' é EXCLUÍDO de Despesa
//   Bruta/Líquida aqui, mesma decisão já confirmada por Maycon para
//   lib/relatorios/gastosPorTipoFornecedor.ts (Finding Medium §4.5) —
//   retiradas já têm relatório próprio (Seção 2.3) e misturá-las
//   aqui distorceria "Resultado" com saída de caixa para sócio, não
//   gasto operacional real.
//   ATENÇÃO: esta decisão específica para O RELATÓRIO 2.7 não foi
//   confirmada verbalmente por Maycon — foi assumida por consistência
//   direta com a decisão já tomada para 2.6, dentro da autorização
//   "siga o desenvolvimento até a revisão final". Sinalizado
//   explicitamente no resumo de entrega para confirmação na revisão.
// ============================================================

import { supabase } from '@/lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ReceitaDespesaMes, RelatorioReceitaDespesa, FiltroIntervaloDatas } from '@/types/relatorios'
import { paginarConsulta } from '@/lib/relatorios/paginacao'
import { limiteSuperiorIntervalo, formatarMesBR } from '@/lib/relatorios/formatadores'

// Linha mínima de receitas — só o necessário pra agregação mensal de
// Receita Bruta (valor_nf) e Receita Líquida (valor_nf - valor_desconto)
interface LinhaReceita {
  data_emissao: string
  valor_nf: number
  valor_desconto: number
}

// Linha mínima de despesas — usada nas duas consultas (com/sem
// documento_data_emissao), mesmo formato de campos de data já usado
// em lib/relatorios/gastosPorTipoFornecedor.ts, mais valor_original
// (Despesa Bruta) e valor_total (Despesa Líquida, já reflete desconto
// e juros/multa aplicados ao documento — Seção 2.7 da spec)
interface LinhaDespesa {
  valor_original: number
  valor_total: number
  documento_data_emissao: string | null
  created_at: string
}

function mesDaData(dataIso: string): string {
  return dataIso.slice(0, 7) // 'YYYY-MM-DDTHH...' ou 'YYYY-MM-DD' -> 'YYYY-MM'
}

// ============================================================
// gerarRelatorioReceitaDespesa()
// client tem default = supabase (browser) — mesmo padrão de todos os
// outros lib/relatorios/*.ts, permite uso direto da tela (RLS) e uso
// explícito com client admin na rota de API (service-role, export)
// ============================================================
export async function gerarRelatorioReceitaDespesa(
  filtros: FiltroIntervaloDatas,
  client: SupabaseClient = supabase,
): Promise<RelatorioReceitaDespesa> {
  // ── 1. Receitas do período — consulta única, mesma forma de
  // lib/relatorios/faturamento.ts (ver nota de consistência no
  // cabeçalho do arquivo). Paginada (Finding Critical §2.2) e com
  // limite superior de fuso explícito (Finding §6.4) ───────────────
  const receitas = await paginarConsulta<LinhaReceita>((inicio, fim) =>
    client
      .from('receitas')
      .select('data_emissao, valor_nf, valor_desconto')
      .gte('data_emissao', filtros.dataInicial)
      .lte('data_emissao', limiteSuperiorIntervalo(filtros.dataFinal))
      .range(inicio, fim),
  )

  // ── 2. Despesas EMPRESARIAIS do período (origem_tipo excluído —
  // ver decisão no cabeçalho do arquivo), não soft-deleted, duas
  // consultas complementares filtradas no BANCO — mesmo padrão de
  // lib/relatorios/gastosPorTipoFornecedor.ts (Finding Medium §4.4) ─
  //
  // (A) documento_data_emissao dentro do intervalo — cobre o caso
  // normal, onde a coluna está preenchida
  const comDataEmissao = await paginarConsulta<LinhaDespesa>((inicio, fim) =>
    client
      .from('despesas')
      .select('valor_original, valor_total, documento_data_emissao, created_at')
      .is('deleted_at', null)
      .neq('origem_tipo', 'pessoal_socio')
      .gte('documento_data_emissao', filtros.dataInicial)
      .lte('documento_data_emissao', filtros.dataFinal)
      .range(inicio, fim),
  )

  // (B) documento_data_emissao NULL, fallback por created_at —
  // também filtrado no banco, não em JS sobre a tabela inteira
  const semDataEmissao = await paginarConsulta<LinhaDespesa>((inicio, fim) =>
    client
      .from('despesas')
      .select('valor_original, valor_total, documento_data_emissao, created_at')
      .is('deleted_at', null)
      .neq('origem_tipo', 'pessoal_socio')
      .is('documento_data_emissao', null)
      .gte('created_at', filtros.dataInicial)
      .lte('created_at', limiteSuperiorIntervalo(filtros.dataFinal))
      .range(inicio, fim),
  )

  // As duas consultas são mutuamente exclusivas por construção (uma
  // exige documento_data_emissao preenchido, a outra exige NULL) —
  // concatenar não duplica nenhuma linha
  const despesas = [...comDataEmissao, ...semDataEmissao]

  // ── 3. Agregação mensal — um grupo por mês, alimentado pelas duas
  // fontes (receitas e despesas) independentemente ─────────────────
  const mesesMap = new Map<string, {
    receitaBruta: number
    receitaLiquida: number
    despesaBruta: number
    despesaLiquida: number
  }>()

  function garantirMes(mes: string) {
    if (!mesesMap.has(mes)) {
      mesesMap.set(mes, { receitaBruta: 0, receitaLiquida: 0, despesaBruta: 0, despesaLiquida: 0 })
    }
    return mesesMap.get(mes)!
  }

  for (const r of receitas) {
    const grupo = garantirMes(mesDaData(r.data_emissao))
    const valorNf = Number(r.valor_nf) || 0
    const desconto = Number(r.valor_desconto) || 0
    grupo.receitaBruta += valorNf
    grupo.receitaLiquida += valorNf - desconto
  }

  for (const d of despesas) {
    // Mesmo fallback de exibição usado em gastosPorTipoFornecedor.ts:
    // documento_data_emissao quando presente, senão created_at (a
    // linha só chega aqui vinda de uma das duas consultas acima, uma
    // das quais garante documento_data_emissao preenchido e a outra
    // garante NULL — created_at cobre o segundo caso)
    const grupo = garantirMes(mesDaData(d.documento_data_emissao ?? d.created_at))
    grupo.despesaBruta += Number(d.valor_original) || 0
    grupo.despesaLiquida += Number(d.valor_total) || 0
  }

  const meses: ReceitaDespesaMes[] = Array.from(mesesMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, g]) => ({
      mes,
      receitaBruta: g.receitaBruta,
      receitaLiquida: g.receitaLiquida,
      despesaBruta: g.despesaBruta,
      despesaLiquida: g.despesaLiquida,
      resultadoBruto: g.receitaBruta - g.despesaBruta,
      resultadoLiquido: g.receitaLiquida - g.despesaLiquida,
    }))

  // ── 4. Totalizador do intervalo — soma simples de cada coluna
  // (nenhuma delas tem risco de dupla-contagem entre meses, diferente
  // do "clientes recorrentes" de Faturamento — aqui é tudo valor
  // monetário, soma direta é sempre correta) ────────────────────────
  const totalizador = meses.reduce(
    (acc, m) => ({
      receitaBruta: acc.receitaBruta + m.receitaBruta,
      receitaLiquida: acc.receitaLiquida + m.receitaLiquida,
      despesaBruta: acc.despesaBruta + m.despesaBruta,
      despesaLiquida: acc.despesaLiquida + m.despesaLiquida,
      resultadoBruto: acc.resultadoBruto + m.resultadoBruto,
      resultadoLiquido: acc.resultadoLiquido + m.resultadoLiquido,
    }),
    { receitaBruta: 0, receitaLiquida: 0, despesaBruta: 0, despesaLiquida: 0, resultadoBruto: 0, resultadoLiquido: 0 },
  )

  return {
    periodo: filtros,
    meses,
    totalizador,
    // Gráfico de barras agrupadas Receita x Despesa por mês (Seção
    // 1.5/2.7) — usa Receita Bruta x Despesa Bruta (não líquida) por
    // ser a leitura mais direta e visualmente comparável a Fluxo de
    // Caixa (Entradas x Saídas), que também usa valores brutos.
    // Rótulo formatado (formatarMesBR) — mesmo padrão do gráfico de
    // barras agrupadas já existente (lib/relatorios/fluxoCaixa.ts)
    grafico: {
      tipo: 'barras_agrupadas',
      legendaA: 'Receita',
      legendaB: 'Despesa',
      pontos: meses.map(m => ({
        rotulo: formatarMesBR(m.mes),
        valorA: m.receitaBruta,
        valorB: m.despesaBruta,
      })),
    },
  }
}
