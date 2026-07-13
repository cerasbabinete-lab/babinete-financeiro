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
  RegistroRelatorioBB,
  RegistroComprovantePdf,
  RegistroComprovanteTxt,
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
// Função: sincronizarStatusDespesaDoTitulo
// QA fix (bug real confirmado, sessão 12/07/2026 — caso SKY): toda
// baixa automática deste motor (Passos 2, 3, 3B e processarAcumulo)
// atualizava contas_a_pagar.status mas NUNCA propagava a mudança
// para despesas.status_pagamento nem despesas_parcelas.status —
// resultado: o título aparecia "Pago" em Contas a Pagar e a mesma
// Despesa continuava "Em Aberto" na tela de Despesas, os dois campos
// dessincronizados pra sempre. Chamada logo após CADA UPDATE de
// contas_a_pagar.status neste arquivo. Nunca lança erro se o título
// não tiver despesa_id vinculada (títulos sintéticos criados por
// criarDespesaEContaAPagarAutomatica já nascem com os dois campos
// sincronizados na criação, não passam por aqui).
// ------------------------------------------------------------
async function sincronizarStatusDespesaDoTitulo(
  supabaseAdmin: SupabaseClient,
  tituloId: string,
  novoStatus: 'pago' | 'pago_parcial',
): Promise<void> {
  const { data: titulo, error: erroTitulo } = await supabaseAdmin
    .from('contas_a_pagar')
    .select('despesa_id, despesa_parcela_id')
    .eq('id', tituloId)
    .single()

  // Sem despesa_id vinculada — nada a sincronizar, não é erro
  if (erroTitulo || !titulo || !titulo.despesa_id) return

  const { error: erroDespesa } = await supabaseAdmin
    .from('despesas')
    .update({ status_pagamento: novoStatus })
    .eq('id', titulo.despesa_id)

  if (erroDespesa) {
    throw new Error(`Falha ao sincronizar status_pagamento da Despesa (${titulo.despesa_id}): ${erroDespesa.message}`)
  }

  if (titulo.despesa_parcela_id) {
    const { error: erroParcela } = await supabaseAdmin
      .from('despesas_parcelas')
      .update({ status: novoStatus })
      .eq('id', titulo.despesa_parcela_id)

    if (erroParcela) {
      throw new Error(`Falha ao sincronizar status da parcela (${titulo.despesa_parcela_id}): ${erroParcela.message}`)
    }
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
  // QA fix (L2, Relatorio_Auditoria_Contas_a_Pagar_QA_Directive.md):
  // .limit(5) removido — com mais de 5 fornecedores compartilhando um
  // substring de dígitos, um match real podia ficar fora da janela
  // retornada e o código concluir "não encontrado" incorretamente. O
  // filtro de match exato abaixo (linhas seguintes) já garante que só
  // o registro certo é usado, então não há necessidade de limitar a
  // busca — o pré-filtro em si continua barato (índice em cnpj/cpf).
  // QA fix (L1, Relatorio_Auditoria_Contas_a_Pagar_QA_Directive.md) —
  // avaliado e classificado como seguro sem alteração de código:
  // `digitos` vem sempre de extrairSomenteDigitos() (só [0-9]) e
  // `formatado` só de formatarComoCnpjOuCpf() (dígitos + pontuação
  // fixa "./-", nunca texto arbitrário do usuário) — não existe
  // caractere que quebre a sintaxe do filtro .or() do PostgREST
  // (vírgula, parênteses, aspas) nesses dois formatos. Não há
  // `escaparParaFiltroOr()` disponível no projeto para reaproveitar
  // sem criar uma dependência nova não validada.
  const { data, error } = await supabaseAdmin
    .from('fornecedores')
    .select('id, razao, cnpj, cpf')
    .or(
      `cnpj.ilike.%${digitos}%,cpf.ilike.%${digitos}%${formatado ? `,cnpj.ilike.%${formatado}%,cpf.ilike.%${formatado}%` : ''}`,
    )

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

  // QA fix (M3, Relatorio_Auditoria_Contas_a_Pagar_QA_Directive.md):
  // Supabase client (via PostgREST) não expõe transação multi-tabela
  // client-side — a alternativa correta seria uma função RPC no
  // Postgres, mas isso exigiria uma nova migration + teste separado
  // fora do escopo desta sessão. Como mitigação, cada insert que falha
  // APÓS um insert anterior ter tido sucesso agora limpa (DELETE) o
  // que já foi criado antes de propagar o erro — nunca deixa uma
  // Despesa ou parcela órfã, sem contas_a_pagar correspondente. Ainda
  // não é atômico (há uma janela entre os inserts), mas elimina o
  // cenário mais provável de dado inconsistente: falha no 2º/3º passo
  // sem qualquer rollback do 1º/2º.
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
    // Limpeza compensatória — despesa já foi criada, mas a parcela
    // falhou, então a despesa ficaria órfã (sem parcela, sem título)
    await supabaseAdmin.from('despesas').delete().eq('id', despesaInserida.id)
    throw new Error(`Falha ao criar parcela automática (Despesa ${despesaInserida.id} foi revertida): ${erroParcela?.message ?? 'sem retorno do insert'}`)
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
    // Limpeza compensatória — despesa E parcela já foram criadas, mas
    // o título falhou. Remove parcela primeiro (FK despesa_id), depois
    // a despesa, para não deixar nada órfão de pé
    await supabaseAdmin.from('despesas_parcelas').delete().eq('id', parcelaInserida.id)
    await supabaseAdmin.from('despesas').delete().eq('id', despesaInserida.id)
    throw new Error(`Falha ao criar contas_a_pagar automático (Despesa ${despesaInserida.id} e parcela foram revertidas): ${erroTitulo?.message ?? 'sem retorno do insert'}`)
  }

  // ── Registra os 2 eventos de auditoria no título recém-criado ──
  // (eventos falhando aqui não justificam reverter despesa/parcela/
  // título já criados com sucesso — o título em si está correto, só
  // o histórico de auditoria ficaria incompleto; registrarEvento()
  // já lança erro próprio se falhar, propagado normalmente)
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
  // QA fix (M2, Relatorio_Auditoria_Contas_a_Pagar_QA_Directive.md):
  // formaBaixa aqui é sempre 'acumulo_automatico' — este é um dos 2
  // caminhos 100% automáticos do roster (Especificação §5, passo 1),
  // nunca 'relatorio_bb'/'comprovante_individual' (esses são só para
  // baixas de título pré-existente via Nosso Número/fornecedor+valor,
  // passos 2 e 3). FormaBaixaPagar já tem esse valor no enum desde a
  // Especificação original — só não estava sendo usado em lugar nenhum.
  const formaBaixa: FormaBaixaPagar = 'acumulo_automatico'
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
  // QA fix (M2) — mesmo motivo de processarDespesaAutomaticaBaixada:
  // toda baixa aplicada por este caminho (holerite_com_abatimento /
  // acumulo_ate_valor_integral) é automática via roster, nunca
  // proveniente de Nosso Número ou fornecedor+valor exato
  const formaBaixa: FormaBaixaPagar = 'acumulo_automatico'
  const documento = beneficiario.cnpj ?? beneficiario.cpf ?? ''
  const digitosDocumento = extrairSomenteDigitos(documento)
  const formatado = formatarComoCnpjOuCpf(digitosDocumento)

  // Busca o título original em aberto/parcial vinculado a este
  // documento — favorecido_cnpj_cpf é o vínculo usado (contas_a_pagar
  // não tem beneficiario_id, ver Especificação §2.1 modelo de dados),
  // pega o mais antigo em aberto se houver mais de um (default de
  // engenharia — não especificado explicitamente, mas é o critério
  // mais conservador: fecha o título mais antigo primeiro)
  // QA fix (H1, Relatorio_Auditoria_Contas_a_Pagar_QA_Directive.md):
  // o .ilike() abaixo é só um PRE-filtro (substring, pode dar falso
  // positivo). O .limit(1) foi removido daqui — antes ele aceitava o
  // primeiro match por substring sem checagem de dígito exato, o que
  // podia baixar o título ERRADO silenciosamente. Agora busca todos os
  // candidatos do pré-filtro e só depois aplica o mesmo padrão de
  // match exato por dígitos já usado em buscarFornecedorPorDocumentoAdmin
  // (mesmo arquivo) e em rosterConciliacaoPagar.ts —
  // esta função era a única das três que não seguia esse padrão.
  // QA fix (L1) — mesma avaliação de segurança do buscarFornecedorPorDocumentoAdmin acima
  const { data: titulosCandidatosBruto, error: erroTitulos } = await supabaseAdmin
    .from('contas_a_pagar')
    .select('*')
    .in('status', ['em_aberto', 'pago_parcial'])
    .is('deleted_at', null)
    .or(`favorecido_cnpj_cpf.ilike.%${digitosDocumento}%${formatado ? `,favorecido_cnpj_cpf.ilike.%${formatado}%` : ''}`)
    .order('data_vencimento', { ascending: true })

  if (erroTitulos) {
    throw new Error(`Falha ao buscar título original para acúmulo (${beneficiario.nome}): ${erroTitulos.message}`)
  }

  // Filtra para match EXATO de dígitos (elimina falso positivo de
  // substring do .ilike acima) — só então pega o mais antigo em aberto
  const titulosCandidatos = (titulosCandidatosBruto ?? []).filter(
    (t: ContaAPagar) => extrairSomenteDigitos(t.favorecido_cnpj_cpf ?? '') === digitosDocumento,
  )

  const titulo = titulosCandidatos[0] as ContaAPagar | undefined

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

    await sincronizarStatusDespesaDoTitulo(supabaseAdmin, titulo.id, 'pago_parcial')

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

  await sincronizarStatusDespesaDoTitulo(supabaseAdmin, titulo.id, 'pago')

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
//
// QA fix (M1, Relatorio_Auditoria_Contas_a_Pagar_QA_Directive.md):
// parâmetro `registroOriginal` adicionado — o formato bruto que o
// parser de origem produziu (RegistroRelatorioBB, RegistroComprovantePdf
// ou RegistroComprovanteTxt), responsabilidade da API route chamadora
// passar adiante junto com o normalizado. Antes, quando o resultado
// caía em 'pendente_confirmacao', o item era montado com um objeto
// fixo no shape de RegistroComprovanteTxt, mesmo quando a origem era
// Relatório BB ou PDF — o TypeScript aceitava porque batia
// estruturalmente com essa variante do union, mas descartava campos
// reais (sequencial, cnpjCpfFavorecido, tipoInstrumento, nrAutenticacao,
// numeroDocumento). Agora o registro original de verdade é repassado.
// ------------------------------------------------------------
export async function conciliarRegistro(
  supabaseAdmin: SupabaseClient,
  registro: RegistroNormalizadoConciliacao,
  registroOriginal: RegistroRelatorioBB | RegistroComprovantePdf | RegistroComprovanteTxt,
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
  // QA fix (sessão 12/07/2026 — bug real confirmado com o boleto SKY,
  // 402560110347, e cruzado contra o Relatório BB 10072026): o Nosso
  // Número gravado no título (formato curto, ex: "00007883515-2",
  // extraído do próprio boleto no momento da Despesa) NUNCA é igual,
  // caractere a caractere, ao "Nosso Número" impresso no Relatório de
  // Pagamentos BB. Decompondo a linha digitável real do boleto SKY
  // (23792.37205 90000.788357 15027.140209 2 14960000032974) pelos
  // campos padrão FEBRABAN, o CAMPO LIVRE resultante (25 dígitos,
  // formato interno do banco emissor) bate dígito a dígito com o
  // "Nosso Número" do relatório ("2372090000788351502714020") — ou
  // seja, o relatório imprime o campo livre inteiro, não o Nosso
  // Número curto isolado. O Nosso Número curto aparece CONTIDO dentro
  // desse campo livre, mas em posição variável conforme o banco/
  // carteira por trás do boleto (não é um offset fixo universal —
  // confirmado comparando 2 boletos de bancos diferentes, CASADEI e
  // SKY). Comparação trocada de igualdade exata (`.eq()`) para
  // "dígitos contidos", testada nas duas direções e com/sem o dígito
  // verificador final do formato "NNNNN-D".
  if (registro.nossoNumero) {
    const digitosRegistro = extrairSomenteDigitos(registro.nossoNumero)

    // Busca todos os títulos em aberto com nosso_numero preenchido —
    // "contido em" não é expressável via .ilike() nesta direção (o
    // valor do relatório costuma ser MAIOR que o valor salvo no
    // título, não o contrário), então o filtro fino é feito em
    // código logo abaixo, sobre este conjunto candidato
    const { data: titulosComNossoNumero, error: erroNossoNumero } = await supabaseAdmin
      .from('contas_a_pagar')
      .select('id, nosso_numero')
      .eq('status', 'em_aberto')
      .is('deleted_at', null)
      .not('nosso_numero', 'is', null)

    if (erroNossoNumero) {
      throw new Error(`Falha ao buscar títulos por Nosso Número: ${erroNossoNumero.message}`)
    }

    // Match por dígitos contidos — testa o Nosso Número do título com
    // o dígito verificador final ("NNNNN-D" → dígitos completos) e
    // também sem ele (só a base, "NNNNN"), já que o campo livre do
    // relatório pode conter só a base sem o DV (caso SKY confirmado).
    // Testa as duas direções (relatório contém título / título
    // contém relatório) para cobrir também um eventual caso inverso.
    // Comprimento mínimo de 8 dígitos evita falso positivo por
    // sequência curta demais para ser um Nosso Número real.
    const candidatos = (titulosComNossoNumero ?? []).filter((t: { id: string; nosso_numero: string | null }) => {
      const digitosTitulo = extrairSomenteDigitos(t.nosso_numero ?? '')
      if (digitosTitulo.length < 8) return false
      const digitosTituloSemDv = digitosTitulo.slice(0, -1)
      return (
        digitosRegistro.includes(digitosTitulo) ||
        digitosRegistro.includes(digitosTituloSemDv) ||
        digitosTitulo.includes(digitosRegistro)
      )
    })

    // Match único — baixa automática direta (Especificação §5, passo 2)
    if (candidatos.length === 1) {
      const tituloId = candidatos[0].id

      const { error: erroUpdate } = await supabaseAdmin
        .from('contas_a_pagar')
        .update({ status: 'pago', data_baixa: registro.data, forma_baixa: formaBaixa })
        .eq('id', tituloId)

      if (erroUpdate) {
        throw new Error(`Falha ao baixar título por Nosso Número (${tituloId}): ${erroUpdate.message}`)
      }

      await sincronizarStatusDespesaDoTitulo(supabaseAdmin, tituloId, 'pago')

      await registrarEvento(
        supabaseAdmin,
        tituloId,
        'baixa_total',
        `Baixa automática por Nosso Número "${registro.nossoNumero}" via ${registro.origem} (match por dígitos contidos — campo livre do relatório BB).`,
        registro.valor,
      )

      return { tipo: 'baixa_automatica', contaAPagarId: tituloId, formaBaixa }
    }
    // Nenhum ou mais de um candidato — segue para o passo 3 em vez de
    // decidir arbitrariamente (mesmo critério conservador já usado no
    // resto do motor)
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

        await sincronizarStatusDespesaDoTitulo(supabaseAdmin, tituloAlvo.id, 'pago')

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
          // QA fix (M1): registro original de verdade do parser,
          // repassado pelo chamador — não mais um placeholder fixo
          registroOriginal,
          favorecidoIdentificado: registro.nomeFavorecido,
          cnpjCpfIdentificado: registro.cnpjCpf,
          valor: registro.valor,
          data: registro.data,
          origem: registro.origem,
          titulosEmAbertoDoFornecedor: listaTitulos,
          tituloEscolhidoId: null,
        },
      }
    }
  }

  // ── PASSO 3B (H3 fix, Relatorio_Auditoria_Contas_a_Pagar_QA_Directive.md):
  // sem CNPJ/CPF identificado (Chave Pix não numérica, ex: e-mail,
  // telefone, chave aleatória — ver resolverDocumentoIdentificado em
  // parserComprovanteTxt.ts), o registro antes caía direto no Passo 4
  // "não encontrado", mesmo quando havia um título em aberto óbvio
  // batendo por nome+valor exato. Critério deliberadamente
  // CONSERVADOR: nome exato (trim + case-insensitive, sem fuzzy
  // matching) E valor exato — nunca decide sozinho se houver mais de
  // 1 candidato, mesma filosofia do Passo 3. Decisão de engenharia:
  // Maycon pode revisar/ajustar o critério de nome (ex: normalização
  // de acentos) se aparecerem falsos negativos na prática.
  // ------------------------------------------------------------
  if (!registro.cnpjCpf) {
    const nomeNormalizado = registro.nomeFavorecido.trim().toLowerCase()

    const { data: titulosAbertos, error: erroTitulosAbertos } = await supabaseAdmin
      .from('contas_a_pagar')
      .select('*')
      .eq('status', 'em_aberto')
      .is('deleted_at', null)

    if (erroTitulosAbertos) {
      throw new Error(`Falha ao buscar títulos em aberto para fallback nome+valor: ${erroTitulosAbertos.message}`)
    }

    const candidatosNomeValor = ((titulosAbertos ?? []) as ContaAPagar[]).filter(
      (t) =>
        t.favorecido_nome.trim().toLowerCase() === nomeNormalizado &&
        Math.abs(t.valor - registro.valor) < 0.01,
    )

    // Exatamente 1 candidato → baixa automática, mesmo padrão de risco
    // aceito no Passo 3 (fornecedor+valor exato)
    if (candidatosNomeValor.length === 1) {
      const tituloAlvo = candidatosNomeValor[0]

      const { error: erroUpdate } = await supabaseAdmin
        .from('contas_a_pagar')
        .update({ status: 'pago', data_baixa: registro.data, forma_baixa: formaBaixa })
        .eq('id', tituloAlvo.id)

      if (erroUpdate) {
        throw new Error(`Falha ao baixar título por nome+valor exato (${tituloAlvo.id}): ${erroUpdate.message}`)
      }

      await sincronizarStatusDespesaDoTitulo(supabaseAdmin, tituloAlvo.id, 'pago')

      await registrarEvento(
        supabaseAdmin,
        tituloAlvo.id,
        'baixa_total',
        `Baixa automática por nome (${registro.nomeFavorecido}) + valor exato via ${registro.origem} — sem CNPJ/CPF identificado no documento.`,
        registro.valor,
      )

      return { tipo: 'baixa_automatica', contaAPagarId: tituloAlvo.id, formaBaixa }
    }

    // Mais de 1 candidato por nome+valor → nunca decide sozinho,
    // acumula como pendente de confirmação manual
    if (candidatosNomeValor.length > 1) {
      return {
        tipo: 'pendente_confirmacao',
        item: {
          registroOriginal,
          favorecidoIdentificado: registro.nomeFavorecido,
          cnpjCpfIdentificado: registro.cnpjCpf ?? '',
          valor: registro.valor,
          data: registro.data,
          origem: registro.origem,
          titulosEmAbertoDoFornecedor: candidatosNomeValor,
          tituloEscolhidoId: null,
        },
      }
    }
    // 0 candidatos por nome+valor — segue para o Passo 4 normalmente
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
