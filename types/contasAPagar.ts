// ============================================================
// types/contasAPagar.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Pagar
// Função: Tipagem TypeScript completa das tabelas contas_a_pagar,
//         contas_a_pagar_eventos, pagar_arquivos_importados,
//         pagar_comprovantes_processados, mais tipos auxiliares
//         de parsing (3 documentos), motor de conciliação e UI.
//         Par estrutural inverso de types/contasReceber.ts —
//         mesma convenção de nomes e organização, adaptando os
//         campos que não fazem sentido no sentido inverso
//         (protesto/cartório não existem em "a pagar").
// Conecta com: lib/contasAPagarService.ts, lib/pagar/parserRelatorioBB.ts,
//              lib/pagar/parserComprovantePdf.ts, lib/pagar/parserComprovanteTxt.ts,
//              lib/pagar/motorConciliacao.ts, lib/pagar/rosterConciliacaoPagar.ts,
//              lib/pagar/duplicateCheckPagar.ts, pages/api/pagar/*.ts,
//              components/pagar/*.tsx, types/despesas.ts (BeneficiarioPessoalRoster,
//              base estendida por BeneficiarioPessoalRosterPagar abaixo)
// Referência: Especificacao_Modulo_Contas_a_Pagar.md, Seção 2.1
//             (Data Model) — fonte de verdade de todos os tipos abaixo
// ============================================================

// Importa o tipo base do roster já existente (módulo Despesas, produção)
// para estender com as 4 colunas novas deste módulo, sem duplicar
// os campos já tipados lá (nome, cpf, vinculo, aliases, endereco)
import type { BeneficiarioPessoalRoster } from '@/types/despesas'


// ============================================================
// StatusTitulo (Contas a Pagar)
// Valores válidos para o campo status de contas_a_pagar
// Enum fechado — Especificação §2.1. NÃO inclui protestado/
// enviado_cartorio (ações de credor contra devedor, não se
// aplicam ao sentido "a pagar")
// ============================================================
export type StatusTituloPagar =
  | 'em_aberto'    // Título gerado, aguardando pagamento
  | 'pago'         // Baixado integralmente
  | 'pago_parcial' // Em processo de acúmulo (casos Sheli e Maycon-PJ), ainda não fechou o valor total
  | 'cancelado'    // Soft-deleted — deleted_at preenchido


// ============================================================
// FormaBaixaPagar
// Valores válidos para o campo forma_baixa de contas_a_pagar
// Enum fechado — Especificação §2.1
// ============================================================
export type FormaBaixaPagar =
  | 'pix'
  | 'transferencia'
  | 'boleto_manual'
  | 'relatorio_bb'            // Baixa aplicada via importação do Relatório de Pagamentos BB
  | 'comprovante_individual'  // Baixa aplicada via importação de comprovante PDF ou TXT individual
  | 'acumulo_automatico'      // Baixa parcial/total aplicada automaticamente pelo motor de conciliação (casos roster)
  | 'manual'                  // Baixa manual rápida, sem forma específica


// ============================================================
// TipoEventoPagar
// Valores válidos para o campo tipo de contas_a_pagar_eventos
// Enum fechado — Especificação §2.1
// ============================================================
export type TipoEventoPagar =
  | 'criado'                     // Título criado (a partir de despesas_parcela)
  | 'nosso_numero_vinculado'     // Nosso Número confirmado/vinculado via Relatório BB
  | 'baixa_parcial'              // Baixa parcial aplicada (acumulo_ate_valor_integral ou holerite_com_abatimento, ainda não fechou)
  | 'baixa_total'                // Baixa que fechou o valor total do título (status final = pago)
  | 'baixa_manual'               // Baixa manual avulsa registrada pelo usuário (só para título pré-existente)
  | 'despesa_complementar_criada'// Evento registrado no título ORIGINAL quando um excedente gerou uma nova Despesa complementar
  | 'cancelado'                  // Soft-delete
  | 'reaberto'                   // Reversão de cancelamento/baixa


