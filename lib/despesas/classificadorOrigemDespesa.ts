// ============================================================
// lib/despesas/classificadorOrigemDespesa.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Despesas
// Função: Classificar deterministicamente se uma despesa é "empresarial"
//         ou "pessoal_socio", aplicando a regra obrigatória de negócio:
//         match exato por CNPJ/CPF, OU pelo menos 3 de 4 sinais de
//         fallback concordando — NUNCA "chutar" quando os sinais não bastam.
// Conecta com: lib/despesas/beneficiariosRoster.ts (roster +
//              resolverAliasEspecial), types/despesas.ts (Favorecido,
//              OrigemDespesa, ResultadoOrigemDespesaClassificacaoDespesa),
//              consumido por pages/api/despesas/importar-xml.ts e
//              pages/api/despesas/importar-documento.ts
// Referência: Especificacao_Modulo_Despesas.md §5, "origemDespesa
//             Auto-Classification" — nunca classificar automaticamente
//             com sinais insuficientes
//
// IMPORTANTE: a sugestão da IA (origemIaSugestao, vinda do Gemini) é
// usada aqui APENAS como possível componente do sinal "nome/alias" —
// nunca decide sozinha, e nunca substitui a regra de 3-de-4 sinais.
// ============================================================

// Tipo do client Supabase — usado para tipar o parâmetro repassado
// para buscarRosterBeneficiarios, nunca instanciado neste arquivo
import type { SupabaseClient } from '@supabase/supabase-js'

// Importa as funções de roster e resolução de aliases especiais
import { buscarRosterBeneficiarios, resolverAliasEspecial } from './beneficiariosRoster'

// Importa os tipos usados nesta função
import type {
  CategoriaFinanceira,
  Favorecido,
  OrigemDespesa,
  ResultadoOrigemDespesaClassificacaoDespesa,
} from '@/types/despesas'

// ------------------------------------------------------------
// CONSTANTE: CNPJ da própria empresa, usado no match exato
// ------------------------------------------------------------
const CNPJ_CERAS_BABINETE = '10.666.614/0001-60'

// ------------------------------------------------------------
// QA fix (achado Alto #1 — Relatorio_Auditoria_Modulo_Despesas.md):
// Função: normalizarEndereco
// Normaliza um endereço para comparação: remove acentos (NFD, mesmo
// princípio já usado em normalizarCidade() no restante do projeto para
// tolerância a acentuação), converte para minúsculas, remove pontuação
// e espaços redundantes. Usada para comparar de fato o endereço do
// documento contra o endereço cadastrado de cada beneficiário, em vez de
// apenas checar se ambos os lados têm "algum" texto de endereço.
// ------------------------------------------------------------
export function normalizarEndereco(endereco: string): string {
  return endereco
    .normalize('NFD') // separa acentos dos caracteres base (ex: "á" → "a" + acento)
    .replace(/[\u0300-\u036f]/g, '') // remove os acentos já separados
    .toLowerCase() // comparação case-insensitive
    .replace(/[.,\-/º°]/g, ' ') // remove pontuação comum em endereços brasileiros
    .replace(/\s+/g, ' ') // colapsa espaços múltiplos em um só
    .trim()
}

// ------------------------------------------------------------
// QA fix (achado Alto #1): Função: enderecosBatem
// Compara dois endereços já normalizados por sobreposição de tokens
// (palavras com 3+ caracteres, para ignorar preposições como "de"/"da"),
// exigindo que pelo menos 2 tokens significativos coincidam — evita que
// prefixos genéricos como "rua"/"avenida" sozinhos gerem falso positivo,
// e permite reconhecer o mesmo endereço mesmo com pequenas variações de
// grafia/abreviação entre o documento e o cadastro do beneficiário.
// ------------------------------------------------------------
export function enderecosBatem(enderecoDocumento: string, enderecoBeneficiario: string): boolean {
  const tokensDocumento = new Set(
    normalizarEndereco(enderecoDocumento).split(' ').filter((t) => t.length >= 3),
  )
  const tokensBeneficiario = normalizarEndereco(enderecoBeneficiario).split(' ').filter((t) => t.length >= 3)

  // Conta quantos tokens do endereço do beneficiário aparecem também no
  // endereço do documento
  const tokensCoincidentes = tokensBeneficiario.filter((t) => tokensDocumento.has(t)).length

  return tokensCoincidentes >= 2
}

