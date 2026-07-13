// ============================================================
// types/despesas.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Despesas
// Função: Tipagem TypeScript completa das tabelas despesas e
//         despesas_parcelas, mais tipos auxiliares de UI/pipeline
// IMPORTANTE: Este arquivo é 100% independente de types/receitas.ts
//             e types/contasReceber.ts — nenhuma interface é
//             compartilhada entre os módulos. A única importação
//             externa é dos tipos de categoria já validados em
//             types/despesas.ts (TipoDocumento, CategoriaFinanceira,
//             ExtensaoCategoria), que não pertencem a nenhum módulo
//             específico — são o contrato genérico do "modelo canônico de extração".
// Conecta com: despesasService.ts, lib/despesas/nfeCompraXmlParser.ts,
//              pages/api/despesas/*.ts, DespesasTabela.tsx,
//              DespesasModal.tsx, DespesasMobileList.tsx,
//              DespesasHeader.tsx, DespesasFiltros.tsx
// Referência: Especificacao_Modulo_Despesas.md, seção 2.1
// ============================================================

// ============================================================
// TipoDocumento
// Classifica o tipo de documento fonte que originou a Despesa
// (usado para rotear entre parser direto e pipeline de IA)
// ============================================================
export type TipoDocumento =
  | 'boleto'               // boleto bancário avulso
  | 'guia_tributo'         // DARF, DAS, guias estaduais/municipais, IPVA etc.
  | 'nota_fiscal'          // NF-e de compra de mercadoria/insumo
  | 'recibo'                // recibo informal, sem estrutura fiscal
  | 'fatura_concessionaria' // energia, água, telefonia/internet/TV
  | 'holerite'              // folha de pagamento / pró-labore


// ============================================================
// CategoriaFinanceira
// As 8 categorias financeiras fixas do módulo Despesas
// Determina qual extensão de categoria é aplicada à Despesa
// ============================================================
export type CategoriaFinanceira =
  | 'aluguel'
  | 'tributos_estadual_municipal'
  | 'concessionarias_utilidades'
  | 'transporte_frete'
  | 'compra_mercadoria_insumo'
  | 'servicos_profissionais'
  | 'contabilidade'
  | 'plano_saude'


// ============================================================
// Parcela
// Uma linha de vencimento/pagamento extraída de um documento —
// usada durante o processamento (antes da persistência), quando
// ainda não existe despesa_id (isso só existe em DespesaParcela,
// definida mais abaixo, já vinculada à Despesa persistida)
// ============================================================
export interface Parcela {
  numeroParcela: number       // posição desta parcela dentro do total (ex: 1 de 2)
  totalParcelas: number       // quantidade total de parcelas no documento
  valor: number                // valor desta parcela específica
  dataVencimento: string      // ISO date (YYYY-MM-DD)
  linhaDigitavel: string | null
  codigoBarras: string | null
  nossoNumero: string | null
  podeGerarSegundaVia: boolean
}


// ============================================================
// ItemCompra
// Item de uma NF-e de compra estruturada
// ============================================================
export interface ItemCompra {
  descricao: string
  quantidade: number
  valorUnitario: number
  valorTotal: number
}


// ------------------------------------------------------------
// BLOCO: 8 extensões de categoria — cada uma adiciona campos
// específicos à Despesa. Apenas o bloco correspondente à
// categoria_financeira é preenchido por documento.
// ------------------------------------------------------------
export interface ExtensaoAluguel {
  imovel: { endereco: string; periodoReferencia: string }
}

export interface ExtensaoTributosEstadualMunicipal {
  // FEATURE: 'federal' adicionado — cobre guias federais avulsas (fora da
  // relação com o escritório contábil, que continua indo em 'contabilidade')
  esfera: 'estadual' | 'municipal' | 'federal'
  orgaoArrecadador: string
  tributo: { codigo: string | null; descricao: string; periodoApuracao: string | null }
  identificadorBem: string | null
}