// ============================================================
// RegraConciliacaoPagar
// Valores válidos para beneficiarios_pessoais.regra_conciliacao_pagar
// Se a linha do roster tiver este campo NULL, o CPF/CNPJ é tratado
// como fornecedor genérico (sem regra especial) — Especificação §2.1
// ============================================================
export type RegraConciliacaoPagar =
  | 'holerite_com_abatimento'    // Acumula pagamentos até fechar o valor do holerite (caso Sheli)
  | 'despesa_automatica_baixada' // 100% automático e silencioso — cria Despesa já baixada (casos Darci, Fábio, Maycon-CPF)
  | 'acumulo_ate_valor_integral' // Acumula pagamentos até fechar o valor da NF de serviço (caso Maycon-CNPJ)


// ============================================================
// ContaAPagar
// Representa uma linha completa da tabela contas_a_pagar
// Inclui campos calculados via join (eventos)
// ============================================================
export interface ContaAPagar {
  id:                  string        // UUID — PK gerado pelo Postgres
  despesa_parcela_id?: string | null // UUID — FK → despesas_parcelas (SET NULL)
  despesa_id?:         string | null // UUID — FK → despesas (SET NULL, navegação direta)
  fornecedor_id?:      number | null // BIGINT — FK → fornecedores (SET NULL) — pode ser null nos casos sócio/roster

  numero_documento?:   string | null // Número do documento de origem, literal
  data_vencimento:     string        // ISO date — "YYYY-MM-DD"
  data_processamento:  string        // ISO date — data de criação do título no módulo
  valor:               number        // Valor de face do título

  nosso_numero?:       string | null // Herdado de despesas_parcelas.nosso_numero na criação; confirmável via Relatório BB
  linha_digitavel?:    string | null // Herdado de despesas_parcelas.linha_digitavel

  status:              StatusTituloPagar   // Estado atual do título
  data_baixa?:         string | null       // ISO date — data de liquidação
  forma_baixa?:        FormaBaixaPagar | null // Como foi liquidado

  // Dados do favorecido/credor — IMUTÁVEIS após criação, mesmo
  // princípio de cliente_nome em Contas a Receber. Não sobrescritos
  // por alterações posteriores em fornecedores/beneficiarios_pessoais
  favorecido_nome:        string        // Nome do favorecido no momento da emissão
  favorecido_cnpj_cpf?:   string | null // CNPJ/CPF sem pontuação, formatado na exibição
  favorecido_endereco?:   string | null

  observacoes?:        string | null // Campo livre

  deleted_at?:         string | null // Timestamp de cancelamento — null = ativo
  created_at?:         string        // ISO timestamp — automático
  updated_at?:         string        // ISO timestamp — atualizado por trigger

  // Campo calculado via join — não existe na tabela
  eventos?: ContaAPagarEvento[]      // Join com contas_a_pagar_eventos (histórico)
}


// ============================================================
// ContaAPagarInsert
// Tipo para INSERT — omite campos gerados automaticamente
// ============================================================
export type ContaAPagarInsert = Omit<
  ContaAPagar,
  'id' | 'created_at' | 'updated_at' | 'eventos'
>


// ============================================================
// ContaAPagarUpdate
// Tipo para UPDATE — todos os campos opcionais exceto id
// ============================================================
export type ContaAPagarUpdate = Partial<ContaAPagarInsert> & { id: string }


// ============================================================
// ContaAPagarEvento
// Representa uma linha da tabela contas_a_pagar_eventos
// Imutável — apenas INSERT, nunca UPDATE ou DELETE
// ============================================================
export interface ContaAPagarEvento {
  id:          string          // UUID — PK
  titulo_id:   string          // UUID — FK → contas_a_pagar (CASCADE DELETE)
  tipo:        TipoEventoPagar // Tipo do evento — ver TipoEventoPagar acima
  descricao:   string          // Descrição legível em PT-BR gerada pela aplicação
  // Obrigatório em todo evento de baixa parcial/total — é a partir da
  // soma destes valores que o sistema calcula quanto já foi pago de
  // um título em pago_parcial. NÃO existe valor_pago_acumulado na
  // tabela contas_a_pagar — cálculo sempre feito somando os eventos
  valor_pago?: number | null
  created_at:  string          // ISO timestamp — automático
}


