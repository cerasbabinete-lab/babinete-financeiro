// ============================================================
// lib/pagar/motorConciliacao.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Pagar
// Função: Núcleo do módulo — função pura (sem side-effect de UI),
//         chamada para CADA registro individual extraído por qualquer
//         um dos 3 parsers (Relatório BB, comprovante PDF, comprovante
//         TXT), decidindo o que fazer com aquele pagamento identificado
//         em ordem de prioridade FIXA (Especificação §5, não alterar):
//           1. Roster (beneficiarios_pessoais com regra_conciliacao_pagar)
//           2. Nosso Número (só pagamentos via boleto)
//           3. Fornecedor + valor exato
//           4. Não encontrado
// Conecta com: rosterConciliacaoPagar.ts (passo 1),
//              lib/despesas/fornecedorAutoCreate.ts::buscarOuCriarFornecedor
//              (reaproveitado por espelhamento — mesma função já
//              validada em Despesas, usada aqui para resolver
//              fornecedor_id das despesas sintéticas criadas pelo
//              roster), types/contasAPagar.ts, types/despesas.ts
//              (DespesaInsert/DespesaParcelaInsert — motor cria
//              Despesas novas nos casos roster), pages/api/pagar/
//              importar-relatorio.ts e importar-comprovante.ts
//              (chamadores, um registro por vez)
// Referência: Especificacao_Modulo_Contas_a_Pagar.md, Seção 5,
//             "Function: Motor de Conciliação" (texto completo)
//
// REGRA NÃO-NEGOCIÁVEL (topo da Especificação, item 4): o pagador
// NUNCA é extraído de documento — é sempre PAGADOR_FIXO
// (types/contasAPagar.ts). Este arquivo não lê nem recebe nenhum
// campo "pagador" em nenhuma das suas funções.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  ContaAPagar,
  ContaAPagarInsert,
  FormaBaixaPagar,
  BeneficiarioPessoalRosterPagar,
  OrigemImportacaoPagar,
  ResultadoConciliacaoItem,
} from '@/types/contasAPagar'

import type { DespesaInsert, DespesaParcelaInsert, CategoriaFinanceira, Favorecido } from '@/types/despesas'

// Reaproveita por espelhamento a função já validada em Despesas para
// resolver (buscar ou criar) o fornecedor_id — necessário porque
// despesas.fornecedor_id é NOT NULL, e os beneficiários do roster
// (sócios/prestador MEI) não têm necessariamente um fornecedor
// cadastrado antes da primeira ocorrência (confirmado com Maycon: já
// existem fornecedores para Maycon-CNPJ id=29 e Sheli id=35; Darci,
// Fábio e Maycon-CPF ainda não têm, serão auto-criados na primeira vez)
import { buscarOuCriarFornecedor } from '@/lib/despesas/fornecedorAutoCreate'

import { buscarBeneficiarioRosterPorDocumento } from './rosterConciliacaoPagar'


// ------------------------------------------------------------
// TIPO: registro normalizado de entrada — o formato comum que os 3
// parsers precisam produzir antes de chamar o motor (cada parser tem
// seu próprio shape de saída — RegistroRelatorioBB/RegistroComprovantePdf/
// RegistroComprovanteTxt —, e é responsabilidade da API route chamadora
// normalizar para este shape comum antes de invocar conciliarRegistro)
// ------------------------------------------------------------
export interface RegistroNormalizadoConciliacao {
  nomeFavorecido: string
  cnpjCpf: string | null // formatado ou não — o motor normaliza internamente
  valor: number
  data: string // ISO date do pagamento
  nossoNumero?: string | null // só presente em pagamentos via boleto
  origem: OrigemImportacaoPagar // determina forma_baixa (relatorio_bb | comprovante_individual)
}


// ------------------------------------------------------------
// Função: extrairSomenteDigitos / formatarComoCnpjOuCpf
// Helpers locais duplicados deliberadamente (mesmo padrão de todos os
// outros arquivos deste módulo — cada um auto-contido)
// ------------------------------------------------------------
function extrairSomenteDigitos(valor: string): string {
  return valor.replace(/\D/g, '')
}

function formatarComoCnpjOuCpf(digitos: string): string | null {
  if (digitos.length === 14) return digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  if (digitos.length === 11) return digitos.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  return null
}


