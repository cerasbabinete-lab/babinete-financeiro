// ============================================================
// lib/pagar/duplicateCheckPagar.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Pagar
// Função: Deduplicação das 3 fontes de importação — hash de arquivo
//         inteiro para o Relatório BB consolidado (pagar_arquivos_importados),
//         e identificador natural individual para comprovantes PDF/TXT
//         (pagar_comprovantes_processados). São mecanismos DIFERENTES
//         por design (Especificação §2.1) — nunca unificar num só.
// Conecta com: types/contasAPagar.ts (ArquivoImportadoPagar,
//              ComprovanteProcessado), consumido pelas rotas
//              pages/api/pagar/importar-relatorio.ts e
//              pages/api/pagar/importar-comprovante.ts (ANTES de
//              chamar os parsers/motor — bloqueio acontece cedo)
// Referência: Especificacao_Modulo_Contas_a_Pagar.md, Seção 2.1
//             (tabelas pagar_arquivos_importados e
//             pagar_comprovantes_processados) e Seção 7,
//             "Non-negotiables": "Dedupe do Relatório BB é por hash
//             de arquivo inteiro... Dedupe de comprovante é por
//             identificador natural individual, nunca por hash de
//             arquivo — o TXT é sempre sobrescrito com o mesmo nome"
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

import type { ArquivoImportadoPagar, ComprovanteProcessado } from '@/types/contasAPagar'


// ------------------------------------------------------------
// TIPO: resultado da checagem de arquivo de Relatório BB
// ------------------------------------------------------------
export interface ResultadoChecagemArquivoRelatorio {
  jaImportado: boolean
  importacaoAnterior: ArquivoImportadoPagar | null // detalhes da importação anterior, se houver, para exibir a data ao usuário
}


// ------------------------------------------------------------
// Função: verificarHashRelatorioJaImportado
// Checa se o hash SHA-256 do arquivo já existe em
// pagar_arquivos_importados — bloqueio TOTAL do arquivo inteiro se
// já foi importado antes (Especificação §5, passo 2 do parser do
// Relatório BB)
// ------------------------------------------------------------
export async function verificarHashRelatorioJaImportado(
  supabaseAdmin: SupabaseClient, // client admin já instanciado pela rota chamadora
  hashArquivo: string, // SHA-256 do conteúdo do PDF, calculado pela rota chamadora antes de chamar o parser
): Promise<ResultadoChecagemArquivoRelatorio> {
  // Busca exata pelo hash — coluna UNIQUE, então no máximo 1 resultado
  const { data, error } = await supabaseAdmin
    .from('pagar_arquivos_importados')
    .select('*')
    .eq('hash_arquivo', hashArquivo)
    .maybeSingle()

  // Erro de query — propaga para a rota chamadora tratar
  if (error) {
    throw new Error(`Falha ao verificar duplicidade do Relatório BB: ${error.message}`)
  }

  // data null = hash nunca visto antes, arquivo é novo
  return {
    jaImportado: data !== null,
    importacaoAnterior: (data as ArquivoImportadoPagar) ?? null,
  }
}


// ------------------------------------------------------------
// Função: registrarArquivoImportado
// Grava uma nova linha em pagar_arquivos_importados após o
// processamento completo de um Relatório BB — SEMPRE a última etapa
// do fluxo (Especificação §5, passo 7: "Ao final, grava uma linha em
// pagar_arquivos_importados com os totais")
// ------------------------------------------------------------
export async function registrarArquivoImportado(
  supabaseAdmin: SupabaseClient,
  dados: Omit<ArquivoImportadoPagar, 'id' | 'created_at'>, // tudo exceto os campos gerados automaticamente
): Promise<void> {
  const { error } = await supabaseAdmin.from('pagar_arquivos_importados').insert(dados)

  // Falha ao registrar não deve apagar o trabalho de baixa já feito —
  // mas propaga o erro para a rota alertar o usuário que o registro de
  // dedupe não foi salvo (risco de reimportação futura não bloqueada)
  if (error) {
    throw new Error(`Falha ao registrar arquivo de Relatório BB importado: ${error.message}`)
  }
}


// ------------------------------------------------------------
// Função: verificarComprovanteJaProcessado
// Checa se um identificador natural específico (NR.AUTENTICACAO para
// PDF de boleto; ID: ou AUTENTICACAO SISBB: para Pix/TXT) já foi
// processado antes — bloqueio de SÓ AQUELE comprovante, nunca do
// arquivo/lote inteiro (diferente do Relatório BB, de propósito)
// ------------------------------------------------------------
export async function verificarComprovanteJaProcessado(
  supabaseAdmin: SupabaseClient,
  identificadorNatural: string, // chave de dedupe do comprovante individual
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('pagar_comprovantes_processados')
    .select('id')
    .eq('identificador_natural', identificadorNatural)
    .maybeSingle()

  if (error) {
    throw new Error(`Falha ao verificar duplicidade de comprovante: ${error.message}`)
  }

  // data null = identificador nunca visto antes
  return data !== null
}


// ------------------------------------------------------------
// Função: registrarComprovanteProcessado
// Grava uma nova linha em pagar_comprovantes_processados após um
// comprovante individual (PDF ou um bloco do TXT) ser processado com
// sucesso pelo Motor de Conciliação — mesmo se o resultado for
// "despesa criada" (contas_a_pagar_id fica null nesse caso) ou
// "pendente de confirmação" (registrado só depois da confirmação do
// usuário, nunca antes — ver nota no motorConciliacao.ts)
// ------------------------------------------------------------
export async function registrarComprovanteProcessado(
  supabaseAdmin: SupabaseClient,
  dados: Omit<ComprovanteProcessado, 'id' | 'created_at'>,
): Promise<void> {
  const { error } = await supabaseAdmin.from('pagar_comprovantes_processados').insert(dados)

  if (error) {
    throw new Error(`Falha ao registrar comprovante processado: ${error.message}`)
  }
}
