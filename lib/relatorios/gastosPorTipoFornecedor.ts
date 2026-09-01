// ============================================================
// lib/relatorios/gastosPorTipoFornecedor.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Calcula o relatório "Gastos por tipo de fornecedor" (2.6)
//         — despesas agrupadas por fornecedores.tipo_fornecedor_id,
//         por mês. Fornecedor sem tipo_fornecedor_id preenchido cai
//         no grupo visível "Não classificado" (Seção 2.6 — nunca
//         omitido do total).
// Conecta com: types/relatorios.ts (RelatorioGastosPorTipoFornecedor),
//              pages/api/relatorios/gastos-por-tipo-fornecedor.ts,
//              sql/fornecedores.sql (fornecedor_categorias,
//              tipo_fornecedor_id),
//              lib/relatorios/paginacao.ts (paginarConsulta, dividirEmLotes)
// Referência: Especificacao_Modulo_Relatorios.md, Seção 2.6
//
// Decisões confirmadas por Maycon nesta sessão:
//   - Fonte de gasto = despesas (documento), não contas_a_pagar (título)
// Decisões de engenharia não detalhadas na spec:
//   - Filtro de data sobre despesas.documento_data_emissao, com
//     fallback created_at quando nula — mesmo padrão já usado no
//     relatório de Retiradas (2.3), mesma tabela de origem
//
// CORREÇÃO Critical §2.2 (Handoff_Modulo_Relatorios_Audit_para_QA.md)
// — as consultas paginam agora via paginarConsulta()/dividirEmLotes().
// CORREÇÃO §6.4 — limite superior de intervalo com fuso explícito
// (limiteSuperiorIntervalo()) na consulta (B) abaixo, que filtra
// created_at (TIMESTAMPTZ) diretamente no banco — deixou de ser
// comparação em JS depois do fix §4.4 logo abaixo.
//
// CORREÇÃO Medium §4.4 — a consulta de despesas antes carregava a
// TABELA INTEIRA (sem filtro de data no banco) e filtrava em JS.
// Fix: 2 consultas complementares, cada uma já filtrada no banco:
//   (A) documento_data_emissao dentro do intervalo — cobre o caso
//       normal, onde a coluna está preenchida
//   (B) documento_data_emissao IS NULL, created_at dentro do
//       intervalo — cobre o fallback, sem depender de filtrar em JS
// A auditoria pedia para "confirmar com Maycon o quão comum é
// documento_data_emissao NULL antes de decidir a estratégia" — mas
// concluiu que a resposta é a mesma nos dois cenários (raro ou
// comum): "the correct fix is two queries... not a single unfiltered
// fetch, and not a JS-only filter as it stands today." Por isso este
// fix não depende de uma decisão de negócio do Maycon, foi aplicado
// direto — é estritamente melhor que o estado anterior nos dois casos.
//
// CORREÇÃO Medium §4.5 — origem_tipo agora É filtrado
// (.neq('origem_tipo', 'pessoal_socio') nas duas consultas abaixo).
// Decisão confirmada por Maycon: retiradas pessoais de sócio/
// prestador MEI saem deste relatório — já têm relatório próprio
// (2.3 Retiradas), e misturar contaminaria a leitura de gasto
// operacional real por tipo de fornecedor, que é o propósito deste
// relatório especificamente.
//
// MIGRAÇÃO (Especificacao_Fornecedores_Pix_Categorias_WhatsApp.md,
// Seção 4.7) — tipo_fornecedor (enum fechado, TEXT) virou
// tipo_fornecedor_id (FK para fornecedor_categorias, tabela editável
// pelo usuário). Consequências neste arquivo:
//   - Agrupamento passa a ser pela FK numérica, não mais por string
//   - O antigo dicionário estático ROTULO_TIPO (export removido) foi
//     substituído por um lookup AO VIVO contra fornecedor_categorias,
//     feito a cada geração de relatório — nunca armazenado nem
//     cacheado (exigência explícita da Seção 4.7: "must always
//     reflect the current category name at generation time"). O nome
//     resolvido agora viaja em cada linha agregada (campo `rotulo`,
//     types/relatorios.ts) em vez de um dicionário externo indexado
//     pelo antigo enum — os consumidores (GastosPorTipoFornecedorRelatorio.tsx,
//     pages/api/relatorios/gastos-por-tipo-fornecedor.ts) leem
//     `linha.rotulo` diretamente.
// ============================================================