// ------------------------------------------------------------
// TIPO: entrada auxiliar — sinais de fallback além do "favorecido" já
// presente no documento extraído. Nem todo documento terá todos esses
// campos (dependem da categoria), então todos são opcionais/nuláveis.
// ------------------------------------------------------------
export interface SinaisFallbackOrigemDespesa {
  enderecoDocumento:              string | null // endereço extraído (favorecido.endereco ou unidade consumidora)
  unidadeConsumidoraOuMatricula:  string | null // código de unidade consumidora (utilidades) ou matrícula (tributos)
  cpfParcialDocumento:            string | null // dígitos parciais de CPF, quando disponíveis (só desempate)
  sugestaoIA:                     { tipoSugerido: string; nomeBeneficiarioMencionado: string | null } | null // sugestão do Gemini
}

// ------------------------------------------------------------
// Função: extrairSinaisFallbackDeDocumento
// Monta os 4 sinais de fallback (nome/alias já vem do próprio favorecido,
// então aqui só endereço/unidade consumidora/CPF parcial/sugestão IA) a
// partir do documento já extraído (XML ou IA) — reaproveitada por
// pages/api/despesas/importar-xml.ts e importar-documento.ts, evitando
// duplicar essa lógica de montagem nas duas rotas.
// ------------------------------------------------------------
export function extrairSinaisFallbackDeDocumento(
  documento: {
    favorecido: Favorecido
    extensaoCategoria: {
      concessionariasUtilidades?: { codigoClienteUnidade: string | null; enderecoUnidadeConsumidora: string | null }
      tributosEstadualMunicipal?: { identificadorBem: string | null }
    }
    origemIaSugestao?: { tipoSugerido: string; nomeBeneficiarioMencionado: string | null } | null
  },
): SinaisFallbackOrigemDespesa {
  // Endereço: prioriza o endereço específico da unidade consumidora
  // (utilidades), quando existir, senão usa o endereço geral do favorecido
  const enderecoDocumento =
    documento.extensaoCategoria.concessionariasUtilidades?.enderecoUnidadeConsumidora ||
    documento.favorecido.endereco ||
    null

  // Unidade consumidora ou matrícula: vem do bloco de extensão específico
  // da categoria (utilidades usa codigoClienteUnidade; tributos usa
  // identificadorBem — placa/matrícula). Categorias sem esses blocos
  // (ex: compra_mercadoria_insumo, servicos_profissionais) retornam null,
  // o que é esperado — nem todo documento tem esse sinal disponível.
  const unidadeConsumidoraOuMatricula =
    documento.extensaoCategoria.concessionariasUtilidades?.codigoClienteUnidade ||
    documento.extensaoCategoria.tributosEstadualMunicipal?.identificadorBem ||
    null

  // CPF parcial: este projeto não extrai CPF parcial separadamente do
  // cnpjCpf do favorecido — quando o documento vier de pessoa física
  // com CPF mascarado, cnpjCpf já chega null do parser/IA (ver regra de
  // extração literal), então não há dígito parcial disponível aqui
  const cpfParcialDocumento: string | null = null

  return {
    enderecoDocumento,
    unidadeConsumidoraOuMatricula,
    cpfParcialDocumento,
    sugestaoIA: documento.origemIaSugestao ?? null,
  }
}