// ------------------------------------------------------------
// Função: formaBaixaPelaOrigem
// Mapeia a origem da importação para o valor correto de forma_baixa,
// conforme o enum fechado da Especificação §2.1
// ------------------------------------------------------------
function formaBaixaPelaOrigem(origem: OrigemImportacaoPagar): FormaBaixaPagar {
  return origem === 'relatorio_bb' ? 'relatorio_bb' : 'comprovante_individual'
}


// ------------------------------------------------------------
// Função: registrarEvento
// Insert simples em contas_a_pagar_eventos — tabela apenas-INSERT,
// nunca UPDATE/DELETE (Especificação §2.1)
// ------------------------------------------------------------
async function registrarEvento(
  supabaseAdmin: SupabaseClient,
  tituloId: string,
  tipo: 'criado' | 'baixa_parcial' | 'baixa_total' | 'despesa_complementar_criada',
  descricao: string,
  valorPago: number | null,
): Promise<void> {
  const { error } = await supabaseAdmin.from('contas_a_pagar_eventos').insert({
    titulo_id: tituloId,
    tipo,
    descricao,
    valor_pago: valorPago,
  })
  if (error) {
    throw new Error(`Falha ao registrar evento de contas_a_pagar (${tipo}): ${error.message}`)
  }
}


// ------------------------------------------------------------
// Função: buscarFornecedorPorDocumentoAdmin
// Versão com client admin (parametrizado) da busca por CNPJ/CPF já
// validada em lib/despesasService.ts::buscarFornecedorPorDocumento —
// duplicada aqui porque a original importa o client `supabase` (anon
// key) fixo do módulo, incompatível com o padrão deste módulo de
// receber o client admin por parâmetro (necessário nas rotas
// pages/api/pagar/*.ts, que rodam server-side com privilégio elevado)
// ------------------------------------------------------------
async function buscarFornecedorPorDocumentoAdmin(
  supabaseAdmin: SupabaseClient,
  cpfCnpj: string,
): Promise<{ id: number; razao: string } | null> {
  const digitos = extrairSomenteDigitos(cpfCnpj)
  if (!digitos) return null

  const formatado = formatarComoCnpjOuCpf(digitos)
  const { data, error } = await supabaseAdmin
    .from('fornecedores')
    .select('id, razao, cnpj, cpf')
    .or(
      `cnpj.ilike.%${digitos}%,cpf.ilike.%${digitos}%${formatado ? `,cnpj.ilike.%${formatado}%,cpf.ilike.%${formatado}%` : ''}`,
    )
    .limit(5)

  if (error || !data || data.length === 0) return null

  const match = data.find((f: { cnpj?: string; cpf?: string }) => {
    const cnpjDig = extrairSomenteDigitos(f.cnpj ?? '')
    const cpfDig = extrairSomenteDigitos(f.cpf ?? '')
    return cnpjDig === digitos || cpfDig === digitos
  })

  return match ? { id: match.id, razao: match.razao } : null
}


