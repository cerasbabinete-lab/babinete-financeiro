// ============================================================
// lib/pagar/rosterConciliacaoPagar.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Pagar
// Função: Ler a tabela de produção beneficiarios_pessoais (já
//         estendida com as 4 colunas novas deste módulo) e resolver,
//         a partir de um CNPJ/CPF extraído de um documento, se existe
//         uma linha de roster com regra_conciliacao_pagar preenchida
//         para aquele documento específico.
// Conecta com: types/contasAPagar.ts (BeneficiarioPessoalRosterPagar),
//              consumido por lib/pagar/motorConciliacao.ts (Passo 1
//              da ordem de prioridade fixa, Especificação §5)
// Referência: Especificacao_Modulo_Contas_a_Pagar.md, Seção 5,
//             "Function: Motor de Conciliação", passo 1 — "checar
//             CNPJ e CPF separadamente contra os campos
//             correspondentes de cada linha do roster (lembrar do
//             caso Maycon, que tem os dois)"
// ============================================================

// Tipo do client Supabase — recebido por parâmetro, nunca instanciado
// aqui (mesmo padrão de lib/despesas/beneficiariosRoster.ts)
import type { SupabaseClient } from '@supabase/supabase-js'

// Tipo do registro do roster, já estendido com as 4 colunas novas
import type { BeneficiarioPessoalRosterPagar } from '@/types/contasAPagar'


// ------------------------------------------------------------
// Função: extrairSomenteDigitos
// Helper local — remove toda pontuação de um documento, deixando só
// os dígitos, para permitir comparação exata independente de máscara
// ------------------------------------------------------------
function extrairSomenteDigitos(documento: string): string {
  return documento.replace(/\D/g, '')
}


// ------------------------------------------------------------
// Função: formatarComoCnpjOuCpf
// Reconstrói a versão formatada (com pontuação) de um documento a
// partir dos dígitos crus, conforme o comprimento (14 = CNPJ,
// 11 = CPF) — mesmo padrão já usado em lib/despesas/fornecedorAutoCreate.ts
// e lib/despesasService.ts::formatarCnpjCpf(). Documentos com
// comprimento diferente de 11/14 retornam null — não há como formatar
// nem confiar neles como CNPJ/CPF válido
// ------------------------------------------------------------
function formatarComoCnpjOuCpf(digitos: string): string | null {
  if (digitos.length === 14) {
    return digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  }
  if (digitos.length === 11) {
    return digitos.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  }
  return null
}


// ------------------------------------------------------------
// Função: buscarBeneficiarioRosterPorDocumento (export principal)
// Recebe um CNPJ/CPF extraído de um documento (Relatório BB,
// comprovante PDF ou TXT) e procura, entre as linhas do roster que
// TÊM regra_conciliacao_pagar preenchida, uma cujo cnpj OU cpf bata
// exatamente com o documento informado.
//
// IMPORTANTE (Especificação §5, passo 1 + nota sobre o caso Maycon):
// CNPJ e CPF são checados SEPARADAMENTE — cada documento extraído é
// testado contra a coluna correspondente (14 dígitos → só contra
// `cnpj`; 11 dígitos → só contra `cpf`), nunca contra as duas ao
// mesmo tempo. Isso é o que permite o Maycon ter 2 linhas de roster
// (uma por cpf, outra por cnpj) com regras diferentes, sem ambiguidade:
// um documento CNPJ só pode bater na linha que tem aquele cnpj.
// ------------------------------------------------------------
export async function buscarBeneficiarioRosterPorDocumento(
  supabaseAdmin: SupabaseClient, // client admin já instanciado pela rota/motor chamador
  documentoExtraido: string, // CNPJ ou CPF extraído do registro, como veio do parser (formatado ou não)
): Promise<BeneficiarioPessoalRosterPagar | null> {
  // Normaliza para dígitos puros — base de toda a comparação exata
  const digitos = extrairSomenteDigitos(documentoExtraido)

  // Documento vazio ou com contagem de dígitos inválida (nem CPF nem
  // CNPJ) — não há como buscar no roster, retorna null sem consultar o banco
  if (digitos.length !== 11 && digitos.length !== 14) return null

  // Reconstrói a versão formatada, para buscar nas duas variantes
  // (banco pode ter salvo com ou sem pontuação, mesma cautela já
  // documentada no projeto para CNPJ/CPF)
  const formatado = formatarComoCnpjOuCpf(digitos)

  // Decide qual coluna consultar conforme o comprimento do documento —
  // NUNCA consulta as duas colunas ao mesmo tempo (regra do caso Maycon)
  const colunaAlvo = digitos.length === 14 ? 'cnpj' : 'cpf'

  // Query: só considera linhas com regra_conciliacao_pagar preenchida —
  // se for NULL, a linha existe no roster mas não tem regra especial
  // para Contas a Pagar (Especificação §2.1: tratado como fornecedor
  // genérico mesmo que exista uma linha no roster)
  const { data: candidatos, error } = await supabaseAdmin
    .from('beneficiarios_pessoais')
    .select('id, nome, cpf, cnpj, vinculo, aliases, endereco, regra_conciliacao_pagar, despesa_gerada_categoria, despesa_gerada_subtipo')
    .not('regra_conciliacao_pagar', 'is', null)
    .or(`${colunaAlvo}.ilike.%${digitos}%${formatado ? `,${colunaAlvo}.ilike.%${formatado}%` : ''}`)

  // Erro de query — propaga para o motor de conciliação tratar
  if (error) {
    throw new Error(`Falha ao buscar roster de beneficiários (Contas a Pagar): ${error.message}`)
  }

  // Confirma o match exato pelos dígitos limpos — evita falso positivo
  // de ILIKE parcial (mesmo cuidado já usado em fornecedorAutoCreate.ts)
  const matchExato = (candidatos ?? []).find((linha) => {
    const valorColuna = colunaAlvo === 'cnpj' ? linha.cnpj : linha.cpf
    return extrairSomenteDigitos(valorColuna ?? '') === digitos
  })

  // Sem match — documento não tem regra especial de conciliação
  if (!matchExato) return null

  // Retorna a linha já no shape tipado esperado pelo motor
  return matchExato as BeneficiarioPessoalRosterPagar
}