// ------------------------------------------------------------
// Função: classificarOrigemDespesa
// Implementa a lógica de 2 passos (Especificacao_Modulo_Despesas.md §5):
//   1. Match exato de CNPJ/CPF contra empresa ou roster → classifica direto
//   2. Sem match exato → exige 3 de 4 sinais concordando (nome/alias,
//      endereço, unidade consumidora/matrícula, CPF parcial como desempate)
//      → senão, marca para revisão manual (nunca adivinha)
//
// REGRA DE EXCEÇÃO (validada com documento real durante a etapa de
// prototipagem): documentos de categoriaFinanceira "servicos_profissionais"
// emitidos pelo prestador MEI (Maycon) são SEMPRE "empresarial" — é a
// contrapartida do serviço prestado à empresa, não um benefício pessoal.
// O vínculo "pessoal_socio" de Maycon só se aplica à guia de IRPF dele
// especificamente, sob a categoria "contabilidade". Por isso, beneficiários
// com vinculo "prestador_mei" são EXCLUÍDOS do loop de matching quando a
// categoria for "servicos_profissionais".
// ------------------------------------------------------------
export async function classificarOrigemDespesa(
  supabaseAdmin: SupabaseClient, // client admin já instanciado pela rota chamadora
  favorecido: Favorecido, // bloco favorecido do documento extraído (nome, cnpjCpf, endereco)
  categoriaFinanceira: CategoriaFinanceira, // necessário para aplicar a regra de exceção do Maycon/MEI acima
  sinaisFallback: SinaisFallbackOrigemDespesa, // sinais adicionais extraídos, quando disponíveis
): Promise<{ origemDespesa: OrigemDespesa; resultado: ResultadoOrigemDespesaClassificacaoDespesa }> {

  // ── Passo 0: verifica os aliases especiais documentados primeiro ──
  // (Eldo Aquotte Me / Eldo Aquotte / Aquotte / Aquotti) — exceções de
  // negócio, resolvidas antes de qualquer outra lógica
  const aliasEspecial = resolverAliasEspecial(favorecido.nome)

  if (aliasEspecial.tipo === 'empresa') {
    // "Eldo Aquotte Me" → resolve para a própria Ceras Babinete
    return {
      origemDespesa: { tipo: 'empresarial', beneficiarioPessoal: null },
      resultado: { status: 'auto_classificado', criteriosBatidos: ['alias_especial_empresa'] },
    }
  }

  // Busca o roster de beneficiários pessoais (sócios + Maycon/MEI),
  // usando o client Supabase já instanciado pela rota chamadora
  const roster = await buscarRosterBeneficiarios(supabaseAdmin)

  // QA fix (achado Médio #4 — Relatorio_Auditoria_Modulo_Despesas.md):
  // este bloco de "residencia_familia" foi movido para ANTES da exceção
  // MEI/servicos_profissionais, casando com a ordem documentada no
  // Handoff §3.4 (todos os aliases documentados resolvidos primeiro,
  // depois a exceção MEI). Colisão real entre os dois é improvável
  // (nomes envolvidos são diferentes — "Maycon Luiz Malaquias" vs.
  // família Aquotti), mas a ordem agora reflete exatamente o que foi
  // validado e descrito como comportamento correto.
  if (aliasEspecial.tipo === 'residencia_familia') {
    // "Eldo Aquotte" (sem "Me") → residência da família — vincula ao
    // primeiro sócio do roster com esse alias cadastrado (Darci ou
    // Sheli). Após o fix do achado Crítico #2, este ramo só é alcançado
    // para o caso documentado específico ("Eldo Aquotte"), nunca mais
    // para o sobrenome genérico da família (que agora cai no loop normal
    // de 3-de-4 sinais, discriminando corretamente entre os três sócios).
    const beneficiarioFamilia = roster.find((b) =>
      b.aliases.some((a) => a.toLowerCase().includes('aquott')),
    )

    return {
      origemDespesa: {
        tipo: 'pessoal_socio',
        beneficiarioPessoal: beneficiarioFamilia
          ? { nome: beneficiarioFamilia.nome, cpf: beneficiarioFamilia.cpf, vinculo: beneficiarioFamilia.vinculo }
          : null,
      },
      resultado: { status: 'auto_classificado', criteriosBatidos: ['alias_especial_residencia_familia'] },
    }
  }

  // ── Regra de exceção direta: documento de serviços profissionais do
  // prestador MEI (Maycon) é SEMPRE despesa empresarial, com confiança
  // total — não passa pela checagem de 3-de-4 sinais, já que é a
  // contrapartida do serviço prestado à empresa
  if (categoriaFinanceira === 'servicos_profissionais') {
    const prestadorMei = roster.find((b) => b.vinculo === 'prestador_mei')
    const nomeFavorecidoNormalizado = favorecido.nome.toLowerCase()

    // Compara o nome do favorecido contra o nome do prestador MEI
    // cadastrado no roster (ex: "Maycon Luiz Malaquias")
    if (prestadorMei && nomeFavorecidoNormalizado.includes(prestadorMei.nome.toLowerCase())) {
      return {
        origemDespesa: { tipo: 'empresarial', beneficiarioPessoal: null },
        resultado: { status: 'auto_classificado', criteriosBatidos: ['excecao_prestador_mei_servico_profissional'] },
      }
    }
  }

  // ── Passo 1: match exato de CNPJ/CPF ──
  if (favorecido.cnpjCpf) {
    // Compara contra o CNPJ da própria empresa primeiro
    if (favorecido.cnpjCpf === CNPJ_CERAS_BABINETE) {
      return {
        origemDespesa: { tipo: 'empresarial', beneficiarioPessoal: null },
        resultado: { status: 'auto_classificado', criteriosBatidos: ['cnpj_exato_empresa'] },
      }
    }

    // Compara contra o CPF de cada beneficiário do roster — exceto
    // prestadores MEI quando a categoria é servicos_profissionais (ver
    // regra de exceção documentada acima do cabeçalho da função)
    const beneficiarioPorCpfExato = roster.find(
      (b) => b.cpf && b.cpf === favorecido.cnpjCpf && !(b.vinculo === 'prestador_mei' && categoriaFinanceira === 'servicos_profissionais'),
    )
    if (beneficiarioPorCpfExato) {
      return {
        origemDespesa: {
          tipo: 'pessoal_socio',
          beneficiarioPessoal: {
            nome: beneficiarioPorCpfExato.nome,
            cpf: beneficiarioPorCpfExato.cpf,
            vinculo: beneficiarioPorCpfExato.vinculo,
          },
        },
        resultado: { status: 'auto_classificado', criteriosBatidos: ['cpf_exato_roster'] },
      }
    }
  }

  // ── Passo 2: sem match exato — exige 3 de 4 sinais de fallback ──
  // Testa cada beneficiário do roster individualmente, contando quantos
  // dos 4 sinais concordam com aquele beneficiário específico. Exclui
  // prestadores MEI quando a categoria é servicos_profissionais (regra
  // de exceção documentada no cabeçalho desta função).
  const rosterParaTestar = roster.filter(
    (b) => !(b.vinculo === 'prestador_mei' && categoriaFinanceira === 'servicos_profissionais'),
  )

  for (const beneficiario of rosterParaTestar) {
    const criteriosBatidos: string[] = []

    // Sinal 1: nome/alias — nome do favorecido contém o nome do
    // beneficiário ou algum de seus aliases cadastrados
    const nomeFavorecidoNormalizado = favorecido.nome.toLowerCase()
    const nomeBateAlias =
      nomeFavorecidoNormalizado.includes(beneficiario.nome.toLowerCase()) ||
      beneficiario.aliases.some((alias) => nomeFavorecidoNormalizado.includes(alias.toLowerCase()))
    // A sugestão da IA também pode reforçar este mesmo sinal (não conta como sinal extra separado)
    const iaReforcaEsteBeneficiario =
      sinaisFallback.sugestaoIA?.tipoSugerido === 'pessoal_socio' &&
      sinaisFallback.sugestaoIA?.nomeBeneficiarioMencionado
        ?.toLowerCase()
        .includes(beneficiario.nome.toLowerCase())
    if (nomeBateAlias || iaReforcaEsteBeneficiario) {
      criteriosBatidos.push('nome_alias')
    }

    // Sinal 2: endereço — QA fix (achado Alto #1): agora compara de fato
    // o endereço do documento contra o endereço CADASTRADO do beneficiário
    // específico sendo testado (roster.endereco), em vez de só checar se
    // existe algum endereço nos dois lados. Se o beneficiário não tiver
    // endereço cadastrado, este sinal simplesmente não pode bater para ele
    // (comportamento correto: sinal ausente, não sinal "sempre verdadeiro").
    if (sinaisFallback.enderecoDocumento && beneficiario.endereco && enderecosBatem(sinaisFallback.enderecoDocumento, beneficiario.endereco)) {
      criteriosBatidos.push('endereco')
    }

    // Sinal 3: unidade consumidora/matrícula — presente
    if (sinaisFallback.unidadeConsumidoraOuMatricula) {
      criteriosBatidos.push('unidade_consumidora_matricula')
    }

    // Sinal 4: CPF parcial — usado SOMENTE como desempate, nunca conta
    // como um dos 3 sinais obrigatórios (regra explícita da spec)
    const cpfParcialBate =
      sinaisFallback.cpfParcialDocumento &&
      beneficiario.cpf &&
      beneficiario.cpf.includes(sinaisFallback.cpfParcialDocumento)

    // Conta quantos dos 3 sinais PRINCIPAIS bateram (exclui CPF parcial)
    const totalSinaisPrincipaisBatidos = criteriosBatidos.length

    // Só auto-classifica se pelo menos 3 sinais principais concordarem
    if (totalSinaisPrincipaisBatidos >= 3) {
      return {
        origemDespesa: {
          tipo: 'pessoal_socio',
          beneficiarioPessoal: { nome: beneficiario.nome, cpf: beneficiario.cpf, vinculo: beneficiario.vinculo },
        },
        resultado: { status: 'auto_classificado', criteriosBatidos },
      }
    }

    // Caso especial: exatamente 2 sinais principais bateram E o CPF
    // parcial também bate — o CPF parcial funciona como desempate,
    // completando os "3 sinais" exigidos (mas nunca conta sozinho)
    if (totalSinaisPrincipaisBatidos === 2 && cpfParcialBate) {
      return {
        origemDespesa: {
          tipo: 'pessoal_socio',
          beneficiarioPessoal: { nome: beneficiario.nome, cpf: beneficiario.cpf, vinculo: beneficiario.vinculo },
        },
        resultado: { status: 'auto_classificado', criteriosBatidos: [...criteriosBatidos, 'cpf_parcial_desempate'] },
      }
    }
  }

  // ── Nenhum beneficiário atingiu os 3 sinais necessários ──
  // Regra não-negociável: nunca adivinhar, sempre marcar para revisão
  // manual quando os sinais não forem suficientes
  return {
    origemDespesa: { tipo: 'empresarial', beneficiarioPessoal: null }, // valor neutro provisório, sujeito a revisão manual na UI
    resultado: { status: 'revisao_manual', criteriosBatidos: [] },
  }
}
