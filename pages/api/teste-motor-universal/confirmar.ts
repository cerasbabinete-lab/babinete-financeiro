// ============================================================
// pages/api/teste-motor-universal/confirmar.ts
// Página avulsa: Motor Universal de Documentos Financeiros (teste)
// Função: Endpoint que persiste o resultado final (já revisado/editado
//         pelo usuário na UI): grava o JSON Universal completo em
//         teste_documentos_importados, uma linha por parcela em
//         teste_titulos_gerados, e — se o formulário de novo fornecedor
//         foi preenchido — insere o novo registro na tabela de PRODUÇÃO
//         fornecedores (único ponto de escrita em produção deste módulo).
// Conecta com: lib/motorUniversal/supabaseAdminMotorUniversal.ts,
//              types/motorUniversal.ts (JsonUniversal), types/fornecedores.ts
//              (FornecedorInsert, reaproveitado do sistema oficial)
// Referência: spec seção 5, "Function: Confirm & Persist", e seção 7
//              (non-negotiable: único write em produção é fornecedores,
//              sempre via formulário revisado manualmente, nunca automático)
// ============================================================

// Importa os tipos padrão de request/response do Pages Router
import type { NextApiRequest, NextApiResponse } from 'next'

// Importa o helper de client Supabase admin, isolado desta página avulsa
import { getSupabaseAdminMotorUniversal } from '@/lib/motorUniversal/supabaseAdminMotorUniversal'

// Importa o tipo do JSON Universal completo
import type { JsonUniversal } from '@/types/motorUniversal'

// Importa o tipo de inserção de fornecedor, reaproveitado do sistema
// oficial — garante que os campos batem exatamente com a tabela de produção
import type { FornecedorInsert } from '@/types/fornecedores'

// ------------------------------------------------------------
// TIPO: shape esperado do corpo da requisição de confirmação
// ------------------------------------------------------------
interface CorpoRequisicaoConfirmar {
  jsonUniversal: JsonUniversal // objeto final, possivelmente editado manualmente pelo usuário na UI
  hashArquivo: string // hash do arquivo original, usado para dedup futura
  fornecedorId: number | null // id de um fornecedor já existente, se houve match
  novoFornecedor: FornecedorInsert | null // dados do formulário de novo fornecedor, se preenchido e confirmado
  confirmarApesarDeDuplicado: boolean // true quando o usuário explicitamente decidiu prosseguir mesmo com alerta de duplicidade
  duplicateCheckStatus: 'novo' | 'duplicado_hash' | 'duplicado_composto' // resultado da checagem, repassado da tela anterior
}

