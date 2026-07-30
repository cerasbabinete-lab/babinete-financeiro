// ============================================================
// lib/relatorios/retiradas.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Calcula o relatório "Retiradas e benefícios por
//         beneficiário" (2.3) — despesas com origem_tipo =
//         'pessoal_socio', agrupadas por beneficiário.
// Conecta com: types/relatorios.ts (RelatorioRetiradas),
//              pages/api/relatorios/retiradas.ts,
//              lib/relatorios/paginacao.ts (paginarConsulta)
// Referência: Especificacao_Modulo_Relatorios.md, Seção 2.3
//
// Nota sobre o filtro de data: a spec pede documento_data_emissao
// com fallback para created_at quando nula, e pede confirmação do
// Builder com o Maycon sobre qual é mais adequada. Implementado o
// fallback como especificado (é a opção que nunca perde um
// lançamento por falta de data). O filtro de intervalo é aplicado
// em JS (não dá pra expressar "COALESCE(a,b) BETWEEN x AND y"
// direto no query builder do supabase-js sem RPC) — aceitável pelo
// volume deste relatório especificamente: lançamentos pessoais de
// sócio/prestador MEI, não a tabela despesas inteira (diferente de
// gastosPorTipoFornecedor.ts, que usa a MESMA técnica sobre a
// tabela despesas inteira — ver Finding Medium §4.4 nesse arquivo).
//
// CORREÇÃO Critical §2.2 (Handoff_Modulo_Relatorios_Audit_para_QA.md)
// — as duas consultas deste arquivo agora paginam via
// paginarConsulta(), mesmo sem filtro de data no banco (a paginação
// é sobre TODAS as linhas devolvidas por .eq('origem_tipo', ...),
// que sem ela também estariam sujeitas ao teto de 1000 do PostgREST).
// ============================================================

import { supabase } from '@/lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  RelatorioRetiradas,
  LancamentoRetirada,
  GrupoBeneficiarioRetiradas,
  SubtipoRetirada,
  FiltroIntervaloDatas,
} from '@/types/relatorios'
import { paginarConsulta } from '@/lib/relatorios/paginacao'
import { dataDentroDoIntervalo } from '@/lib/relatorios/formatadores'

interface LinhaDespesaPessoal {
  documento_data_emissao: string | null
  created_at: string
  origem_beneficiario_nome: string | null
  extensao_categoria: { subtipo?: string } | null
  valor_total: number
  status_pagamento: string
}

// ============================================================
// buscarNomesBeneficiarios()
// Lista os nomes do roster (beneficiarios_pessoais) para popular o
// filtro opcional "beneficiário específico" na tela — usa o roster
// completo, não os nomes que aparecem no relatório já filtrado
// (senão o filtro nunca poderia "adicionar" alguém à visão atual)
// ============================================================
export async function buscarNomesBeneficiarios(client: SupabaseClient = supabase): Promise<string[]> {
  const linhas = await paginarConsulta<{ nome: string }>((inicio, fim) =>
    client
      .from('beneficiarios_pessoais')
      .select('nome')
      .order('nome', { ascending: true })
      .range(inicio, fim),
  )

  // Maycon tem 2 linhas no roster (CPF e CNPJ) com o mesmo nome —
  // Set remove a duplicata visual no filtro
  return Array.from(new Set(linhas.map(r => r.nome)))
}

// ============================================================
// gerarRelatorioRetiradas()
// ============================================================
export async function gerarRelatorioRetiradas(
  filtros: FiltroIntervaloDatas & { beneficiarioFiltro?: string },
  client: SupabaseClient = supabase,
): Promise<RelatorioRetiradas> {
  const linhas = await paginarConsulta<LinhaDespesaPessoal>((inicio, fim) => {
    let query = client
      .from('despesas')
      .select('documento_data_emissao, created_at, origem_beneficiario_nome, extensao_categoria, valor_total, status_pagamento')
      .eq('origem_tipo', 'pessoal_socio')
      .is('deleted_at', null)

    if (filtros.beneficiarioFiltro) {
      query = query.eq('origem_beneficiario_nome', filtros.beneficiarioFiltro)
    }

    return query.range(inicio, fim)
  })

  const linhasNoIntervalo = linhas.filter(d => {
    const dataEfetiva = d.documento_data_emissao ?? d.created_at
    return dataDentroDoIntervalo(dataEfetiva, filtros.dataInicial, filtros.dataFinal)
  })

  const grupos = new Map<string, LancamentoRetirada[]>()

  for (const d of linhasNoIntervalo) {
    const nome = d.origem_beneficiario_nome ?? '—'
    const subtipo = (d.extensao_categoria?.subtipo ?? 'retirada_socio') as SubtipoRetirada
    const dataEfetiva = d.documento_data_emissao ?? d.created_at

    const lancamento: LancamentoRetirada = {
      data: dataEfetiva,
      beneficiarioNome: nome,
      subtipo,
      valor: Number(d.valor_total) || 0,
      statusPagamento: d.status_pagamento,
    }

    if (!grupos.has(nome)) grupos.set(nome, [])
    grupos.get(nome)!.push(lancamento)
  }

  const gruposOrdenados: GrupoBeneficiarioRetiradas[] = Array.from(grupos.entries())
    .map(([beneficiarioNome, lancamentos]) => ({
      beneficiarioNome,
      lancamentos: lancamentos.sort((a, b) => a.data.localeCompare(b.data)),
      subtotal: lancamentos.reduce((s, l) => s + l.valor, 0),
    }))
    .sort((a, b) => b.subtotal - a.subtotal) // maior retirada primeiro

  const totalGeral = gruposOrdenados.reduce((s, g) => s + g.subtotal, 0)

  return {
    periodo: { dataInicial: filtros.dataInicial, dataFinal: filtros.dataFinal },
    beneficiarioFiltro: filtros.beneficiarioFiltro,
    grupos: gruposOrdenados,
    totalGeral,
    grafico: {
      tipo: 'barras',
      pontos: gruposOrdenados.map(g => ({ rotulo: g.beneficiarioNome, valor: g.subtotal })),
    },
  }
}