// ------------------------------------------------------------
// Função: criarDespesaEContaAPagarAutomatica
// Cria uma Despesa + despesas_parcela + contas_a_pagar JÁ BAIXADO
// (status 'pago'), usado tanto para o caso despesa_automatica_baixada
// quanto para os excedentes de holerite_com_abatimento/
// acumulo_ate_valor_integral. Resolve fornecedor_id via
// buscarOuCriarFornecedor (reaproveitado de Despesas).
// ------------------------------------------------------------
async function criarDespesaEContaAPagarAutomatica(
  supabaseAdmin: SupabaseClient,
  beneficiario: BeneficiarioPessoalRosterPagar,
  valor: number,
  dataPagamento: string,
  formaBaixa: FormaBaixaPagar,
  descricaoContexto: string, // texto explicativo — vai para observacoes do título e descrição dos eventos
): Promise<{ despesaId: string; contaAPagarId: string }> {
  // Documento que efetivamente casou nesta linha do roster — cada
  // linha do roster tem só um documento preenchido na prática (ver
  // nota sobre o caso Maycon em types/contasAPagar.ts)
  const documento = beneficiario.cnpj ?? beneficiario.cpf
  if (!documento) {
    throw new Error(`Beneficiário do roster "${beneficiario.nome}" não tem CNPJ nem CPF cadastrado — não é possível criar Despesa automática.`)
  }

  // Validação defensiva — nunca grava categoria/subtipo como null
  // incondicional (padrão incorreto já encontrado e corrigido em
  // Despesas, Relatorio_Auditoria_Modulo_Despesas.md)
  if (!beneficiario.despesa_gerada_categoria) {
    throw new Error(`Beneficiário do roster "${beneficiario.nome}" não tem despesa_gerada_categoria configurada — roster incompleto.`)
  }

  const categoria = beneficiario.despesa_gerada_categoria as CategoriaFinanceira
  const subtipo = beneficiario.despesa_gerada_subtipo

  // Resolve (busca ou cria) o fornecedor correspondente ao beneficiário
  // — reaproveita a função já validada em Despesas, mesmo padrão de
  // busca por documento + fallback nome/endereço + auto-criação
  const favorecido: Favorecido = {
    nome: beneficiario.nome,
    cnpjCpf: documento,
    endereco: beneficiario.endereco,
  }
  const resultadoFornecedor = await buscarOuCriarFornecedor(supabaseAdmin, favorecido)

  // Monta o bloco de extensão de categoria conforme a categoria do
  // roster — só 'contabilidade' e 'servicos_profissionais' são
  // usados pelas regras deste módulo (Especificação §2.1, seed)
  const extensaoCategoria =
    categoria === 'servicos_profissionais'
      ? {
          servicosProfissionais: {
            prestador: { nome: beneficiario.nome, cnpjCpf: documento, regimeMei: true },
            descricaoServico: descricaoContexto,
            chaveAcessoNFSe: null,
            retencoes: { issRetido: 0 },
          },
        }
      : {
          contabilidade: {
            // Subtipo obrigatório para a categoria 'contabilidade' —
            // falha explícita em vez de gravar null incondicional
            subtipo: (subtipo ?? (() => {
              throw new Error(`Beneficiário do roster "${beneficiario.nome}" não tem despesa_gerada_subtipo configurado para categoria contabilidade.`)
            })()) as 'guia_tributo_federal' | 'honorarios_contabeis' | 'folha_pro_labore' | 'retirada_socio' | 'bonus_anual',
            composicaoTributos: null,
            funcionario: null,
            rubricas: null,
            itensHonorarios: null,
          },
        }

  // tipo_documento mais adequado — 'holerite' quando é literalmente
  // um holerite (Sheli), 'recibo' como default genérico para os
  // demais casos sintéticos (retirada de sócio, bônus, NF de serviço
  // já lançada — nenhum dos valores existentes de TipoDocumento
  // descreve exatamente "gerado pelo motor de conciliação")
  const tipoDocumento = subtipo === 'folha_pro_labore' ? 'holerite' : 'recibo'

  const hoje = new Date().toISOString().slice(0, 10)

  // ── Insere a Despesa já com status_pagamento 'pago' — nasce baixada ──
  const novaDespesa: DespesaInsert = {
    tipo_documento: tipoDocumento,
    categoria_financeira: categoria,
    favorecido_nome: beneficiario.nome,
    favorecido_cnpj_cpf: documento,
    favorecido_endereco: beneficiario.endereco,
    fornecedor_id: resultadoFornecedor.fornecedorId,
    fornecedor_auto_criado: resultadoFornecedor.autoCriado,
    origem_tipo: 'pessoal_socio',
    origem_beneficiario_nome: beneficiario.nome,
    origem_beneficiario_cpf: beneficiario.cpf,
    origem_beneficiario_vinculo: beneficiario.vinculo,
    origem_classificacao_status: 'auto_classificado',
    origem_criterios_batidos: ['motor_conciliacao_pagar_roster'],
    origem_ia_sugestao: null,
    documento_numero: null,
    documento_data_emissao: dataPagamento,
    documento_competencia: null,
    valor_original: valor,
    valor_desconto: 0,
    valor_juros_multa: 0,
    valor_total: valor,
    status_pagamento: 'pago',
    extensao_categoria: extensaoCategoria,
    // Novo valor de enum autorizado por Maycon nesta sessão — não
    // existia nenhum valor de OrigemEntradaDespesa que descrevesse
    // "criado automaticamente pelo motor de Contas a Pagar"
    origem_entrada: 'motor_conciliacao_pagar',
  }

  const { data: despesaInserida, error: erroDespesa } = await supabaseAdmin
    .from('despesas')
    .insert(novaDespesa)
    .select('id')
    .single()

  if (erroDespesa || !despesaInserida) {
    throw new Error(`Falha ao criar Despesa automática (motor de conciliação): ${erroDespesa?.message ?? 'sem retorno do insert'}`)
  }

  // ── Insere a parcela única, já paga ──
  const novaParcela: DespesaParcelaInsert = {
    despesa_id: despesaInserida.id,
    numero_parcela: 1,
    total_parcelas: 1,
    valor,
    data_vencimento: dataPagamento, // já nasce paga — usa a data do pagamento como referência
    linha_digitavel: null,
    codigo_barras: null,
    nosso_numero: null,
    pode_gerar_segunda_via: false,
    status: 'pago',
  }

  const { data: parcelaInserida, error: erroParcela } = await supabaseAdmin
    .from('despesas_parcelas')
    .insert(novaParcela)
    .select('id')
    .single()

  if (erroParcela || !parcelaInserida) {
    throw new Error(`Despesa criada, mas falha ao criar parcela automática: ${erroParcela?.message ?? 'sem retorno do insert'}`)
  }

  // ── Insere o título em contas_a_pagar, já baixado ──
  const novoTitulo: ContaAPagarInsert = {
    despesa_parcela_id: parcelaInserida.id,
    despesa_id: despesaInserida.id,
    fornecedor_id: resultadoFornecedor.fornecedorId,
    numero_documento: null,
    data_vencimento: dataPagamento,
    data_processamento: hoje,
    valor,
    nosso_numero: null,
    linha_digitavel: null,
    status: 'pago',
    data_baixa: dataPagamento,
    forma_baixa: formaBaixa,
    favorecido_nome: beneficiario.nome,
    favorecido_cnpj_cpf: documento,
    favorecido_endereco: beneficiario.endereco,
    observacoes: descricaoContexto,
  }

  const { data: tituloInserido, error: erroTitulo } = await supabaseAdmin
    .from('contas_a_pagar')
    .insert(novoTitulo)
    .select('id')
    .single()

  if (erroTitulo || !tituloInserido) {
    throw new Error(`Despesa e parcela criadas, mas falha ao criar contas_a_pagar automático: ${erroTitulo?.message ?? 'sem retorno do insert'}`)
  }

  // ── Registra os 2 eventos de auditoria no título recém-criado ──
  await registrarEvento(supabaseAdmin, tituloInserido.id, 'criado', descricaoContexto, null)
  await registrarEvento(supabaseAdmin, tituloInserido.id, 'baixa_total', descricaoContexto, valor)

  return { despesaId: despesaInserida.id, contaAPagarId: tituloInserido.id }
}