export interface ExtensaoConcessionariasUtilidades {
  servico: 'energia' | 'agua' | 'telefonia_internet_tv'
  codigoClienteUnidade: string | null
  enderecoUnidadeConsumidora: string | null
}

export interface ExtensaoTransporteFrete {
  transportadora: { nome: string; cnpj: string }
  numeroFaturaConhecimento: string | null
  chaveCTe: string | null
}

export interface ExtensaoCompraMercadoriaInsumo {
  fornecedor: { nome: string; cnpj: string | null; endereco: string | null }
  itens: ItemCompra[] | null
  descricaoLivre: string | null
  impostos: { icms: number; ipi: number }
}

export interface ExtensaoServicosProfissionais {
  prestador: { nome: string; cnpjCpf: string; regimeMei: boolean }
  descricaoServico: string
  chaveAcessoNFSe: string | null
  retencoes: { issRetido: number }
}

export interface ComposicaoTributo {
  codigo: string
  descricao: string
  principal: number
  multa: number
  juros: number
  total: number
}

export interface RubricaFolha {
  codigo: string
  descricao: string
  tipo: 'vencimento' | 'desconto'
  valor: number
}

export interface ItemHonorario {
  descricao: string
  valorBruto: number
  valorLiquido: number
}

export interface ExtensaoContabilidade {
  // Alteração autorizada no build do módulo Contas a Pagar:
  // 'retirada_socio' (Especificacao_Modulo_Contas_a_Pagar.md, §2.1) e
  // 'bonus_anual' (confirmado por Maycon nesta sessão — bônus isolado,
  // ocorre 1x/ano, aplicável ao caso Maycon-CPF no roster de beneficiários)
  subtipo: 'guia_tributo_federal' | 'honorarios_contabeis' | 'folha_pro_labore'
         | 'retirada_socio' | 'bonus_anual'
  composicaoTributos: ComposicaoTributo[] | null
  funcionario: { nome: string; cpf: string | null; cargo: string | null; admissao: string | null } | null
  rubricas: RubricaFolha[] | null
  itensHonorarios: ItemHonorario[] | null
}

export interface ExtensaoPlanoSaude {
  operadora: { nome: string; cnpj: string }
  titular: { nome: string; cpf: string | null }
  competencia: string
}


// ============================================================
// ExtensaoCategoria
// União de todas as extensões — cada campo é opcional pois só
// um deles é preenchido por vez, conforme a categoria financeira
// ============================================================
export interface ExtensaoCategoria {
  aluguel?: ExtensaoAluguel
  tributosEstadualMunicipal?: ExtensaoTributosEstadualMunicipal
  concessionariasUtilidades?: ExtensaoConcessionariasUtilidades
  transporteFrete?: ExtensaoTransporteFrete
  compraMercadoriaInsumo?: ExtensaoCompraMercadoriaInsumo
  servicosProfissionais?: ExtensaoServicosProfissionais
  contabilidade?: ExtensaoContabilidade
  planoSaude?: ExtensaoPlanoSaude
}


// ============================================================
// StatusPagamentoDespesa
// Valores válidos para o campo status_pagamento de despesas
// Distinto de StatusTitulo (Contas a Receber) — direções opostas
// de fluxo de caixa, não devem ser confundidos nem unificados
// ============================================================
export type StatusPagamentoDespesa =
  | 'em_aberto'    // Despesa lançada, parcela(s) ainda não paga(s)
  | 'pago_parcial' // QA fix (sessão 13/07/2026): título vinculado em Contas a Pagar
                    // foi parcialmente baixado (acúmulo automático ou baixa manual
                    // parcial) — sem esse valor, sincronizarStatusDespesaDoTitulo()
                    // (contasAPagarService.ts / motorConciliacao.ts) falha contra a
                    // CHECK constraint do banco ao tentar propagar 'pago_parcial'
  | 'pago'         // Liquidada (sem workflow de baixa automatizado nesta fase — ver spec seção 8)
  | 'cancelado'    // Soft-deleted — deleted_at preenchido


