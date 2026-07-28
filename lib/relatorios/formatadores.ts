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