// ============================================================
// ArquivoImportadoPagar
// Representa uma linha da tabela pagar_arquivos_importados
// Dedupe por hash de arquivo inteiro — exclusivo do Relatório BB
// consolidado (um arquivo = um período)
// ============================================================
export interface ArquivoImportadoPagar {
  id:               string       // UUID — PK
  nome_arquivo:     string       // Nome original do arquivo
  hash_arquivo:     string       // SHA-256 do conteúdo — UNIQUE
  periodo_de?:      string | null // ISO date — extraído do cabeçalho "Período: ... a ...", só informativo
  periodo_ate?:     string | null // ISO date
  total_registros:  number       // Total de linhas de dados parseadas
  processados:      number       // Registros processados com sucesso
  nao_encontrados:  number       // Registros sem correspondência
  created_at:       string       // ISO timestamp — automático
}


// ============================================================
// ComprovanteProcessado
// Representa uma linha da tabela pagar_comprovantes_processados
// Dedupe por identificador natural do comprovante individual
// (NR.AUTENTICACAO para PDF de boleto; ID: ou AUTENTICACAO SISBB:
// para Pix/TXT) — NÃO por hash de arquivo, já que o TXT é sempre
// sobrescrito com o mesmo nome e conteúdo variável
// ============================================================
export interface ComprovanteProcessado {
  id:                     string  // UUID — PK
  origem:                 'comprovante_pdf' | 'comprovante_txt'
  identificador_natural:  string  // Chave de dedupe — UNIQUE
  contas_a_pagar_id?:     string | null // FK → contas_a_pagar (null se virou despesa nova)
  created_at:             string  // ISO timestamp — automático
}


// ============================================================
// BeneficiarioPessoalRosterPagar
// Estende BeneficiarioPessoalRoster (types/despesas.ts, já em
// produção) com as 4 colunas novas adicionadas via ALTER TABLE
// neste módulo (Especificação §2.1) — mesma linha física da
// tabela beneficiarios_pessoais, mais campos de conciliação
// ============================================================
export interface BeneficiarioPessoalRosterPagar extends BeneficiarioPessoalRoster {
  // CNPJ do beneficiário, quando aplicável — necessário
  // especificamente para o caso Maycon, que tem duas identidades
  // no Relatório BB: CNPJ (prestador PJ) e CPF (pessoa física)
  cnpj:                     string | null

  // Regra de conciliação a aplicar quando este CNPJ/CPF aparece
  // numa transação. Se NULL, tratado como fornecedor genérico
  // mesmo que exista uma linha no roster
  regra_conciliacao_pagar:  RegraConciliacaoPagar | null

  // categoriaFinanceira a usar ao criar automaticamente uma Despesa
  // para este beneficiário (ex: "contabilidade", "servicos_profissionais")
  despesa_gerada_categoria: string | null

  // Subtipo dentro da extensão de categoria (ex: "folha_pro_labore",
  // "retirada_socio", "bonus_anual") — ver ExtensaoContabilidade.subtipo
  // em types/despesas.ts
  despesa_gerada_subtipo:   string | null
}


// ============================================================
// PAGADOR_FIXO
// Dados fixos do pagador (Ceras Babinete) — NUNCA extraído de
// nenhum campo de nenhum documento (Instruções obrigatórias do
// Builder, item 4: o campo "PAGADOR" dos comprovantes BB pode
// conter um nome/CPF pessoal desatualizado no cadastro do banco,
// completamente desconectado da identidade real da empresa —
// esta constante é a ÚNICA fonte de verdade do pagador em todo
// o módulo, mesma regra já validada em types/despesas.ts para o
// campo "favorecido" nunca ser a própria empresa)
// ============================================================
export const PAGADOR_FIXO = {
  nome: 'CERAS BABINETE LTDA. ME',
  cnpj: '10666614000160', // Sem pontuação — 14 dígitos
} as const