// ============================================================
// OrigemEntradaDespesa
// De onde veio o lançamento — usado para auditoria e para a UI
// decidir se mostra o aviso de fornecedor auto-criado etc.
// ============================================================
export type OrigemEntradaDespesa =
  | 'xml_nfse'       // Importado via NFS-e XML (parser direto, sem IA)
  | 'xml_nfe_compra' // Importado via NF-e de compra XML (parser direto, sem IA)
  | 'ia_gemini'      // Extraído via Gemini (PDF, imagem, TXT, DOC, XLS, XLSX)
  | 'manual'         // Lançamento manual, sem documento de origem
  // Valor novo, autorizado por Maycon durante o build do módulo Contas
  // a Pagar: Despesa criada automaticamente pelo motor de conciliação
  // (lib/pagar/motorConciliacao.ts), a partir de uma regra de roster
  // (despesa_automatica_baixada / excedente de holerite_com_abatimento
  // ou acumulo_ate_valor_integral) — nunca por documento de origem real
  | 'motor_conciliacao_pagar'


// ============================================================
// OrigemDespesaTipo
// Classificação determinística — empresarial vs. despesa pessoal
// de sócio/prestador MEI (Maycon) coberta pela empresa
// Referência: Especificacao_Modulo_Despesas.md, seção 5,
//             "origemDespesa Auto-Classification"
// ============================================================
export type OrigemDespesaTipo = 'empresarial' | 'pessoal_socio'


// ============================================================
// OrigemClassificacaoStatus
// Indica se a classificação automática teve sinais suficientes
// (3 de 4) ou se ficou pendente de revisão manual — nunca "chuta"
// ============================================================
export type OrigemClassificacaoStatus = 'auto_classificado' | 'revisao_manual'


// ============================================================
// Favorecido
// Quem recebe o pagamento (fornecedor/prestador/órgão) — bloco
// reutilizado tanto no resultado da extração quanto no classificador
// ============================================================
export interface Favorecido {
  nome:      string        // extraído literalmente do documento
  cnpjCpf:   string | null // formatado, null se mascarado/ilegível
  endereco:  string | null // preservado literalmente
}


// ============================================================
// OrigemDespesa
// Resultado da classificação — bloco reutilizado pelo classificador
// e pela persistência final da Despesa
// ============================================================
export interface OrigemDespesa {
  tipo: OrigemDespesaTipo
  beneficiarioPessoal: { nome: string; cpf: string | null; vinculo: string } | null
}


// ============================================================
// DocumentoExtraidoDespesa
// Contrato comum de saída de QUALQUER caminho de extração (parser
// de NFS-e XML, parser de NF-e de compra XML, ou extração via IA
// Gemini) — antes dos campos que são sempre preenchidos em código,
// nunca extraídos: fornecedor_id (via cross-reference), origem_*
// (via classificador determinístico) e status_pagamento (sempre
// 'em_aberto' na criação). Downstream (cross-reference, classificação,
// duplicidade) nunca precisa saber qual caminho produziu este objeto.
// Referência: Especificacao_Modulo_Despesas.md §5
// ============================================================
export interface DocumentoExtraidoDespesa {
  tipoDocumento:        TipoDocumento
  categoriaFinanceira:  CategoriaFinanceira
  favorecido: {
    nome:      string        // extraído literalmente, sem normalização (exceto aliases documentados)
    cnpjCpf:   string | null // formatado, null se mascarado/ilegível
    endereco:  string | null // preservado literalmente
  }
  documentoOrigem: {
    numeroDocumento: string | null
    dataEmissao:     string | null // ISO date (YYYY-MM-DD)
    competencia:      string | null
  }
  parcelas:            Parcela[]        // mínimo 1 parcela
  valores: {
    valorOriginal:    number
    valorDesconto:    number
    valorJurosMulta:  number
    valorTotal:       number
  }
  extensaoCategoria:   ExtensaoCategoria // apenas o bloco correspondente a categoriaFinanceira é preenchido
  origemIaSugestao?:   SugestaoIaOrigemDespesa | null // populado apenas no caminho IA — null/ausente nos parsers XML
}


