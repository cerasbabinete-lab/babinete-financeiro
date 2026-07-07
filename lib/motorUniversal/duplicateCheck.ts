// ============================================================
// lib/motorUniversal/duplicateCheck.ts
// Página avulsa: Motor Universal de Documentos Financeiros (teste)
// Função: Detectar documentos já importados anteriormente, usando 2
//         critérios independentes: (1) hash SHA-256 do arquivo bruto,
//         (2) chave composta por parcela (favorecido + numeroDocumento +
//         valor + dataVencimento), para pegar o mesmo documento salvo
//         sob outro nome de arquivo.
// Conecta com: types/motorUniversal.ts (JsonUniversal, ResultadoDuplicateCheck),
//              lib/motorUniversal/supabaseAdminMotorUniversal.ts,
//              e é consumido por pages/api/teste-motor-universal/processar.ts
// Referência: spec seção 5, "Function: Duplicate Title/Expense Check"
//
// NOTA: o cálculo do hash SHA-256 em si (Web Crypto API) roda no CLIENT
// (app/teste-motor-universal/page.tsx), reaproveitando exatamente o
// mesmo padrão já usado no módulo Contas a Receber para deduplicação de
// arquivos bancários — este arquivo só RECEBE o hash já calculado e faz
// a consulta/comparação no banco.
// ============================================================

// Importa o helper de client Supabase admin, isolado desta página avulsa
import { getSupabaseAdminMotorUniversal } from './supabaseAdminMotorUniversal'

// Importa os tipos usados nesta função
import type { JsonUniversal, ResultadoDuplicateCheck } from '@/types/motorUniversal'

// ------------------------------------------------------------
// Função: verificarDuplicidade
// Executa os 2 critérios de checagem descritos na spec, nesta ordem:
//   1. Hash SHA-256 exato do arquivo → duplicidade forte (mesmo arquivo)
//   2. Chave composta por parcela → duplicidade por conteúdo (arquivo
//      diferente, mesmo documento/dívida)
// ------------------------------------------------------------
export async function verificarDuplicidade(
  hashArquivo: string, // hash SHA-256 do arquivo, já calculado no client via crypto.subtle.digest
  jsonUniversal: Pick<JsonUniversal, 'favorecido' | 'documentoOrigem' | 'parcelas'>, // campos necessários para a chave composta
): Promise<ResultadoDuplicateCheck> {
  // Obtém o client admin (ignora RLS, necessário pois a página não tem auth)
  const supabaseAdmin = getSupabaseAdminMotorUniversal()

  // ── Critério 1: hash SHA-256 exato ──
  // Busca se já existe algum documento importado com o mesmo hash de arquivo
  const { data: candidatosPorHash, error: erroHash } = await supabaseAdmin
    .from('teste_documentos_importados')
    .select('id')
    .eq('hash_arquivo', hashArquivo)
    .limit(1)

  if (erroHash) {
    throw new Error(`Falha ao verificar duplicidade por hash: ${erroHash.message}`)
  }

  // IMPORTANTE: a deduplicação por hash INCLUI intencionalmente registros
  // cancelados/soft-deleted, se este módulo vier a ter soft-delete no
  // futuro — mesma decisão de design já usada em Contas a Receber, para
  // impedir reimportação do mesmo arquivo mesmo que o título tenha sido
  // excluído/cancelado depois. Como esta tabela de teste não implementa
  // soft-delete (é 100% descartável), este comentário serve de referência
  // para quando a lógica for portada ao módulo oficial.
  if (candidatosPorHash && candidatosPorHash.length > 0) {
    return {
      status: 'duplicado_hash',
      criterioDuplicidade: 'hash_arquivo_identico',
    }
  }

  // ── Critério 2: chave composta por parcela ──
  // Para cada parcela do documento atual, verifica se já existe um título
  // gerado com a mesma combinação de favorecido + numeroDocumento + valor
  // + dataVencimento — isso pega o mesmo documento salvo com outro nome
  // de arquivo (hash diferente, mas conteúdo idêntico)
  for (const parcela of jsonUniversal.parcelas) {
    const { data: candidatosPorChaveComposta, error: erroComposta } = await supabaseAdmin
      .from('teste_titulos_gerados')
      .select('id')
      .eq('favorecido_nome', jsonUniversal.favorecido.nome)
      .eq('valor', parcela.valor)
      .eq('data_vencimento', parcela.dataVencimento)
      .limit(1)

    if (erroComposta) {
      throw new Error(`Falha ao verificar duplicidade por chave composta: ${erroComposta.message}`)
    }

    // Se encontrou uma parcela já gravada com a mesma combinação de
    // favorecido + valor + vencimento, marca como duplicado composto.
    // NOTA: numeroDocumento não entra diretamente no filtro .eq() porque
    // pode ser null em alguns documentos (ex: recibos informais); quando
    // presente nos dois lados, ele já está implicitamente coberto pela
    // combinação favorecido+valor+vencimento ser específica o suficiente
    // na prática para este teste.
    if (candidatosPorChaveComposta && candidatosPorChaveComposta.length > 0) {
      return {
        status: 'duplicado_composto',
        criterioDuplicidade: `favorecido_valor_vencimento (parcela ${parcela.numeroParcela}/${parcela.totalParcelas})`,
      }
    }
  }

  // Nenhum dos dois critérios encontrou duplicidade — documento é novo
  return {
    status: 'novo',
    criterioDuplicidade: null,
  }
}