// ------------------------------------------------------------
// Função: processarDespesaAutomaticaBaixada
// Regra do roster 'despesa_automatica_baixada' (Darci, Fábio,
// Maycon-CPF) — SEMPRE cria uma nova Despesa já baixada, 100%
// automático e silencioso, sem aviso de revisão pendente na UI
// (Especificação §7, diferente do padrão de fornecedor auto-criado)
// ------------------------------------------------------------
async function processarDespesaAutomaticaBaixada(
  supabaseAdmin: SupabaseClient,
  beneficiario: BeneficiarioPessoalRosterPagar,
  registro: RegistroNormalizadoConciliacao,
): Promise<ResultadoConciliacaoItem> {
  const formaBaixa = formaBaixaPelaOrigem(registro.origem)
  const descricao = `Pagamento identificado automaticamente para ${beneficiario.nome} (regra de roster: despesa_automatica_baixada) — Despesa criada e baixada diretamente.`

  const { despesaId, contaAPagarId } = await criarDespesaEContaAPagarAutomatica(
    supabaseAdmin,
    beneficiario,
    registro.valor,
    registro.data,
    formaBaixa,
    descricao,
  )

  return { tipo: 'despesa_criada_automaticamente', despesaId, contaAPagarId }
}


// ------------------------------------------------------------
// Função: processarAcumulo
// Regras do roster 'holerite_com_abatimento' (Sheli) e
// 'acumulo_ate_valor_integral' (Maycon-CNPJ) — ambas com o MESMO
// comportamento (Especificação §5, passo 1): busca o título original
// já em aberto vinculado a este documento, acumula o valor pago,
// verifica se fecha o valor total, e trata excedente/anomalia
// ------------------------------------------------------------
async function processarAcumulo(
  supabaseAdmin: SupabaseClient,
  beneficiario: BeneficiarioPessoalRosterPagar,
  registro: RegistroNormalizadoConciliacao,
): Promise<ResultadoConciliacaoItem> {
  const formaBaixa = formaBaixaPelaOrigem(registro.origem)
  const documento = beneficiario.cnpj ?? beneficiario.cpf ?? ''
  const digitosDocumento = extrairSomenteDigitos(documento)
  const formatado = formatarComoCnpjOuCpf(digitosDocumento)

  // Busca o título original em aberto/parcial vinculado a este
  // documento — favorecido_cnpj_cpf é o vínculo usado (contas_a_pagar
  // não tem beneficiario_id, ver Especificação §2.1 modelo de dados),
  // pega o mais antigo em aberto se houver mais de um (default de
  // engenharia — não especificado explicitamente, mas é o critério
  // mais conservador: fecha o título mais antigo primeiro)
  const { data: titulosCandidatos, error: erroTitulos } = await supabaseAdmin
    .from('contas_a_pagar')
    .select('*')
    .in('status', ['em_aberto', 'pago_parcial'])
    .is('deleted_at', null)
    .or(`favorecido_cnpj_cpf.ilike.%${digitosDocumento}%${formatado ? `,favorecido_cnpj_cpf.ilike.%${formatado}%` : ''}`)
    .order('data_vencimento', { ascending: true })
    .limit(1)

  if (erroTitulos) {
    throw new Error(`Falha ao buscar título original para acúmulo (${beneficiario.nome}): ${erroTitulos.message}`)
  }

  const titulo = (titulosCandidatos ?? [])[0] as ContaAPagar | undefined

  // ── Anomalia: nenhum título original em aberto para este beneficiário ──
  // Especificação §5: "trate como anomalia — registra o valor total
  // deste pagamento diretamente como uma nova Despesa complementar já
  // baixada (mesmo comportamento do excedente), já que não há título
  // esperando"
  if (!titulo) {
    const descricaoAnomalia = `Pagamento de ${registro.valor} identificado para ${beneficiario.nome} (regra: ${beneficiario.regra_conciliacao_pagar}), mas nenhum título original em aberto foi encontrado — tratado como Despesa complementar automática (anomalia).`
    const { despesaId, contaAPagarId } = await criarDespesaEContaAPagarAutomatica(
      supabaseAdmin,
      beneficiario,
      registro.valor,
      registro.data,
      formaBaixa,
      descricaoAnomalia,
    )
    return { tipo: 'despesa_criada_automaticamente', despesaId, contaAPagarId }
  }

  // ── Soma os eventos de baixa já registrados neste título ──
  const { data: eventosAnteriores, error: erroEventos } = await supabaseAdmin
    .from('contas_a_pagar_eventos')
    .select('valor_pago')
    .eq('titulo_id', titulo.id)
    .not('valor_pago', 'is', null)

  if (erroEventos) {
    throw new Error(`Falha ao somar eventos de baixa do título ${titulo.id}: ${erroEventos.message}`)
  }

  const somaAnterior = (eventosAnteriores ?? []).reduce((soma, evento) => soma + (evento.valor_pago ?? 0), 0)
  const novaSoma = somaAnterior + registro.valor

  // ── Caso 1: soma ainda menor que o valor do título → baixa parcial ──
  if (novaSoma < titulo.valor - 0.01) {
    const { error: erroUpdate } = await supabaseAdmin
      .from('contas_a_pagar')
      .update({ status: 'pago_parcial' })
      .eq('id', titulo.id)

    if (erroUpdate) {
      throw new Error(`Falha ao atualizar título para pago_parcial (${titulo.id}): ${erroUpdate.message}`)
    }

    await registrarEvento(
      supabaseAdmin,
      titulo.id,
      'baixa_parcial',
      `Baixa parcial de ${registro.valor} recebida via ${registro.origem} — acumulado ${novaSoma} de ${titulo.valor}.`,
      registro.valor,
    )

    return { tipo: 'baixa_automatica', contaAPagarId: titulo.id, formaBaixa }
  }

  // ── Caso 2: soma fecha (ou ultrapassa) o valor do título → baixa total ──
  const { error: erroUpdateTotal } = await supabaseAdmin
    .from('contas_a_pagar')
    .update({ status: 'pago', data_baixa: registro.data, forma_baixa: formaBaixa })
    .eq('id', titulo.id)

  if (erroUpdateTotal) {
    throw new Error(`Falha ao atualizar título para pago (${titulo.id}): ${erroUpdateTotal.message}`)
  }

  await registrarEvento(
    supabaseAdmin,
    titulo.id,
    'baixa_total',
    `Baixa total de ${registro.valor} recebida via ${registro.origem} — título fechado (acumulado ${novaSoma} de ${titulo.valor}).`,
    registro.valor,
  )

  // ── Excedente: valor pago além do valor do título vira Despesa nova ──
  const valorExcedente = Math.round((novaSoma - titulo.valor) * 100) / 100
  let despesaComplementarId: string | undefined

  if (valorExcedente > 0.01) {
    const descricaoExcedente = `Excedente de ${valorExcedente} pago para ${beneficiario.nome} além do valor do título ${titulo.id} — lançado como Despesa complementar automática.`
    const resultadoExcedente = await criarDespesaEContaAPagarAutomatica(
      supabaseAdmin,
      beneficiario,
      valorExcedente,
      registro.data,
      formaBaixa,
      descricaoExcedente,
    )
    despesaComplementarId = resultadoExcedente.contaAPagarId

    // Evento no título ORIGINAL, referenciando o novo título gerado
    // por texto na descrição (Especificação §2.1, tipo evento
    // despesa_complementar_criada)
    await registrarEvento(
      supabaseAdmin,
      titulo.id,
      'despesa_complementar_criada',
      `Excedente de ${valorExcedente} gerou a Despesa complementar / título ${resultadoExcedente.contaAPagarId}.`,
      null,
    )
  }

  return { tipo: 'baixa_automatica', contaAPagarId: titulo.id, formaBaixa, ...(despesaComplementarId ? { despesaComplementarId } : {}) }
}


