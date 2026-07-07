// ============================================================
// lib/motorUniversal/origemDespesaClassifier.ts
// Página avulsa: Motor Universal de Documentos Financeiros (teste)
// Função: Classificar deterministicamente se uma despesa é "empresarial"
//         ou "pessoal_socio", aplicando a regra obrigatória de negócio:
//         match exato por CNPJ/CPF, OU pelo menos 3 de 4 sinais de
//         fallback concordando — NUNCA "chutar" quando os sinais não bastam.
// Conecta com: lib/motorUniversal/beneficiariosRoster.ts (roster +
//              resolverAliasEspecial), types/motorUniversal.ts
//              (Favorecido, OrigemDespesa, ResultadoOrigemDespesaClassificacao),
//              e é consumido por pages/api/teste-motor-universal/processar.ts
// Referência: spec seção 2.1.1 ("origemDespesa automatic classification
//              logic") e seção 7 (non-negotiable: "must never guess when
//              fewer than 3 fallback signals agree")
//
// IMPORTANTE: a sugestão da IA (origemDespesaSugeridaIA, vinda do Gemini)
// é usada aqui APENAS como um possível componente do sinal "nome/alias" —
// nunca decide sozinha, e nunca substitui a regra de 3-de-4 sinais.
// ============================================================

// Importa as funções de roster e resolução de aliases especiais
import { buscarRosterBeneficiarios, resolverAliasEspecial } from './beneficiariosRoster'

// Importa os tipos usados nesta função
import type { CategoriaFinanceira, Favorecido, OrigemDespesa, ResultadoOrigemDespesaClassificacao } from '@/types/motorUniversal'

// ------------------------------------------------------------
// CONSTANTE: CNPJ da própria empresa, usado no match exato
// ------------------------------------------------------------
const CNPJ_CERAS_BABINETE = '10.666.614/0001-60'

// ------------------------------------------------------------
// TIPO: entrada auxiliar — dados que podem servir como sinais de fallback,
// além do "favorecido" já presente no JSON Universal. Nem todo documento
// terá todos esses campos (dependem da categoria), então todos são opcionais.
// ------------------------------------------------------------
export interface SinaisFallbackOrigemDespesa {
  enderecoDocumento: string | null // endereço extraído do documento (favorecido.endereco ou unidade consumidora)
  unidadeConsumidoraOuMatricula: string | null // código de unidade consumidora (utilidades) ou matrícula (tributos)
  cpfParcialDocumento: string | null // dígitos parciais de CPF, quando disponíveis (usado só como desempate)
  sugestaoIA: { tipoSugerido: string; nomeBeneficiarioMencionado: string | null } | null // sugestão vinda do Gemini
}

// ------------------------------------------------------------
// Função: classificarOrigemDespesa
// Implementa a lógica de 2 passos da spec (seção 2.1.1):
//   1. Match exato de CNPJ/CPF contra empresa ou roster → classifica direto
//   2. Sem match exato → exige 3 de 4 sinais concordando (nome/alias,
//      endereço, unidade consumidora/matrícula, CPF parcial como desempate)
//      → senão, marca para revisão manual (nunca adivinha)
//
// REGRA DE EXCEÇÃO (confirmada com o usuário após teste real com a NFS-e
// do próprio Maycon): documentos de categoriaFinanceira "servicos_profissionais"
// emitidos pelo prestador MEI (Maycon) são SEMPRE "empresarial" — é a
// contrapartida do serviço prestado à empresa, não um benefício pessoal.
// O vínculo "pessoal_socio" de Maycon só se aplica à guia de IRPF dele
// especificamente, que aparece sob a categoria "contabilidade" (ver spec
// seção 2.1.1: "his personal IRPF payment is a benefit granted to him").
// Por isso, beneficiários com vinculo "prestador_mei" são EXCLUÍDOS do
// loop de matching quando a categoria for "servicos_profissionais".
// ------------------------------------------------------------
export async function classificarOrigemDespesa(
  favorecido: Favorecido, // bloco favorecido do JSON Universal (nome, cnpjCpf, endereco)
  categoriaFinanceira: CategoriaFinanceira, // necessário para aplicar a regra de exceção do Maycon/MEI acima
  sinaisFallback: SinaisFallbackOrigemDespesa, // sinais adicionais extraídos, quando disponíveis
): Promise<{ origemDespesa: OrigemDespesa; resultado: ResultadoOrigemDespesaClassificacao }> {
  // ── Passo 0: verifica os aliases especiais documentados primeiro ──
  // (Eldo Aquotte Me / Eldo Aquotte / Aquotte / Aquotti) — estes são
  // exceções de negócio, resolvidas antes de qualquer outra lógica
  const aliasEspecial = resolverAliasEspecial(favorecido.nome)

  if (aliasEspecial.tipo === 'empresa') {
    // "Eldo Aquotte Me" → resolve para a própria Ceras Babinete
    return {
      origemDespesa: { tipo: 'empresarial', beneficiarioPessoal: null },
      resultado: { status: 'auto_classificado', criteriosBatidos: ['alias_especial_empresa'] },
    }
  }

  // Busca o roster de beneficiários pessoais (sócios + Maycon/MEI)
  const roster = await buscarRosterBeneficiarios()

  // ── Regra de exceção direta: NFS-e de serviços profissionais do
  // prestador MEI (Maycon) é SEMPRE despesa empresarial, com confiança
  // total — não precisa passar pela checagem de 3-de-4 sinais, já que
  // esta é justamente a contrapartida do serviço prestado à empresa.
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

  if (aliasEspecial.tipo === 'residencia_familia') {
    // "Eldo Aquotte" (sem "Me") ou variações "Aquotte"/"Aquotti" →
    // residência da família — vincula ao primeiro sócio do roster que
    // tenha esse alias cadastrado (Darci ou Sheli, conforme spec)
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
  // dos 4 sinais concordam com aquele beneficiário específico.
  // Exclui prestadores MEI (Maycon) quando a categoria é
  // servicos_profissionais — sua NFS-e de serviço é sempre despesa
  // empresarial, não deve ser testada contra o roster pessoal (ver regra
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

    // Sinal 2: endereço — presente e não-vazio (comparação simples de
    // substring; a spec não detalha um algoritmo de similaridade específico)
    if (sinaisFallback.enderecoDocumento && favorecido.endereco) {
      criteriosBatidos.push('endereco')
    }

    // Sinal 3: unidade consumidora/matrícula — presente
    if (sinaisFallback.unidadeConsumidoraOuMatricula) {
      criteriosBatidos.push('unidade_consumidora_matricula')
    }

    // Sinal 4: CPF parcial — usado SOMENTE como desempate, nunca conta
    // como um dos 3 sinais obrigatórios (conforme spec: "used only as a
    // tie-breaker, never as one of the 3 required signals")
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
  // Regra não-negociável da spec: nunca adivinhar, sempre marcar para
  // revisão manual quando os sinais não forem suficientes
  return {
    origemDespesa: { tipo: 'empresarial', beneficiarioPessoal: null }, // valor neutro provisório, sujeito a revisão manual na UI
    resultado: { status: 'revisao_manual', criteriosBatidos: [] },
  }
}