// ------------------------------------------------------------
// Tipos de registro extraído por parser — um por tipo de documento
// (Especificação §5). Todos representam UM registro individual
// já normalizado, prontos para entrar no Motor de Conciliação.
// ------------------------------------------------------------

// ============================================================
// RegistroRelatorioBB
// Um registro (linha) extraído do Relatório de Pagamentos
// Realizados BB (PDF consolidado) — parserRelatorioBB.ts
// ============================================================
export interface RegistroRelatorioBB {
  sequencial:       number                  // Número sequencial da linha no relatório
  dataPagamento:    string                  // ISO date — "YYYY-MM-DD"
  nomeFavorecido:   string                  // Extração literal, nunca normalizada
  cnpjCpfFavorecido: string                 // Extração literal, sem pontuação
  valor:            number                  // Valor em reais
  nossoNumero?:     string | null           // Presente só quando o pagamento foi via boleto
  tipoInstrumento:  'boleto' | 'pix'         // "Boleto" ou "Pix" no relatório
  canal:            'pagamento_online' | 'transferencia_online'
}


// ============================================================
// RegistroComprovantePdf
// Um registro extraído de um comprovante individual de boleto
// (PDF) — parserComprovantePdf.ts
// ============================================================
export interface RegistroComprovantePdf {
  nrAutenticacao:    string  // NR.AUTENTICACAO — chave de dedupe primária
  dataPagamento:     string  // ISO date
  nomeFavorecido:    string  // Extração literal
  cnpjCpfFavorecido?: string | null
  valor:             number
  nossoNumero?:      string | null
}


// ============================================================
// RegistroComprovanteTxt
// Um registro extraído de um bloco do arquivo Comprovantes_BB.txt
// (comprovante Pix, possivelmente múltiplos por arquivo) —
// parserComprovanteTxt.ts
// ============================================================
export interface RegistroComprovanteTxt {
  // Chave de dedupe primária — campo "ID:"; se ausente, usar
  // autenticacaoSisbb como fallback (ver duplicateCheckPagar.ts)
  id:                 string | null
  autenticacaoSisbb:  string | null // "AUTENTICACAO SISBB:" — fallback de dedupe

  dataPagamento:      string  // ISO date
  nomeFavorecido:      string // Campo "PAGO PARA:" — extração literal
  cpfMascarado?:       string | null // Campo "CPF:" — sempre mascarado (ex: "***.817.879-**")
  chavePix?:           string | null // Campo "CHAVE PIX:" — pode ser CPF/CNPJ sem máscara
  valor:                number
  // Documento efetivamente usado para identificar o favorecido —
  // preenchido pelo parser conforme a regra da nota crítica (§5):
  // chavePix (se CPF/CNPJ numérico sem máscara) > cpfMascarado (sinal auxiliar) > nome+valor
  documentoIdentificado?: string | null
}


// ------------------------------------------------------------
// Tipos de saída do Motor de Conciliação (Especificação §5)
// ------------------------------------------------------------

// ============================================================
// OrigemImportacaoPagar
// De qual pipeline de importação um registro veio — usado para
// preencher forma_baixa corretamente (relatorio_bb vs.
// comprovante_individual) e para o resumo pós-importação
// ============================================================
export type OrigemImportacaoPagar = 'relatorio_bb' | 'comprovante_pdf' | 'comprovante_txt'


// ============================================================
// ResultadoConciliacaoItem
// Resultado do Motor de Conciliação para UM registro processado
// (Especificação §5, "Outputs") — uma de 4 categorias possíveis
// ============================================================
export type ResultadoConciliacaoItem =
  | { tipo: 'baixa_automatica'; contaAPagarId: string; formaBaixa: FormaBaixaPagar }
  | { tipo: 'despesa_criada_automaticamente'; despesaId: string; contaAPagarId: string }
  | { tipo: 'pendente_confirmacao'; item: ItemPendenteConfirmacao }
  | { tipo: 'nao_encontrado'; nomeFavorecido: string; cnpjCpf: string; valor: number; data: string }