// ------------------------------------------------------------
// Função: conciliarRegistro (export principal deste arquivo)
// Ponto de entrada único do Motor de Conciliação — recebe um registro
// já normalizado (nomeFavorecido, cnpjCpf, valor, data, nossoNumero?,
// origem) e aplica a ordem de prioridade fixa da Especificação §5.
// ------------------------------------------------------------
export async function conciliarRegistro(
  supabaseAdmin: SupabaseClient,
  registro: RegistroNormalizadoConciliacao,
): Promise<ResultadoConciliacaoItem> {
  const formaBaixa = formaBaixaPelaOrigem(registro.origem)

  // ── PASSO 1: Roster ──────────────────────────────────────
  // Checa CNPJ/CPF separadamente contra o roster (Especificação §5,
  // passo 1) — só tenta se houver documento extraído
  if (registro.cnpjCpf) {
    const beneficiario = await buscarBeneficiarioRosterPorDocumento(supabaseAdmin, registro.cnpjCpf)

    if (beneficiario) {
      if (beneficiario.regra_conciliacao_pagar === 'despesa_automatica_baixada') {
        return processarDespesaAutomaticaBaixada(supabaseAdmin, beneficiario, registro)
      }
      // 'holerite_com_abatimento' e 'acumulo_ate_valor_integral' têm o
      // MESMO comportamento (Especificação §5, passo 1)
      if (
        beneficiario.regra_conciliacao_pagar === 'holerite_com_abatimento' ||
        beneficiario.regra_conciliacao_pagar === 'acumulo_ate_valor_integral'
      ) {
        return processarAcumulo(supabaseAdmin, beneficiario, registro)
      }
    }
    // Não encontrado no roster — segue para o passo 2 (não faz `else`
    // explícito, só continua a execução normalmente)
  }

  // ── PASSO 2: Nosso Número (só pagamentos via boleto) ──────
  if (registro.nossoNumero) {
    const { data: titulosPorNossoNumero, error: erroNossoNumero } = await supabaseAdmin
      .from('contas_a_pagar')
      .select('id')
      .eq('nosso_numero', registro.nossoNumero)
      .eq('status', 'em_aberto')
      .is('deleted_at', null)

    if (erroNossoNumero) {
      throw new Error(`Falha ao buscar título por Nosso Número: ${erroNossoNumero.message}`)
    }

    // Match exato e único — baixa automática direta (Especificação §5, passo 2)
    if (titulosPorNossoNumero && titulosPorNossoNumero.length === 1) {
      const tituloId = titulosPorNossoNumero[0].id

      const { error: erroUpdate } = await supabaseAdmin
        .from('contas_a_pagar')
        .update({ status: 'pago', data_baixa: registro.data, forma_baixa: formaBaixa })
        .eq('id', tituloId)

      if (erroUpdate) {
        throw new Error(`Falha ao baixar título por Nosso Número (${tituloId}): ${erroUpdate.message}`)
      }

      await registrarEvento(
        supabaseAdmin,
        tituloId,
        'baixa_total',
        `Baixa automática por Nosso Número "${registro.nossoNumero}" via ${registro.origem}.`,
        registro.valor,
      )

      return { tipo: 'baixa_automatica', contaAPagarId: tituloId, formaBaixa }
    }
    // Nenhum ou mais de um match (não deveria acontecer, nosso_numero
    // é herdado único por parcela, mas se acontecer, segue para o
    // passo 3 em vez de decidir arbitrariamente)
  }

  // ── PASSO 3: Fornecedor + valor exato ─────────────────────
  if (registro.cnpjCpf) {
    const fornecedor = await buscarFornecedorPorDocumentoAdmin(supabaseAdmin, registro.cnpjCpf)

    if (fornecedor) {
      const { data: titulosEmAberto, error: erroTitulosFornecedor } = await supabaseAdmin
        .from('contas_a_pagar')
        .select('*')
        .eq('fornecedor_id', fornecedor.id)
        .eq('status', 'em_aberto')
        .is('deleted_at', null)

      if (erroTitulosFornecedor) {
        throw new Error(`Falha ao buscar títulos em aberto do fornecedor ${fornecedor.id}: ${erroTitulosFornecedor.message}`)
      }

      const listaTitulos = (titulosEmAberto ?? []) as ContaAPagar[]
      const matchesExatos = listaTitulos.filter((t) => Math.abs(t.valor - registro.valor) < 0.01)

      // Exatamente 1 título com valor batendo exatamente → baixa automática
      if (matchesExatos.length === 1) {
        const tituloAlvo = matchesExatos[0]

        const { error: erroUpdate } = await supabaseAdmin
          .from('contas_a_pagar')
          .update({ status: 'pago', data_baixa: registro.data, forma_baixa: formaBaixa })
          .eq('id', tituloAlvo.id)

        if (erroUpdate) {
          throw new Error(`Falha ao baixar título por fornecedor+valor (${tituloAlvo.id}): ${erroUpdate.message}`)
        }

        await registrarEvento(
          supabaseAdmin,
          tituloAlvo.id,
          'baixa_total',
          `Baixa automática por fornecedor (${fornecedor.razao}) + valor exato via ${registro.origem}.`,
          registro.valor,
        )

        return { tipo: 'baixa_automatica', contaAPagarId: tituloAlvo.id, formaBaixa }
      }

      // Mais de um título em aberto, ou nenhum valor batendo exatamente
      // (incluindo 0 títulos em aberto) → nunca decide sozinho, acumula
      // como pendente de confirmação manual (Especificação §5, passo 3)
      return {
        tipo: 'pendente_confirmacao',
        item: {
          registroOriginal: {
            id: null,
            autenticacaoSisbb: null,
            dataPagamento: registro.data,
            nomeFavorecido: registro.nomeFavorecido,
            cpfMascarado: null,
            chavePix: null,
            valor: registro.valor,
            documentoIdentificado: registro.cnpjCpf,
          },
          favorecidoIdentificado: registro.nomeFavorecido,
          cnpjCpfIdentificado: registro.cnpjCpf,
          valor: registro.valor,
          data: registro.data,
          titulosEmAbertoDoFornecedor: listaTitulos,
          tituloEscolhidoId: null,
        },
      }
    }
  }

  // ── PASSO 4: CNPJ/CPF não encontrado em lugar nenhum ──────
  // Nem roster, nem Nosso Número, nem fornecedor cadastrado — acumula
  // como "não encontrado", nunca bloqueia o restante do processamento
  // (Especificação §5, passo 4)
  return {
    tipo: 'nao_encontrado',
    nomeFavorecido: registro.nomeFavorecido,
    cnpjCpf: registro.cnpjCpf ?? '',
    valor: registro.valor,
    data: registro.data,
  }
}