// ------------------------------------------------------------
// Handler principal da rota
// ------------------------------------------------------------
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Esta rota só aceita POST — qualquer outro método é rejeitado
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido. Use POST.' })
    return
  }

  try {
    const corpo = req.body as CorpoRequisicaoConfirmar

    // ── Validação: bloqueia gravação de documento duplicado sem override explícito ──
    // Conforme spec seção 5 ("Edge cases: if duplicate check flagged the
    // document, require explicit override confirmation before allowing
    // this function to run")
    if (corpo.duplicateCheckStatus !== 'novo' && !corpo.confirmarApesarDeDuplicado) {
      res.status(409).json({
        error: 'Documento identificado como possível duplicado. Confirme explicitamente para prosseguir mesmo assim.',
      })
      return
    }

    const supabaseAdmin = getSupabaseAdminMotorUniversal()

    // ── Passo 1: se um novo fornecedor foi preenchido/confirmado, insere
    // na tabela de PRODUÇÃO fornecedores — único write em produção deste
    // módulo, e só acontece aqui, nunca automaticamente ──
    let fornecedorIdFinal = corpo.fornecedorId

    if (corpo.novoFornecedor) {
      const { data: fornecedorCriado, error: erroFornecedor } = await supabaseAdmin
        .from('fornecedores') // TABELA DE PRODUÇÃO — não prefixada com teste_
        .insert(corpo.novoFornecedor)
        .select('id')
        .single()

      if (erroFornecedor) {
        throw new Error(`Falha ao gravar novo fornecedor em produção: ${erroFornecedor.message}`)
      }

      fornecedorIdFinal = fornecedorCriado.id
    }

    // ── Passo 2: insere o JSON Universal completo em teste_documentos_importados ──
    const { data: documentoImportado, error: erroDocumento } = await supabaseAdmin
      .from('teste_documentos_importados')
      .insert({
        nome_arquivo_original: corpo.jsonUniversal.documentoOrigem.numeroDocumento || 'sem-numero-documento',
        tipo_arquivo: corpo.jsonUniversal.tipoDocumento,
        hash_arquivo: corpo.hashArquivo,
        anexo_original_url: null, // não utilizado nesta fase de teste (arquivo original não é persistido)
        json_universal: corpo.jsonUniversal, // objeto completo, gravado como JSONB
        fornecedor_id: fornecedorIdFinal,
        fornecedor_match_status: fornecedorIdFinal ? 'encontrado' : 'nao_encontrado',
        duplicado_status: corpo.duplicateCheckStatus,
        duplicado_criterio: corpo.duplicateCheckStatus !== 'novo' ? 'confirmado_manualmente_apesar_do_alerta' : null,
        origem_despesa_status: corpo.jsonUniversal.origemDespesa.tipo ? 'auto_classificado' : 'revisao_manual',
        origem_despesa_criterios: null, // detalhamento fica só na resposta de /processar; aqui gravamos só o status final
      })
      .select('id')
      .single()

    if (erroDocumento) {
      throw new Error(`Falha ao gravar documento importado: ${erroDocumento.message}`)
    }

    // ── Passo 3: insere uma linha em teste_titulos_gerados por parcela ──
    const titulosParaInserir = corpo.jsonUniversal.parcelas.map((parcela) => ({
      documento_importado_id: documentoImportado.id, // FK interna (dentro do teste), ver Etapa 1
      numero_parcela: parcela.numeroParcela,
      total_parcelas: parcela.totalParcelas,
      favorecido_nome: corpo.jsonUniversal.favorecido.nome,
      favorecido_cnpj_cpf: corpo.jsonUniversal.favorecido.cnpjCpf,
      valor: parcela.valor,
      data_vencimento: parcela.dataVencimento,
      linha_digitavel: parcela.linhaDigitavel,
      codigo_barras: parcela.codigoBarras,
      nosso_numero: parcela.nossoNumero,
      pode_gerar_segunda_via: parcela.podeGerarSegundaVia,
      status: 'em_aberto',
    }))

    const { error: erroTitulos } = await supabaseAdmin.from('teste_titulos_gerados').insert(titulosParaInserir)

    if (erroTitulos) {
      // Nota: se este passo falhar depois do documento já ter sido gravado,
      // fica um registro em teste_documentos_importados sem títulos
      // correspondentes — aceitável nesta fase de teste (tabelas
      // descartáveis), mas o erro é reportado claramente para o usuário
      throw new Error(`Documento gravado (id ${documentoImportado.id}), mas falha ao gravar títulos: ${erroTitulos.message}`)
    }

    // ── Confirma sucesso para a UI ──
    res.status(200).json({
      sucesso: true,
      documentoImportadoId: documentoImportado.id,
      totalParcelasGravadas: titulosParaInserir.length,
      fornecedorIdUsado: fornecedorIdFinal,
    })
  } catch (err: unknown) {
    // Convenção do projeto: catch (err: unknown), nunca "any"
    const mensagemErro = err instanceof Error ? err.message : String(err)
    console.error('[teste-motor-universal/confirmar] Erro:', mensagemErro)
    res.status(500).json({ error: mensagemErro })
  }
}