// ============================================================
// ItemPendenteConfirmacao
// Um item aguardando decisão manual do usuário — exibido em
// ImportarConciliacaoPreviewModal.tsx (equivalente funcional de
// ImportarRetornoPreviewModal.tsx)
// ============================================================
export interface ItemPendenteConfirmacao {
  registroOriginal: RegistroRelatorioBB | RegistroComprovantePdf | RegistroComprovanteTxt
  favorecidoIdentificado: string
  cnpjCpfIdentificado: string
  valor: number
  data: string
  // Lista de parcelas em aberto/vencidas daquele fornecedor, para
  // o usuário escolher qual corresponde
  titulosEmAbertoDoFornecedor: ContaAPagar[]
  // Preenchido pelo usuário na tela de confirmação — id do título
  // escolhido, ou null se o usuário optar por pular ("não encontrado")
  tituloEscolhidoId: string | null
}


// ============================================================
// ResumoImportacaoPagar
// Retorno consolidado de importar-relatorio.ts / importar-comprovante.ts
// Segue o espírito de ResultadoImportXls/ResultadoImportRet já
// existentes em Contas a Receber (Especificação §8)
// ============================================================
export interface ResumoImportacaoPagar {
  origem:                    OrigemImportacaoPagar
  totalRegistros:            number
  baixasAutomaticas:         number  // Baixas aplicadas sem intervenção
  despesasCriadasAutomaticamente: number // Casos despesa_automatica_baixada + excedentes
  pendentesConfirmacao:      number  // Itens aguardando ImportarConciliacaoPreviewModal
  naoEncontrados:            number  // CNPJ/CPF não encontrado em lugar nenhum
  duplicadosIgnorados:       number  // Já processados antes (dedupe)
  detalhes:                  ResultadoConciliacaoItem[]
}


// ============================================================
// FiltrosContasAPagar
// Estado dos filtros ativos na tela de listagem
// ============================================================
export interface FiltrosContasAPagar {
  busca:          string  // Texto livre — nome, CNPJ, nº doc, nosso número
  vencimentoDe:   string  // Data vencimento início — ISO date string
  vencimentoAte:  string  // Data vencimento fim — ISO date string
  status:         string  // '' | StatusTituloPagar — filtro de status
}


// ============================================================
// ModoModalPagar
// Controla o modo de abertura do modal de título
// ============================================================
export type ModoModalPagar = 'editar' | 'visualizar' | null
// Nota: sem 'novo' — a modal de Contas a Pagar nunca cria título
// do zero (Especificação §7, "Non-negotiables"), diferente de
// ContasReceber onde ModoModal inclui 'novo'


// ============================================================
// STATUS_LABELS_PAGAR
// Labels legíveis para cada status — usados em badges e filtros
// ============================================================
export const STATUS_LABELS_PAGAR: Record<StatusTituloPagar, string> = {
  em_aberto:    'Em Aberto',
  pago:         'Pago',
  pago_parcial: 'Pago Parcial',
  cancelado:    'Cancelado',
}


// ============================================================
// STATUS_CORES_PAGAR
// Cores de badge para cada status — usadas em ContasAPagarTabela
// e ContasAPagarMobileList. Reaproveita a paleta já usada em
// STATUS_CORES de types/contasReceber.ts onde o significado é
// equivalente (em_aberto → mesmo verde; pago → mesmo verde;
// cancelado → mesmo cinza). pago_parcial usa um tom âmbar,
// coerente com "processo em andamento, ainda não concluído"
// (Especificação §3.2 — não introduzir cor fora da paleta do projeto)
// ============================================================
export const STATUS_CORES_PAGAR: Record<StatusTituloPagar, { bg: string; text: string }> = {
  em_aberto:    { bg: '#dcfce7', text: '#166534' }, // verde — mesmo de contas_receber.em_aberto
  pago:         { bg: '#dcfce7', text: '#166534' }, // verde — mesmo de contas_receber.pago
  pago_parcial: { bg: '#fef3c7', text: '#92400e' }, // âmbar — novo, processo em andamento
  cancelado:    { bg: '#f3f4f6', text: '#9ca3af' }, // cinza — mesmo de contas_receber.cancelado
}
