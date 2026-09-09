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

// QA fix (achado Médio #6): reaproveita a comparação de endereço por
// token (normaliza acentos/pontuação e exige 2+ palavras em comum) já
// validada em classificadorOrigemDespesa.ts, em vez de duplicar a lógica
// ou manter a heurística antiga de 15 caracteres fixos
// FEATURE (Bloco 4 — bug fix do match por nome): normalizarEndereco()
// também é reaproveitada aqui para nomes de fornecedor — a função em si
// é genérica (remove acento/pontuação, apesar do nome), não específica
// de endereço; evita duplicar a mesma lógica de normalização duas vezes
import { enderecosBatem as enderecosCoincidemPorToken, normalizarEndereco } from './classificadorOrigemDespesa'

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
// QA fix (achado Alto #5 — Relatorio_Auditoria_Modulo_Despesas.md):
// Função: escaparParaFiltroOr
// O método .or() do PostgREST usa vírgula como separador de condições e
// parênteses para agrupamento — um valor extraído literalmente (razão
// social brasileira comum: "ACME COMÉRCIO LTDA (MATRIZ)", ou nomes com
// vírgula) quebra a sintaxe do filtro ou é interpretado como agrupamento
// não pretendido. O PostgREST reconhece "\" como caractere de escape
// dentro do valor de um filtro — escapamos vírgula, parênteses e a
// própria barra invertida antes de montar a string do .or().
// ------------------------------------------------------------
// EXPORTADA a partir desta sessão — reaproveitada por
// lib/relatorios/rankingProdutos.ts (busca de produto por descrição
// OU código de barras no drill-down, Seção 2 do relatório 2.10).
// Mesmo raciocínio: valor de descrição de produto real já visto em
// produção contém vírgula (ex: "CAIXA SPRAY AMARELO 3,5MM 500G"),
// quebraria o filtro .or() sem este escape
export function escaparParaFiltroOr(valor: string): string {
  return valor
    .replace(/\\/g, '\\\\') // escapa a barra invertida primeiro, para não escapar duplamente os próximos
    .replace(/,/g, '\\,') // escapa vírgula (separador de condições no .or())
    .replace(/\(/g, '\\(') // escapa parêntese de abertura (agrupamento no .or())
    .replace(/\)/g, '\\)') // escapa parêntese de fechamento
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
    // BUG FIX (achado real de uso — caso COPEi/COPEL): nenhuma das 3
    // queries deste arquivo filtrava fornecedores soft-deletados. Isso
    // permitia que, depois do usuário excluir um fornecedor criado
    // errado (ex: "COPEi", erro de leitura da IA), uma futura importação
    // do MESMO favorecido ainda pudesse casar contra esse registro já
    // excluído — reaproveitando um fornecedor_id morto em vez de achar o
    // fornecedor correto já recadastrado, ou criar um novo do zero.
    const { data: candidatosPorDocumento, error: erroDocumento } = await supabaseAdmin
      .from('fornecedores')
      .select('id, razao, fantasia, cnpj, cpf, end')
      .is('deleted_at', null)
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
  //
  // BUG FIX (achado real de uso — caso COPEi/COPEL): a busca antiga usava
  // o NOME INTEIRO extraído como padrão do ILIKE — exigindo que a string
  // completa aparecesse literalmente dentro de razao/fantasia. Uma
  // diferença de pontuação em QUALQUER ponto do nome (ex: favorecido
  // extraído como "COPEL DISTRIBUICAO S A", cadastro já existente como
  // "COPEL DISTRIBUICAO S.A." — o ponto entre S e A quebra a
  // correspondência) fazia a query voltar 0 candidatos, pulando direto
  // para a criação automática de um fornecedor duplicado. Agora a query
  // SQL usa só a primeira palavra significativa como uma rede mais larga
  // (sempre vai casar, já que o próprio nome do fornecedor começa com
  // ela), e a decisão de fato — o candidato realmente corresponde? — é
  // feita comparando nomes NORMALIZADOS (sem acento/pontuação) em JS,
  // mesmo princípio já usado para o endereço (enderecosCoincidemPorToken).
  const primeiraPalavraNome = favorecido.nome.trim().split(/\s+/).find((p) => p.length >= 3) ?? favorecido.nome.trim()
  const primeiraPalavraEscapada = escaparParaFiltroOr(primeiraPalavraNome)
  const { data: candidatosBrutos, error: erroNome } = await supabaseAdmin
    .from('fornecedores')
    .select('id, razao, fantasia, cnpj, cpf, end')
    .is('deleted_at', null)
    .or(`razao.ilike.%${primeiraPalavraEscapada}%,fantasia.ilike.%${primeiraPalavraEscapada}%`)

  if (erroNome) {
    throw new Error(`Falha ao buscar fornecedor por nome: ${erroNome.message}`)
  }

  // Filtra os candidatos brutos (que só bateram na primeira palavra) por
  // comparação de nome NORMALIZADA — remove acento/pontuação dos dois
  // lados antes de comparar, então "S A" e "S.A." batem como o mesmo texto
  const nomeFavorecidoNormalizado = normalizarEndereco(favorecido.nome)
  const candidatosPorNome = (candidatosBrutos ?? []).filter((c) => {
    const razaoNormalizada = c.razao ? normalizarEndereco(c.razao) : ''
    const fantasiaNormalizada = c.fantasia ? normalizarEndereco(c.fantasia) : ''
    return (
      (razaoNormalizada && (razaoNormalizada.includes(nomeFavorecidoNormalizado) || nomeFavorecidoNormalizado.includes(razaoNormalizada))) ||
      (fantasiaNormalizada && (fantasiaNormalizada.includes(nomeFavorecidoNormalizado) || nomeFavorecidoNormalizado.includes(fantasiaNormalizada)))
    )
  })

  // Se houver candidatos por nome, verifica se o endereço também bate
  // (quando disponível) para reforçar a confiança do match
  if (candidatosPorNome && candidatosPorNome.length > 0) {
    // Se só houver 1 candidato e o endereço bater (ou não houver endereço
    // extraído para comparar), considera encontrado por nome
    const candidatoUnico = candidatosPorNome.length === 1 ? candidatosPorNome[0] : null

    if (candidatoUnico) {
      // FEATURE (Bloco 4, refinamento sobre a correção acima): quando o
      // nome normalizado do único candidato é EXATAMENTE igual ao nome
      // do favorecido (não só "contém"), esse já é um sinal forte o
      // bastante sozinho — não exige mais confirmação de endereço.
      // Motivo prático: concessionárias/utilities frequentemente emitem
      // a fatura com o endereço da UNIDADE CONSUMIDORA (ex: "Av dos
      // Palmares, 831"), diferente do endereço cadastrado da própria
      // empresa em Fornecedores (ex: sede/escritório) — exigir os dois
      // baterem nesse caso reintroduziria o mesmo tipo de falso negativo
      // que este bloco inteiro foi escrito para corrigir.
      const candidatoRazaoNormalizada = candidatoUnico.razao ? normalizarEndereco(candidatoUnico.razao) : ''
      const candidatoFantasiaNormalizada = candidatoUnico.fantasia ? normalizarEndereco(candidatoUnico.fantasia) : ''
      const nomeExatamenteIgual =
        candidatoRazaoNormalizada === nomeFavorecidoNormalizado ||
        candidatoFantasiaNormalizada === nomeFavorecidoNormalizado

      // QA fix (achado Médio #6): a heurística antiga comparava apenas os
      // 15 primeiros caracteres do endereço extraído contra o endereço
      // cadastrado — prefixos genéricos como "Rua "/"Avenida " fazem essa
      // comparação bater mesmo entre ruas totalmente diferentes. Agora
      // normaliza (remove acentos/pontuação) e compara por sobreposição
      // de tokens significativos (3+ caracteres), exigindo pelo menos 2
      // tokens em comum entre os dois endereços.
      const enderecoBate =
        nomeExatamenteIgual || // nome idêntico já é confiança suficiente, ver comentário acima
        !favorecido.endereco || // se não temos endereço extraído, não bloqueia o match
        (candidatoUnico.end ? enderecosCoincidemPorToken(favorecido.endereco, candidatoUnico.end) : false)

      if (enderecoBate) {
        return {
          fornecedorId: candidatoUnico.id,
          autoCriado: false,
          // Distingue na trilha de auditoria: nome exato (mais forte,
          // não precisou do endereço) vs. nome parcial + endereço batendo
          criterioMatch: nomeExatamenteIgual ? 'nome_exato_fallback' : 'nome_endereco_fallback',
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
