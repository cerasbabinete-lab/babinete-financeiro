// ============================================================
// lib/despesas/beneficiariosRoster.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Despesas
// Função: Ler o roster de beneficiários pessoais (sócios + prestador
//         MEI) a partir da tabela de produção beneficiarios_pessoais,
//         e resolver aliases documentados (ex: "Eldo Aquotte Me" =
//         Ceras Babinete; "Eldo Aquotte" = residência da família Aquotti;
//         "Aquotte"/"Aquotti" = mesma família, variação de grafia)
// Conecta com: tabela beneficiarios_pessoais (Supabase, client admin
//              recebido por parâmetro — instanciado pela rota chamadora,
//              mesmo padrão de pages/api/boleto.ts), tipo
//              BeneficiarioPessoalRoster (types/despesas.ts), consumido
//              por classificadorOrigemDespesa.ts na classificação automática
// Referência: Especificacao_Modulo_Despesas.md §5, "origemDespesa
//             Auto-Classification" — aliases documentados como exceções
//             de negócio, não fuzzy-match genérico
// ============================================================

// Tipo do client Supabase — usado para tipar o parâmetro recebido,
// nunca instanciado neste arquivo (quem cria é a rota chamadora)
import type { SupabaseClient } from '@supabase/supabase-js'

// Importa o tipo do registro do roster, definido na camada de tipos
import type { BeneficiarioPessoalRoster } from '@/types/despesas'

// ------------------------------------------------------------
// CONSTANTE: aliases especiais documentados manualmente na spec.
// Não ficam na coluna "aliases" de cada linha do roster porque não
// mapeiam 1-para-1 para uma única pessoa — são regras de negócio
// específicas, centralizadas aqui como exceções documentadas, não
// como fuzzy-match genérico (Handoff, seção 3.4, item 1)
// ------------------------------------------------------------
export const ALIASES_ESPECIAIS_DOCUMENTADOS = {
  // "Eldo Aquotte Me" é o nome antigo/desatualizado usado pela imobiliária
  // para se referir à própria Ceras Babinete Ltda. ME (nunca corrigido
  // apesar de pedidos repetidos) — CNPJ é sempre a fonte de verdade
  eldoAquotteMe: {
    aliasTexto: 'Eldo Aquotte Me',
    resolveComo: 'empresa', // resolve para origemDespesa.tipo = 'empresarial'
    cnpjResolvido: '10.666.614/0001-60',
  },
  // "Eldo Aquotte" (sem "Me") refere-se ao antigo proprietário falecido —
  // por convenção do negócio, documentos sob este nome referem-se à
  // residência da família onde Darci e/ou Sheli Aquotti moram atualmente
  eldoAquotte: {
    aliasTexto: 'Eldo Aquotte',
    resolveComo: 'residencia_familia', // resolve para origemDespesa.tipo = 'pessoal_socio'
  },
  // Variações de grafia do sobrenome da família, causadas por um erro
  // histórico de registro em cartório — tratadas como equivalentes,
  // nunca como duas pessoas/entidades diferentes
  variacoesGrafiaSobrenome: ['Aquotte', 'Aquotti'],
} as const

// ------------------------------------------------------------
// Função: buscarRosterBeneficiarios
// Lê todas as linhas da tabela beneficiarios_pessoais (produção) no
// Supabase e retorna como array tipado, pronto para uso na classificação
// de origemDespesa (matching por nome/CPF/alias)
// ------------------------------------------------------------
export async function buscarRosterBeneficiarios(
  supabaseAdmin: SupabaseClient, // client admin já instanciado pela rota chamadora
): Promise<BeneficiarioPessoalRoster[]> {

  // Executa a query na tabela beneficiarios_pessoais (produção),
  // selecionando todas as colunas relevantes para o matching
  // QA fix (achado Alto #1): inclui a coluna "endereco", necessária para
  // o sinal "endereço" comparar de fato contra o endereço de cada
  // beneficiário, em vez de apenas checar presença de texto
  const { data, error } = await supabaseAdmin
    .from('beneficiarios_pessoais') // tabela de produção — criada no item 1 do build
    .select('id, nome, cpf, vinculo, aliases, endereco') // colunas necessárias para a classificação
    .order('nome', { ascending: true }) // ordena por nome apenas para leitura/debug mais legível

  // Se a query falhar (ex: tabela inacessível, erro de rede),
  // propaga o erro para quem chamou tratar (API route de processamento)
  if (error) {
    // Lança um erro tipado, seguindo a convenção catch (err: unknown) do projeto
    throw new Error(`Falha ao buscar roster de beneficiários: ${error.message}`)
  }

  // Mapeia o retorno bruto do Supabase para o formato tipado
  // BeneficiarioPessoalRoster, garantindo que "aliases" nunca seja null
  // (mesmo que a coluna venha vazia do banco, retornamos array vazio)
  return (data ?? []).map((linha) => ({
    id: linha.id, // UUID da linha, usado apenas para referência/debug
    nome: linha.nome, // nome completo do beneficiário (ex: "Darci de Almeida Aquotti")
    cpf: linha.cpf, // CPF do beneficiário, pode ser null se não cadastrado
    vinculo: linha.vinculo, // "socio" ou "prestador_mei"
    aliases: linha.aliases ?? [], // lista de apelidos cadastrados na linha, nunca null
    endereco: linha.endereco ?? null, // QA fix (achado Alto #1): endereço cadastrado do beneficiário, para comparação real no sinal "endereço"
  }))
}