import { supabase } from '@/lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  RelatorioGastosPorTipoFornecedor,
  GastoPorTipoFornecedor,
  GastoPorTipoFornecedorMes,
  TipoFornecedorOuNaoClassificado,
  FiltroIntervaloDatas,
} from '@/types/relatorios'
import { paginarConsulta, dividirEmLotes } from '@/lib/relatorios/paginacao'
import { limiteSuperiorIntervalo } from '@/lib/relatorios/formatadores'

// Grupo virtual "Não classificado" — não existe como linha em
// fornecedor_categorias, por isso precisa de um rótulo fixo à parte.
// Tipado como literal (não como TipoFornecedorOuNaoClassificado, que é
// mais amplo) DE PROPÓSITO: só assim o `tipo === NAO_CLASSIFICADO` em
// rotuloDoTipo() consegue estreitar `tipo` para `number` no branch
// seguinte — com o tipo largo, o TypeScript não estreita a comparação
// e mapaRotulo.get(tipo) (Map<number, string>) rejeita o argumento
const NAO_CLASSIFICADO = 'nao_classificado' as const
const ROTULO_NAO_CLASSIFICADO = 'Não classificado'

interface LinhaDespesa {
  fornecedor_id: number
  valor_total: number
  documento_data_emissao: string | null
  created_at: string
}

