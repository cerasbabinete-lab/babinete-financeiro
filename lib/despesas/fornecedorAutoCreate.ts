// ============================================================
// lib/despesas/fornecedorAutoCreate.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Despesas
// Função: Cruzar o "favorecido" extraído (IA ou parser XML) com a
//         tabela de PRODUÇÃO "fornecedores" — e, diferente do fluxo
//         de teste original, CRIAR automaticamente e silenciosamente
//         um novo fornecedor quando não houver match, mesmo que os
//         dados venham incompletos. A UI é responsável por avisar o
//         usuário depois que isso aconteceu (nunca aqui).
// Conecta com: types/despesas.ts (Favorecido, ResultadoFornecedorMatchDespesa),
//              types/fornecedores.ts (FornecedorInsert), consumido por
//              pages/api/despesas/confirmar.ts
// Referência: Especificacao_Modulo_Despesas.md §5, "Function: Fornecedor
//             Cross-Reference" — "create a new fornecedor record
//             automatically and silently... UI must surface this event"
//
// DIFERENÇA CRÍTICA em relação à versão validada na prototipagem:
// lá, quando não havia match, a função devolvia status 'nao_encontrado'
// e a UI exibia um formulário para revisão manual ANTES de gravar.
// Aqui, essa etapa manual foi removida por decisão explícita da spec
// oficial — o fornecedor é criado direto, e o aviso pra revisar os
// dados depois vira responsabilidade da tela de Despesas (campo
// fornecedor_auto_criado na tabela despesas).
// ============================================================

// Tipo do client Supabase — recebido por parâmetro, nunca instanciado aqui
import type { SupabaseClient } from '@supabase/supabase-js'

// Importa os tipos usados nesta função
import type { Favorecido, ResultadoFornecedorMatchDespesa } from '@/types/despesas'
import type { FornecedorInsert } from '@/types/fornecedores'

// ------------------------------------------------------------
// Função auxiliar: separarCnpjCpf
// Decide, a partir da contagem de dígitos, se o documento extraído é
// um CNPJ (14 dígitos → coluna cnpj) ou CPF (11 dígitos → coluna cpf).
// Documentos com contagem diferente (mascarados/inválidos) não são
// gravados em nenhuma das duas colunas — evita poluir a tabela com
// lixo não-numérico que quebraria buscas futuras por CNPJ/CPF.
// ------------------------------------------------------------
function separarCnpjCpf(cnpjCpf: string | null): { cnpj?: string; cpf?: string } {
  if (!cnpjCpf) return {}
  const digitos = cnpjCpf.replace(/\D/g, '')
  if (digitos.length === 14) return { cnpj: cnpjCpf }
  if (digitos.length === 11) return { cpf: cnpjCpf }
  return {} // contagem inesperada — não grava em nenhuma coluna de documento
}