// ============================================================
// SugestaoIaOrigemDespesa
// Campo auxiliar e NÃO vinculante retornado pelo Gemini junto da
// extração (origemDespesaSugeridaIA) — guardado só como referência
// na UI, nunca decide a classificação sozinho
// Referência: Handoff_Motor_Universal_..., seção 3.3
// ============================================================
export interface SugestaoIaOrigemDespesa {
  tipoSugerido:              OrigemDespesaTipo | 'indefinido' // IA pode responder "indefinido" livremente
  nomeBeneficiarioMencionado: string | null                   // nome que a IA associou à sugestão, se houver
  justificativa:             string                           // texto curto explicando o porquê da sugestão
}


// ============================================================
// Despesa
// Representa uma linha completa da tabela despesas — a entidade
// geradora (o documento/fato), equivalente a Receita no módulo
// espelhado, mas com schema próprio (ver Especificacao_Modulo_Despesas.md §2.1)
// ============================================================
export interface Despesa {
  id:                    string                  // UUID — PK gerado pelo Postgres

  // ── Documento ──────────────────────────────────────────
  tipo_documento:        TipoDocumento           // classificação do tipo de documento fonte
  categoria_financeira:  CategoriaFinanceira     // uma das 8 categorias financeiras fixas

  // ── Favorecido (quem recebe o pagamento) ──────────────
  favorecido_nome:       string                  // razão social/nome extraído literalmente
  favorecido_cnpj_cpf?:  string | null           // formatado, null se mascarado/ilegível
  favorecido_endereco?:  string | null           // endereço completo, preservado literalmente

  // ── Fornecedor vinculado (produção, sempre obrigatório) ─
  fornecedor_id:         number                  // FK → fornecedores.id (bigint/number, nunca nulo)
  fornecedor_auto_criado: boolean                // true se criado automaticamente pelo cross-reference

  // ── origemDespesa (classificação empresarial x pessoal) ─
  origem_tipo:                OrigemDespesaTipo           // resultado final da classificação
  origem_beneficiario_nome?:  string | null               // populado apenas quando origem_tipo === 'pessoal_socio'
  origem_beneficiario_cpf?:   string | null               // CPF do beneficiário, se disponível no roster
  origem_beneficiario_vinculo?: string | null             // 'socio' | 'prestador_mei', conforme roster
  origem_classificacao_status: OrigemClassificacaoStatus  // se a auto-classificação teve sinais suficientes
  origem_criterios_batidos:    string[]                   // ex: ['cnpj_exato'] ou ['nome_alias','endereco','unidade_consumidora']
  origem_ia_sugestao?:         SugestaoIaOrigemDespesa | null // sugestão não-vinculante da IA, referência na UI

  // ── Documento de origem ─────────────────────────────────
  documento_numero?:      string | null          // número da nota/guia/fatura, literal
  documento_data_emissao?: string | null         // ISO date (YYYY-MM-DD)
  documento_competencia?: string | null          // mês/ano de referência (ex: "2026-06")

  // ── Valores consolidados ────────────────────────────────
  valor_original:         number                 // valor bruto do documento
  valor_desconto:         number                 // desconto aplicado, 0 se não houver
  valor_juros_multa:      number                 // juros/multa, 0 se não houver
  valor_total:            number                 // valor final a pagar (soma líquida)

  status_pagamento:       StatusPagamentoDespesa // estado atual da despesa como um todo

  // ── Extensão específica da categoria ────────────────────
  extensao_categoria:     ExtensaoCategoria      // apenas o bloco correspondente à categoria_financeira é preenchido

