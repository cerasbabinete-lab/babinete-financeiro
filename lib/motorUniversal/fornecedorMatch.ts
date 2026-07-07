// ============================================================
// lib/motorUniversal/fornecedorMatch.ts
// Página avulsa: Motor Universal de Documentos Financeiros (teste)
// Função: Cruzar o "favorecido" extraído (IA ou parser XML) com a tabela
//         de PRODUÇÃO "fornecedores", para saber se já existe um cadastro
//         ou se precisa exibir o formulário de novo fornecedor.
// Conecta com: lib/motorUniversal/supabaseAdminMotorUniversal.ts (client
//              admin), types/motorUniversal.ts (Favorecido, ResultadoFornecedorMatch),
//              e é consumido por pages/api/teste-motor-universal/processar.ts
// Referência: spec seção 5, "Function: Fornecedor Cross-Reference"
//
// LEITURA APENAS: este arquivo só faz SELECT na tabela fornecedores.
// A escrita (INSERT de novo fornecedor) acontece em confirmar.ts, e só
// depois de revisão manual explícita do usuário — nunca aqui.
// ============================================================

// Importa o helper de client Supabase admin, isolado desta página avulsa
import { getSupabaseAdminMotorUniversal } from './supabaseAdminMotorUniversal'

// Importa os tipos usados nesta função
import type { Favorecido, ResultadoFornecedorMatch } from '@/types/motorUniversal'

// ------------------------------------------------------------
// Função: buscarFornecedorPorCrossReference
// Implementa os 2 passos descritos na spec:
//   1. Busca por CNPJ/CPF (formatado e não-formatado, igual ao padrão já
//      usado em verificarDuplicidadeFornecedor() de fornecedoresService.ts)
//   2. Se não encontrar por documento, cai para fallback por
//      nome/razão social + endereço
// ------------------------------------------------------------
export async function buscarFornecedorPorCrossReference(
  favorecido: Favorecido, // bloco favorecido extraído do JSON Universal
): Promise<ResultadoFornecedorMatch> {
  // Obtém o client admin (ignora RLS, necessário pois a página não tem auth)
  const supabaseAdmin = getSupabaseAdminMotorUniversal()

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
        status: 'encontrado',
        fornecedorId: matchExato.id,
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
  // (quando disponível) para reforçar a confiança do match — a spec pede
  // "pelo menos os campos primários de identificação" (nome + endereço)
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
          status: 'encontrado',
          fornecedorId: candidatoUnico.id,
          criterioMatch: 'nome_endereco_fallback',
        }
      }
    }

    // Mais de 1 candidato, ou endereço não bateu — trata como possível
    // duplicado/ambíguo em vez de escolher arbitrariamente um deles
    return {
      status: 'possivel_duplicado',
      fornecedorId: null,
      criterioMatch: 'nome_multiplos_candidatos',
    }
  }

  // Nenhum candidato encontrado em nenhum dos dois passos —
  // a UI deve exibir o formulário de novo fornecedor
  return {
    status: 'nao_encontrado',
    fornecedorId: null,
    criterioMatch: null,
  }
}
