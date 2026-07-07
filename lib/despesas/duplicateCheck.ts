// ============================================================
// lib/despesas/duplicateCheck.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Despesas
// Função: Detectar títulos (parcelas) já lançados anteriormente,
//         usando UM critério: chave composta por parcela (favorecido +
//         numeroDocumento + valor + dataVencimento). Diferente da versão
//         validada na prototipagem, NÃO há checagem por hash de arquivo,
//         pois Despesas não persiste o documento original em nenhum
//         formato (decisão de negócio confirmada na spec oficial).
// Conecta com: types/despesas.ts (DocumentoExtraidoDespesa,
//              ResultadoDuplicateCheckDespesa), consumido por
//              pages/api/despesas/confirmar.ts
// Referência: Especificacao_Modulo_Despesas.md §5, "Function: Duplicate
//             Título Check" — "unlike the disposable test, there is no
//             file-hash (SHA-256) layer, since the original file is not
//             persisted — deduplication relies solely on the composite key"
//
// COMPORTAMENTO NÃO-NEGOCIÁVEL: quando duplicado é detectado, o bloqueio
// é TOTAL — não existe override/force nesta função nem na rota que a
// consome. Se o usuário acredita ser falso positivo, a resolução é manual,
// fora do sistema (corrigir a origem e tentar novamente).
// ============================================================

// Tipo do client Supabase — recebido por parâmetro, nunca instanciado aqui
import type { SupabaseClient } from '@supabase/supabase-js'

// Importa os tipos usados nesta função
import type { DocumentoExtraidoDespesa, ResultadoDuplicateCheckDespesa } from '@/types/despesas'

// ------------------------------------------------------------
// Função: verificarDuplicidade
// Para cada parcela do documento recém-extraído, verifica se já existe
// uma parcela lançada com a MESMA combinação de favorecido + número do
// documento + valor + vencimento — indicando que este documento (ou um
// equivalente) já foi importado antes, ainda que salvo/enviado de novo
// sob outro arquivo/nome.
// ------------------------------------------------------------
export async function verificarDuplicidade(
  supabaseAdmin: SupabaseClient, // client admin já instanciado pela rota chamadora
  documento: Pick<DocumentoExtraidoDespesa, 'favorecido' | 'documentoOrigem' | 'parcelas'>, // campos necessários para a chave composta
): Promise<ResultadoDuplicateCheckDespesa> {

  // ── Passo 1: localiza despesas já lançadas com o mesmo favorecido
  // e (quando presente) o mesmo número de documento ──
  // IMPORTANTE: a busca INCLUI despesas com deleted_at preenchido
  // (canceladas/soft-deleted) de propósito — mesma decisão de design já
  // usada em Contas a Receber, para impedir reimportação do mesmo
  // documento mesmo que o lançamento original tenha sido cancelado depois
  let queryDespesas = supabaseAdmin
    .from('despesas')
    .select('id')
    .eq('favorecido_nome', documento.favorecido.nome)

  // numeroDocumento pode ser null (ex: recibos informais) — só filtra
  // por ele quando o documento atual efetivamente tem esse dado, para
  // não descartar candidatos válidos por causa de um campo ausente
  if (documento.documentoOrigem.numeroDocumento) {
    queryDespesas = queryDespesas.eq('documento_numero', documento.documentoOrigem.numeroDocumento)
  }

  const { data: despesasCandidatas, error: erroDespesas } = await queryDespesas

  if (erroDespesas) {
    throw new Error(`Falha ao verificar duplicidade (busca por favorecido/documento): ${erroDespesas.message}`)
  }

  // Nenhuma despesa com esse favorecido/documento — não há como haver
  // parcela duplicada, encerra aqui sem consultar despesas_parcelas
  const despesaIds = (despesasCandidatas ?? []).map((d) => d.id)
  if (despesaIds.length === 0) {
    return { duplicado: false, criterioDuplicidade: null }
  }

  // ── Passo 2: para cada parcela do documento atual, verifica se já
  // existe uma despesas_parcelas com o mesmo valor + vencimento,
  // vinculada a uma das despesas candidatas encontradas no Passo 1 ──
  for (const parcela of documento.parcelas) {
    const { data: parcelasCandidatas, error: erroParcelas } = await supabaseAdmin
      .from('despesas_parcelas')
      .select('id')
      .in('despesa_id', despesaIds)
      .eq('valor', parcela.valor)
      .eq('data_vencimento', parcela.dataVencimento)
      .limit(1)

    if (erroParcelas) {
      throw new Error(`Falha ao verificar duplicidade (chave composta por parcela): ${erroParcelas.message}`)
    }

    // Encontrou uma parcela já lançada com a mesma combinação de
    // favorecido + numeroDocumento + valor + vencimento — bloqueia
    if (parcelasCandidatas && parcelasCandidatas.length > 0) {
      return {
        duplicado: true,
        criterioDuplicidade: `favorecido_documento_valor_vencimento (parcela ${parcela.numeroParcela}/${parcela.totalParcelas})`,
      }
    }
  }

  // Nenhuma parcela bateu a chave composta — documento é novo
  return { duplicado: false, criterioDuplicidade: null }
}