  // ── Auditoria de origem do lançamento ───────────────────
  origem_entrada:         OrigemEntradaDespesa   // de onde veio: xml_nfse | xml_nfe_compra | ia_gemini | manual

  deleted_at?:             string | null         // timestamp de cancelamento — null = ativo
  created_at?:              string                // ISO timestamp — automático
  updated_at?:              string                // ISO timestamp — atualizado por trigger

  // ── Campos calculados via join — não existem na tabela ──
  parcelas?:               DespesaParcela[]      // join com despesas_parcelas (histórico de vencimentos)
}


// ============================================================
// DespesaInsert
// Tipo para INSERT — omite campos gerados automaticamente
// ============================================================
export type DespesaInsert = Omit<
  Despesa,
  'id' | 'created_at' | 'updated_at' | 'parcelas'
>


// ============================================================
// DespesaUpdate
// Tipo para UPDATE — todos os campos opcionais exceto id
// Usado pelo modal de edição (Especificacao_Modulo_Despesas.md §5,
// "Function: Edit Despesa") — toda edição deve propagar para
// despesas_parcelas na mesma operação, ver despesasService.ts
// ============================================================
export type DespesaUpdate = Partial<DespesaInsert> & { id: string }


// ============================================================
// DespesaParcela
// Representa uma linha completa da tabela despesas_parcelas —
// uma parcela/vencimento extraída de uma Despesa. Espelha a
// futura forma de contas_a_pagar (mesmo princípio de design)
// ============================================================
export interface DespesaParcela {
  id:                     string        // UUID — PK gerado pelo Postgres
  despesa_id:             string        // UUID — FK → despesas.id

  numero_parcela:         number        // posição desta parcela dentro do total (ex: 1 de 2)
  total_parcelas:         number        // quantidade total de parcelas na Despesa de origem
  valor:                  number        // valor desta parcela específica
  data_vencimento:        string        // ISO date (YYYY-MM-DD) — obrigatório, usado na deduplicação

  linha_digitavel?:       string | null // linha digitável do boleto, se houver
  codigo_barras?:         string | null // código de barras numérico, se houver
  nosso_numero?:          string | null // identificador do banco/beneficiário, se houver
  pode_gerar_segunda_via: boolean       // derivado da presença de dados de pagamento acima

  status:                 StatusPagamentoDespesa // estado desta parcela — inicia sempre 'em_aberto'

  deleted_at?:             string | null // timestamp de cancelamento — null = ativa
  created_at?:              string        // ISO timestamp — automático
  updated_at?:              string        // ISO timestamp — atualizado por trigger
}


// ============================================================
// DespesaParcelaInsert
// Tipo para INSERT — omite campos gerados automaticamente
// ============================================================
export type DespesaParcelaInsert = Omit<
  DespesaParcela,
  'id' | 'created_at' | 'updated_at'
>


// ============================================================
// FiltrosDespesas
// Estado dos filtros ativos na tela de listagem de Despesas
// Distinto de FiltrosContasReceber — direção de fluxo de caixa
// oposta, filtros próprios (categoria financeira, origem_tipo)
// ============================================================
export interface FiltrosDespesas {
  busca:               string                 // texto livre — favorecido, nº documento, CNPJ/CPF
  categoriaFinanceira: string                 // '' | CategoriaFinanceira — filtro de categoria
  origemTipo:          string                 // '' | OrigemDespesaTipo — filtro empresarial/pessoal_socio
  vencimentoDe:        string                 // data vencimento início — ISO date string
  vencimentoAte:       string                 // data vencimento fim — ISO date string
  status:              string                 // '' | StatusPagamentoDespesa — filtro de status
}


// ============================================================
// ModoModalDespesa
// Controla o modo de abertura do modal de Despesa
// 'revisar' = pós-importação (XML/IA), revisão antes de confirmar
// ============================================================
export type ModoModalDespesa = 'novo' | 'editar' | 'revisar' | null