// ------------------------------------------------------------
// Função: resolverAliasEspecial
// Verifica se um nome extraído do documento corresponde a algum dos
// aliases especiais documentados (Eldo Aquotte Me / Eldo Aquotte /
// Aquotte / Aquotti), aplicando normalização simples de caixa e espaços.
// Chamada ANTES do matching genérico contra o roster, pois estas são
// exceções de negócio documentadas, não fuzzy match.
// ------------------------------------------------------------
export function resolverAliasEspecial(
  nomeExtraido: string, // nome literal extraído do documento pela IA/parser
): { tipo: 'empresa' | 'residencia_familia' | 'nenhum'; cnpjResolvido?: string } {

  // Normaliza o nome extraído para comparação: remove espaços extras
  // nas pontas e converte para minúsculas (comparação case-insensitive)
  const nomeNormalizado = nomeExtraido.trim().toLowerCase()

  // Verifica primeiro o alias mais específico: "Eldo Aquotte Me"
  // (precisa vir antes de "Eldo Aquotte" para não ser capturado pelo caso genérico)
  if (nomeNormalizado.includes('eldo aquotte me')) {
    return {
      tipo: 'empresa', // resolve para origemDespesa.tipo = 'empresarial'
      cnpjResolvido: ALIASES_ESPECIAIS_DOCUMENTADOS.eldoAquotteMe.cnpjResolvido,
    }
  }

  // Verifica o alias "Eldo Aquotte" (sem "Me") — residência da família
  if (nomeNormalizado.includes('eldo aquotte')) {
    return {
      tipo: 'residencia_familia', // resolve para origemDespesa.tipo = 'pessoal_socio'
    }
  }

  // QA fix (achado Crítico #2 — Relatorio_Auditoria_Modulo_Despesas.md):
  // O curto-circuito genérico abaixo foi REMOVIDO. Ele tratava qualquer
  // nome contendo a substring "aquott" (Aquotte/Aquotti) como o caso
  // documentado "Eldo Aquotte" (residência da família) — mas Darci, Fabio
  // e Sheli de Almeida Aquotti também contêm essa substring em seus
  // próprios nomes completos, então QUALQUER despesa em nome de qualquer
  // um dos três sócios caía aqui e era atribuída ao PRIMEIRO beneficiário
  // do roster com "aquott" em seus aliases (ordem alfabética) — nunca ao
  // sócio correto de fato mencionado no documento.
  //
  // A regra documentada em ALIASES_ESPECIAIS_DOCUMENTADOS.variacoesGrafiaSobrenome
  // continua existindo como referência de negócio (mesma família, erro de
  // cartório), mas a normalização Aquotte/Aquotti deve ocorrer DENTRO do
  // roster (cada sócio com ambas as grafias cadastradas em sua própria
  // coluna "aliases"), e ser testada pelo loop normal de 3-de-4 sinais em
  // classificadorOrigemDespesa.ts — que já compara o nome do favorecido
  // contra o nome/aliases de CADA beneficiário individualmente, discriminando
  // corretamente entre os três sócios em vez de escolher o primeiro da lista.
  //
  // O caso "Eldo Aquotte" (proprietário falecido, sem "Me") continua
  // resolvido acima como exceção documentada específica — apenas o
  // curto-circuito genérico do sobrenome sozinho foi removido.

  // Nenhum alias especial reconhecido — segue para o matching genérico
  // contra o roster (nome exato, CPF, ou aliases cadastrados por linha)
  return { tipo: 'nenhum' }
}