// ============================================================
// gerarRelatorioGastosPorTipoFornecedor()
// ============================================================
export async function gerarRelatorioGastosPorTipoFornecedor(
  filtros: FiltroIntervaloDatas & { tipoFiltro?: TipoFornecedorOuNaoClassificado },
  client: SupabaseClient = supabase,
): Promise<RelatorioGastosPorTipoFornecedor> {
  // ── 1. Despesas EMPRESARIAIS, não soft-deleted ──────────────
  // (origem_tipo='pessoal_socio' excluído — Fix §4.5, ver cabeçalho
  // do arquivo. Retiradas pessoais têm relatório próprio, Seção 2.3)
  //
  // (A) documento_data_emissao dentro do intervalo — filtro no banco
  const comDataEmissao = await paginarConsulta<LinhaDespesa>((inicio, fim) =>
    client
      .from('despesas')
      .select('fornecedor_id, valor_total, documento_data_emissao, created_at')
      .is('deleted_at', null)
      .neq('origem_tipo', 'pessoal_socio')
      .gte('documento_data_emissao', filtros.dataInicial)
      .lte('documento_data_emissao', filtros.dataFinal)
      .range(inicio, fim),
  )

  // (B) documento_data_emissao NULL, fallback por created_at —
  // também filtrado no banco, não mais em JS sobre a tabela inteira
  const semDataEmissao = await paginarConsulta<LinhaDespesa>((inicio, fim) =>
    client
      .from('despesas')
      .select('fornecedor_id, valor_total, documento_data_emissao, created_at')
      .is('deleted_at', null)
      .neq('origem_tipo', 'pessoal_socio')
      .is('documento_data_emissao', null)
      .gte('created_at', filtros.dataInicial)
      .lte('created_at', limiteSuperiorIntervalo(filtros.dataFinal))
      .range(inicio, fim),
  )

  // As duas consultas são mutuamente exclusivas por construção
  // (uma exige documento_data_emissao preenchido, a outra exige NULL)
  // — concatenar não duplica nenhuma linha
  const linhasNoIntervalo = [...comDataEmissao, ...semDataEmissao]

  // ── 2. Busca tipo_fornecedor_id só dos fornecedores que aparecem
  // no período filtrado (evita puxar a tabela fornecedores inteira) ──
  const idsFornecedores = Array.from(new Set(linhasNoIntervalo.map(d => d.fornecedor_id)))
  const mapaTipo = new Map<number, TipoFornecedorOuNaoClassificado>()

  // Em lotes (dividirEmLotes) e paginado (paginarConsulta) pelos
  // mesmos motivos já aplicados nos outros arquivos deste módulo —
  // o número de fornecedores distintos cresce com o negócio
  for (const lote of dividirEmLotes(idsFornecedores)) {
    if (lote.length === 0) continue
    const fornecedoresDoLote = await paginarConsulta<{ id: number; tipo_fornecedor_id: number | null }>((inicio, fim) =>
      client
        .from('fornecedores')
        .select('id, tipo_fornecedor_id')
        .in('id', lote)
        .range(inicio, fim),
    )
    for (const f of fornecedoresDoLote) {
      mapaTipo.set(f.id, f.tipo_fornecedor_id ?? NAO_CLASSIFICADO)
    }
  }

  // ── 2b. Lookup AO VIVO dos nomes das categorias (Seção 4.7) —
  // só busca as categorias que de fato aparecem no conjunto agregado
  // deste relatório, nunca a tabela inteira. Nome NUNCA é armazenado
  // nem cacheado entre gerações — cada chamada desta função refaz
  // esta busca, garantindo que renomear uma categoria (CategoriasModal.tsx)
  // reflita imediatamente no próximo relatório gerado ──
  const idsCategoriasUsadas = Array.from(
    new Set(Array.from(mapaTipo.values()).filter((t): t is number => typeof t === 'number'))
  )
  const mapaRotulo = new Map<number, string>()
  for (const lote of dividirEmLotes(idsCategoriasUsadas)) {
    if (lote.length === 0) continue
    const categoriasDoLote = await paginarConsulta<{ id: number; nome: string }>((inicio, fim) =>
      client
        .from('fornecedor_categorias')
        .select('id, nome')
        .in('id', lote)
        .range(inicio, fim),
    )
    for (const c of categoriasDoLote) {
      mapaRotulo.set(c.id, c.nome)
    }
  }

  // rotuloDoTipo — resolve o nome de exibição de um grupo. Fallback
  // defensivo para "Não classificado" cobre o caso raro de uma
  // categoria ter sido excluída entre a classificação do fornecedor
  // e a geração deste relatório especificamente (janela de corrida
  // teoricamente possível, embora excluir_categoria_fornecedor já
  // reclassifique fornecedores antes de soft-deletar a categoria)
  function rotuloDoTipo(tipo: TipoFornecedorOuNaoClassificado): string {
    if (tipo === NAO_CLASSIFICADO) return ROTULO_NAO_CLASSIFICADO
    return mapaRotulo.get(tipo) ?? ROTULO_NAO_CLASSIFICADO
  }

  // ── 3. Agregação por tipo (período inteiro) e por tipo+mês ───
  const porTipoMap = new Map<TipoFornecedorOuNaoClassificado, number>()
  const porTipoPorMesMap = new Map<string, number>() // chave: `${tipo}|${mes}`

  for (const d of linhasNoIntervalo) {
    const tipo = mapaTipo.get(d.fornecedor_id) ?? NAO_CLASSIFICADO
    if (filtros.tipoFiltro && tipo !== filtros.tipoFiltro) continue

    const valor = Number(d.valor_total) || 0
    porTipoMap.set(tipo, (porTipoMap.get(tipo) ?? 0) + valor)

    const mes = (d.documento_data_emissao ?? d.created_at).slice(0, 7)
    const chaveMes = `${tipo}|${mes}`
    porTipoPorMesMap.set(chaveMes, (porTipoPorMesMap.get(chaveMes) ?? 0) + valor)
  }

  const porTipo: GastoPorTipoFornecedor[] = Array.from(porTipoMap.entries())
    .map(([tipo, total]) => ({ tipo, rotulo: rotuloDoTipo(tipo), total }))
    .sort((a, b) => b.total - a.total)

  const porTipoPorMes: GastoPorTipoFornecedorMes[] = Array.from(porTipoPorMesMap.entries())
    .map(([chave, total]) => {
      // tipo volta como string do template literal da chave composta —
      // 'nao_classificado' fica como está, qualquer outro valor é o id
      // numérico da categoria e precisa voltar a ser number
      const [tipoStr, mes] = chave.split('|')
      const tipo: TipoFornecedorOuNaoClassificado =
        tipoStr === NAO_CLASSIFICADO ? NAO_CLASSIFICADO : Number(tipoStr)
      return { tipo, rotulo: rotuloDoTipo(tipo), mes, total }
    })
    .sort((a, b) => a.mes.localeCompare(b.mes))

  const totalGeral = porTipo.reduce((s, t) => s + t.total, 0)

  return {
    periodo: filtros,
    tipoFiltro: filtros.tipoFiltro,
    porTipo,
    porTipoPorMes,
    totalGeral,
    grafico: {
      tipo: 'pizza',
      pontos: porTipo.map(t => ({ rotulo: t.rotulo, valor: t.total })),
    },
  }
}