// ============================================================
// ResultadoFornecedorMatchDespesa
// Retorno da função de Cross-Reference com a tabela fornecedores,
// já adaptada para o fluxo oficial (auto-criação silenciosa,
// nunca formulário manual como no protótipo de teste)
// Referência: Especificacao_Modulo_Despesas.md §5,
//             "Function: Fornecedor Cross-Reference"
// ============================================================
export interface ResultadoFornecedorMatchDespesa {
  fornecedorId:    number                                  // id do fornecedor vinculado (existente ou recém-criado)
  autoCriado:      boolean                                 // true se um novo fornecedor foi criado nesta operação
  criterioMatch:   string | null                           // ex: "cnpj_exato", "nome_endereco_fallback", null se autoCriado
  possivelDuplicado?: boolean                               // true se um fornecedor semelhante já existia (aviso, não bloqueia)
}


// ============================================================
// ResultadoOrigemDespesaClassificacaoDespesa
// Retorno da função determinística de classificação — mesmo
// contrato do protótipo (origemDespesaClassifier.ts), reexportado
// aqui com nome próprio do módulo para evitar acoplamento direto
// a types/despesas.ts nas camadas de UI de Despesas
// ============================================================
export interface ResultadoOrigemDespesaClassificacaoDespesa {
  status:            OrigemClassificacaoStatus // 'auto_classificado' | 'revisao_manual'
  criteriosBatidos:  string[]                  // sinais que bateram — ex: ['cnpj_exato_empresa'] ou ['nome_alias','endereco','unidade_consumidora_matricula']
}


// ============================================================
// ResultadoDuplicateCheckDespesa
// Retorno da checagem de duplicidade — só chave composta nesta
// fase (SEM hash de arquivo, pois o original não é persistido)
// Referência: Especificacao_Modulo_Despesas.md §5,
//             "Function: Duplicate Título Check"
// ============================================================
export interface ResultadoDuplicateCheckDespesa {
  duplicado:         boolean  // true → bloqueia "Confirmar e Gravar" por completo, sem override
  criterioDuplicidade: string | null // descrição do critério batido (favorecido + numeroDocumento + valor + vencimento)
}


// ============================================================
// ResultadoProcessamentoDespesa
// Envelope completo retornado pelas rotas de processamento
// (importar-xml.ts / importar-documento.ts) para a UI consumir
// antes da confirmação — espelha ResultadoProcessamento do
// protótipo, mas com os tipos próprios de Despesas
// ============================================================
export interface ResultadoProcessamentoDespesa {
  despesa:                DespesaInsert                              // dados prontos para revisão/edição antes de gravar
  parcelas:                DespesaParcelaInsert[]                    // uma ou mais parcelas extraídas (mínimo 1)
  fornecedorMatch:         ResultadoFornecedorMatchDespesa           // resultado do cruzamento/auto-criação de fornecedor
  origemDespesaClassificacao: ResultadoOrigemDespesaClassificacaoDespesa // resultado da classificação automática
  duplicateCheck:          ResultadoDuplicateCheckDespesa            // resultado da checagem de duplicidade
}


// ============================================================
// BeneficiarioPessoalRoster
// Registro do roster de beneficiários pessoais (espelha a tabela
// de produção beneficiarios_pessoais no Supabase — sócios +
// prestador MEI, conforme item 1 do build)
// ============================================================
export interface BeneficiarioPessoalRoster {
  id:       string    // UUID da linha na tabela beneficiarios_pessoais
  nome:     string    // nome completo do beneficiário
  cpf:      string | null // CPF do beneficiário, se cadastrado
  vinculo:  string    // "socio" ou "prestador_mei"
  aliases:  string[]  // lista de apelidos/nomes alternativos documentados
  // QA fix (achado Alto #1 — Relatorio_Auditoria_Modulo_Despesas.md):
  // campo de endereço cadastrado do beneficiário, necessário para o sinal
  // "endereço" da classificação de 3-de-4 sinais realmente COMPARAR o
  // endereço do documento contra o endereço de CADA beneficiário testado,
  // em vez de apenas checar se existe algum endereço em ambos os lados
  // (o que antes disparava igual para qualquer beneficiário, sempre que
  // houvesse algum endereço no documento — não era discriminante).
  // Requer a coluna "endereco" (text, nullable) na tabela de produção
  // beneficiarios_pessoais — ainda não existe, precisa ser adicionada via
  // SQL Editor do Supabase, mesmo processo manual já usado para as demais
  // colunas desta tabela (ver Handoff_Despesas_Modulo_Para_Deep_Code_Audit.md §3).
  endereco: string | null
}