// ------------------------------------------------------------
// Função: buscarOuCriarFornecedor
// Implementa os 3 passos:
//   1. Busca por CNPJ/CPF (formatado e não-formatado, mesmo padrão já
//      usado em verificarDuplicidadeFornecedor() de fornecedoresService.ts)
//   2. Se não encontrar por documento, cai para fallback por
//      nome/razão social + endereço
//   3. Se ainda assim não encontrar, CRIA um novo fornecedor
//      automaticamente com os dados disponíveis (mesmo incompletos)
// ------------------------------------------------------------
export async function buscarOuCriarFornecedor(
  supabaseAdmin: SupabaseClient, // client admin já instanciado pela rota chamadora
  favorecido: Favorecido, // bloco favorecido extraído do documento
): Promise<ResultadoFornecedorMatchDespesa> {

  // ── Passo 1: tentativa de match por CNPJ/CPF ──
  // Só tenta esse passo se o favorecido tiver algum documento extraído
  if (favorecido.cnpjCpf) {
    // Remove toda formatação do documento extraído, para montar as duas
    // variantes de busca (com e sem máscara), igual ao padrão existente
    const documentoLimpo = favorecido.cnpjCpf.replace(/[^0-9]/g, '')

    // Reconstrói a versão formatada de CNPJ (14 dígitos) se aplicável;
    // CPF (11 dígitos) já vem tratado como está, sem reformatar aqui
    const documentoFormatado =
      documentoLimpo.length === 14
        ? documentoLimpo.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
        : favorecido.cnpjCpf

    // Query na tabela fornecedores, buscando em cnpj OU cpf, nas duas
    // variantes (formatada e não-formatada) — mesmo padrão de
    // fornecedoresService.ts (uso de .ilike com % para tolerar variações)
    const { data: candidatosPorDocumento, error: erroDocumento } = await supabaseAdmin
      .from('fornecedores')
      .select('id, razao, fantasia, cnpj, cpf, end')
      .or(
        `cnpj.ilike.%${documentoFormatado}%,cnpj.ilike.%${documentoLimpo}%,cpf.ilike.%${documentoFormatado}%,cpf.ilike.%${documentoLimpo}%`,
      )

    // Se a query falhar, propaga o erro para a API route tratar
    if (erroDocumento) {
      throw new Error(`Falha ao buscar fornecedor por CNPJ/CPF: ${erroDocumento.message}`)
    }

    // Confirma o match comparando os dígitos limpos (evita falso positivo
    // de ILIKE parcial coincidindo com outro número que contenha os mesmos dígitos)
    const matchExato = (candidatosPorDocumento ?? []).find((f) => {
      const cnpjFornecedorLimpo = (f.cnpj ?? '').replace(/[^0-9]/g, '')
      const cpfFornecedorLimpo = (f.cpf ?? '').replace(/[^0-9]/g, '')
      return cnpjFornecedorLimpo === documentoLimpo || cpfFornecedorLimpo === documentoLimpo
    })

    // Se encontrou match exato por documento, retorna imediatamente —
    // este é o critério mais forte, não precisa continuar para o fallback
    if (matchExato) {
      return {
        fornecedorId: matchExato.id,
        autoCriado: false,
        criterioMatch: 'cnpj_cpf_exato',
      }
    }
  }

  // ── Passo 2: fallback por nome/razão social + endereço ──
  // Usado quando o CNPJ/CPF está ausente/mascarado no documento, ou
  // quando não bateu nenhum registro exato no passo 1
  const { data: candidatosPorNome, error: erroNome } = await supabaseAdmin
    .from('fornecedores')
    .select('id, razao, fantasia, cnpj, cpf, end')
    .or(`razao.ilike.%${favorecido.nome}%,fantasia.ilike.%${favorecido.nome}%`)

  if (erroNome) {
    throw new Error(`Falha ao buscar fornecedor por nome: ${erroNome.message}`)
  }

  // Se houver candidatos por nome, verifica se o endereço também bate
  // (quando disponível) para reforçar a confiança do match
  if (candidatosPorNome && candidatosPorNome.length > 0) {
    // Se só houver 1 candidato e o endereço bater (ou não houver endereço
    // extraído para comparar), considera encontrado por nome
    const candidatoUnico = candidatosPorNome.length === 1 ? candidatosPorNome[0] : null

    if (candidatoUnico) {
      const enderecoBate =
        !favorecido.endereco || // se não temos endereço extraído, não bloqueia o match
        (candidatoUnico.end ?? '').toLowerCase().includes(favorecido.endereco.toLowerCase().slice(0, 15))

      if (enderecoBate) {
        return {
          fornecedorId: candidatoUnico.id,
          autoCriado: false,
          criterioMatch: 'nome_endereco_fallback',
        }
      }
    }

    // Mais de 1 candidato, ou endereço não bateu — não escolhe
    // arbitrariamente um deles. Segue para a criação automática abaixo,
    // mas sinaliza possivelDuplicado para a UI alertar o usuário
    // (a spec pede aviso, não bloqueio, nesse caso)
    const novoFornecedorId = await criarFornecedorAutomaticamente(supabaseAdmin, favorecido)
    return {
      fornecedorId: novoFornecedorId,
      autoCriado: true,
      criterioMatch: null,
      possivelDuplicado: true, // já existiam candidatos com nome parecido — alerta, não bloqueia
    }
  }

  // ── Passo 3: nenhum candidato em nenhum dos dois passos — CRIA automaticamente ──
  // Diferente do fluxo de teste (que parava aqui e pedia revisão manual),
  // o fluxo oficial cria o fornecedor direto, mesmo com dados incompletos
  const novoFornecedorId = await criarFornecedorAutomaticamente(supabaseAdmin, favorecido)
  return {
    fornecedorId: novoFornecedorId,
    autoCriado: true,
    criterioMatch: null,
  }
}

// ------------------------------------------------------------
// Função auxiliar: criarFornecedorAutomaticamente
// Insere um novo registro em fornecedores (produção) com os dados
// disponíveis no favorecido extraído — SEM esperar revisão manual,
// conforme requisito explícito da spec oficial (diferente do protótipo).
// Campos ausentes ficam undefined/omitidos — a UI de Despesas deve
// avisar que o cadastro está incompleto e precisa ser revisado depois.
// ------------------------------------------------------------
async function criarFornecedorAutomaticamente(
  supabaseAdmin: SupabaseClient,
  favorecido: Favorecido,
): Promise<number> {
  // Monta o payload de inserção com o mínimo de dados disponíveis —
  // razao é o único campo obrigatório do módulo Fornecedores
  const novoFornecedor: FornecedorInsert = {
    razao: favorecido.nome, // razão social, extraída literalmente
    end: favorecido.endereco ?? undefined, // endereço, se disponível
    ...separarCnpjCpf(favorecido.cnpjCpf), // grava em cnpj OU cpf, conforme contagem de dígitos
    observacoes: 'Criado automaticamente pelo módulo Despesas — dados incompletos, revisar cadastro.',
  }

  // Insere e recupera o id gerado — necessário para vincular a Despesa
  const { data, error } = await supabaseAdmin
    .from('fornecedores')
    .insert(novoFornecedor)
    .select('id')
    .single()

  // Se a criação falhar, propaga o erro — sem fornecedor_id não é
  // possível persistir a Despesa (fornecedor_id é NOT NULL)
  if (error || !data) {
    throw new Error(`Falha ao criar fornecedor automaticamente: ${error?.message ?? 'sem retorno do insert'}`)
  }

  return data.id
}
