// ============================================================
// lib/relatorios/formatadores.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Formatadores compartilhados pelos 6 relatórios (moeda,
//         data BR, descrição de período). O projeto não tem um
//         utilitário genérico entre módulos — cada módulo já
//         duplica o seu (lib/contasAPagarService.ts,
//         lib/receitasService.ts etc. têm cada um o seu
//         formatarMoeda/formatarDataBR). Aqui a duplicação é
//         evitada só DENTRO do módulo Relatórios, sem quebrar a
//         convenção existente de não criar dependência cruzada
//         entre módulos de negócio.
// Conecta com: pages/api/relatorios/*.ts, lib/relatorios/*.ts
// ============================================================

// ============================================================
// formatarMoeda()
// ============================================================
export function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ============================================================
// formatarDataBR()
// Aceita 'YYYY-MM-DD' ou timestamp ISO completo — usa só os 10
// primeiros caracteres, então não sofre com fuso horário na
// conversão (mesmo cuidado já usado nos outros módulos do projeto)
// ============================================================
export function formatarDataBR(dataIso: string): string {
  const [ano, mes, dia] = dataIso.slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

// ============================================================
// formatarMesBR()
// 'YYYY-MM' -> 'mmm/aaaa' (ex: 'jan/2026') — usado nos rótulos de
// gráfico e tabela dos relatórios agrupados por mês
// ============================================================
const NOMES_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
export function formatarMesBR(mesIso: string): string {
  const [ano, mes] = mesIso.split('-')
  const indice = Number(mes) - 1
  return `${NOMES_MES[indice] ?? mes}/${ano}`
}

// ============================================================
// formatarPeriodoDescricao()
// String única "dd/mm/aaaa a dd/mm/aaaa" usada no cabeçalho do PDF
// e na primeira linha do Excel (Seção 5.1)
// ============================================================
export function formatarPeriodoDescricao(dataInicial: string, dataFinal: string): string {
  return `${formatarDataBR(dataInicial)} a ${formatarDataBR(dataFinal)}`
}

// ============================================================
// limiteSuperiorIntervalo()
// Fonte única do padrão `filtros.dataFinal + 'T23:59:59'` usado em
// todo o módulo para filtrar colunas TIMESTAMPTZ (created_at,
// data_emissao) até o fim do dia final do intervalo. Antes, cada
// arquivo concatenava a string sem offset de fuso — o Postgres
// interpreta um literal de timestamp sem offset usando o timezone
// da SESSÃO, que pode não ser o de Brasília, deslocando a fronteira
// efetiva de "fim do dia" em até algumas horas perto da meia-noite
// (Handoff_Modulo_Relatorios_Audit_para_QA.md, Finding 6.4).
// Fix aplicado: offset explícito -03:00 (horário de Brasília, sem
// DST desde 2019 — mesmo fuso de Maringá-PR, sede da empresa), para
// a comparação não depender de nenhuma configuração implícita do
// projeto Supabase. CONFIRMAR COM MAYCON se o projeto Supabase usa
// um timezone de sessão diferente de America/Sao_Paulo — se usar,
// só este helper precisa mudar, todos os relatórios herdam o fix.
// ============================================================
export function limiteSuperiorIntervalo(dataFinal: string): string {
  return `${dataFinal}T23:59:59-03:00`
}

// ============================================================
// dataDentroDoIntervalo()
// Versão do fix de fuso (Finding §6.4) para os casos em que o
// filtro de data é aplicado em JAVASCRIPT, depois da consulta já
// ter voltado do Supabase (retiradas.ts, gastosPorTipoFornecedor.ts
// — nenhum dos dois consegue expressar "COALESCE(a,b) BETWEEN x AND
// y" direto no query builder sem RPC). Nesse caso, comparação de
// STRING (o padrão anterior, `dataEfetiva <= dataFinal+'T23:59:59'`)
// não é segura: `created_at` volta do Supabase como TIMESTAMPTZ já
// com seu próprio offset embutido (tipicamente UTC), e comparar
// strings com offsets diferentes por ordem lexicográfica não reflete
// ordem cronológica real. Fix: converte os dois lados para
// milissegundos via Date.parse() (que entende qualquer offset
// embutido corretamente) antes de comparar — isso funciona mesmo
// sem saber qual offset o Supabase está devolvendo, diferente do
// limiteSuperiorIntervalo() acima (que é para filtro enviado AO
// Postgres, onde o offset explícito -03:00 é necessário porque lá
// quem interpreta a string é o Postgres, não o JS).
// ============================================================
export function dataDentroDoIntervalo(dataEfetiva: string, dataInicial: string, dataFinal: string): boolean {
  const inicioMs = Date.parse(`${dataInicial}T00:00:00-03:00`)
  const fimMs = Date.parse(limiteSuperiorIntervalo(dataFinal))
  const dataEfetivaMs = Date.parse(dataEfetiva)
  return dataEfetivaMs >= inicioMs && dataEfetivaMs <= fimMs
}