// ============================================================
// STATUS_PAGAMENTO_LABELS
// Labels legíveis para cada status — usados em badges e filtros
// ============================================================
export const STATUS_PAGAMENTO_LABELS: Record<StatusPagamentoDespesa, string> = {
  em_aberto:    'Em Aberto',
  pago_parcial: 'Pago Parcial',
  pago:         'Pago',
  cancelado:    'Cancelado',
}


// ============================================================
// STATUS_PAGAMENTO_CORES
// Cores de badge para cada status — usadas em DespesasTabela
// e DespesasMobileList
// ============================================================
export const STATUS_PAGAMENTO_CORES: Record<StatusPagamentoDespesa, { bg: string; text: string }> = {
  // QA fix (a pedido do Maycon, sessão 12/07/2026): "Em Aberto" passa
  // a ser azul em todo o sistema (Receitas fica de fora, tela
  // diferente) — texto no tom primário do projeto (#1a6094)
  em_aberto:    { bg: '#dbeafe', text: '#1a6094' }, // azul — aguardando pagamento
  pago_parcial: { bg: '#fef3c7', text: '#92400e' }, // âmbar — mesmo tom de contas_a_pagar.pago_parcial
  pago:         { bg: '#dcfce7', text: '#166534' }, // verde — liquidado
  cancelado:    { bg: '#f3f4f6', text: '#9ca3af' }, // cinza — soft-deleted
}


// ============================================================
// ORIGEM_TIPO_LABELS
// Labels legíveis para origem_tipo — usados em badges de
// classificação empresarial x pessoal_socio na listagem
// ============================================================
export const ORIGEM_TIPO_LABELS: Record<OrigemDespesaTipo, string> = {
  empresarial:   'Empresarial',
  pessoal_socio: 'Pessoal (Sócio)',
}


// ============================================================
// CATEGORIA_FINANCEIRA_LABELS
// Labels legíveis para as 8 categorias fixas — usados no
// select de filtro e na exibição da Despesa na listagem
// ============================================================
export const CATEGORIA_FINANCEIRA_LABELS: Record<CategoriaFinanceira, string> = {
  aluguel:                       'Aluguel',
  // FEATURE (a pedido do usuário): rótulo ampliado para incluir Federal.
  // O valor interno da categoria continua 'tributos_estadual_municipal'
  // (não renomeado), para não exigir migração dos registros já gravados
  // com esse valor — a ampliação é só na cobertura semântica: guias
  // federais AVULSAS (fora da relação com o escritório contábil) agora
  // também cabem aqui, via esfera: 'federal'. DARF/DAS vindos do
  // escritório contábil continuam em 'contabilidade' (decisão do usuário,
  // sem alterar essa rota de classificação).
  tributos_estadual_municipal:   'Tributos Federais/Estadual/Municipal',
  concessionarias_utilidades:    'Concessionárias e Utilidades',
  transporte_frete:              'Transporte/Frete',
  compra_mercadoria_insumo:      'Compra de Mercadoria/Insumo',
  servicos_profissionais:        'Serviços Profissionais',
  contabilidade:                 'Contabilidade',
  plano_saude:                   'Plano de Saúde',
}
