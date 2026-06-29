// ============================================================
// types/contasReceber.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Receber
// Função: Tipagem TypeScript completa das tabelas
//         contas_receber, contas_receber_eventos,
//         remessas_importadas e tipos auxiliares de UI
// Conecta com: contasReceberService.ts, txtBbParser.ts,
//              remParser.ts, retParser.ts, boletoGenerator.ts,
//              ContasReceberTabela.tsx, ContasReceberModal.tsx,
//              ContasReceberMobileList.tsx, ContasReceberHeader.tsx,
//              ContasReceberModalAvisos.tsx
// ============================================================


// ============================================================
// STATUS_TITULO
// Valores válidos para o campo status de contas_receber
// Controlados exclusivamente pela aplicação — nunca inserir
// valores fora desta lista no banco
// ============================================================
export type StatusTitulo =
  | 'em_aberto'         // Título gerado, ainda não liquidado
  | 'pago'              // Liquidado via retorno bancário RET (código BB 06 ou 09)
  | 'recebido_pix_ted'  // Liquidado manualmente via PIX ou Transferência
  | 'protestado'        // Enviado a protesto (código BB 25)
  | 'enviado_cartorio'  // Enviado ao cartório (código BB 23)
  | 'cancelado'         // Soft-deleted — deleted_at preenchido


// ============================================================
// FORMA_BAIXA
// Valores válidos para o campo forma_baixa de contas_receber
// ============================================================
export type FormaBaixa =
  | 'ret'           // Baixa automática via arquivo RET CNAB 240
  | 'pix'           // Baixa manual — PIX
  | 'transferencia' // Baixa manual — Transferência bancária


// ============================================================
// TIPO_EVENTO
// Valores válidos para o campo tipo de contas_receber_eventos
// ============================================================
export type TipoEvento =
  | 'criado'                  // Título criado (import ou manual)
  | 'nosso_numero_vinculado'  // Nosso Número populado via TXT BB ou REM
  | 'baixa_ret'               // Baixa automática via RET
  | 'baixa_manual'            // Baixa manual registrada pelo usuário
  | 'protestado'              // Status alterado para protestado
  | 'enviado_cartorio'        // Status alterado para enviado_cartorio
  | 'cancelado'               // Título cancelado (soft-delete)
  | 'reaberto'                // Título reaberto após cancelamento ou baixa manual
  | 'email_enviado'           // E-mail de aviso de vencimento enviado
  | 'ocorrencia_informativa'  // Ocorrência RET sem mudança de status


// ============================================================
// TIPO_REMESSA
// Valores válidos para o campo tipo de remessas_importadas
// ============================================================
export type TipoRemessa = 'txt_bb' | 'rem' | 'ret'


// ============================================================
// ContaReceber
// Representa uma linha completa da tabela contas_receber
// Inclui campos calculados via join (eventos, receita)
// ============================================================
export interface ContaReceber {
  id:                  string        // UUID — PK gerado pelo Postgres
  duplicata_id?:       string | null // UUID — FK → receitas_duplicatas (SET NULL)
  receita_id?:         string | null // UUID — FK → receitas (SET NULL)
  cliente_id?:         number | null // INTEGER — FK → clientes (SET NULL)

  numero_documento:    string        // Ex: "005414/1", "005419"
  numero_duplicata:    string        // Ex: "001", "002"
  data_vencimento:     string        // ISO date — "YYYY-MM-DD"
  data_processamento:  string        // ISO date — data de criação no módulo
  valor:               number        // Valor do título em reais

  nosso_numero?:       string | null // "Nosso Número" BB — null até import TXT BB/REM
  linha_digitavel?:    string | null // Linha digitável completa — null até import TXT BB

  status:              StatusTitulo  // Estado atual do título
  data_baixa?:         string | null // ISO date — data de liquidação
  forma_baixa?:        FormaBaixa | null // Como foi liquidado

  // Dados históricos do sacado — IMUTÁVEIS após criação
  // Não são sobrescritos por alterações na tabela clientes
  cliente_nome:        string        // Razão social no momento da emissão
  cliente_cpf_cnpj:    string        // CNPJ/CPF sem pontuação
  cliente_fantasia?:   string | null // Nome fantasia — pode ser null
  cliente_email?:      string | null // E-mail — editável por título para alertas
  cliente_fone?:       string | null // Telefone — para link WhatsApp
  cliente_municipio?:  string | null // Cidade
  cliente_uf?:         string | null // UF (2 chars — ex: "PR")

  observacoes?:        string | null // Notas internas — campo livre

  deleted_at?:         string | null // Timestamp de cancelamento — null = ativo
  created_at?:         string        // ISO timestamp — automático
  updated_at?:         string        // ISO timestamp — atualizado por trigger

  // Campos calculados via join — não existem na tabela
  eventos?: ContaReceberEvento[]     // Join com contas_receber_eventos (histórico)
}


// ============================================================
// ContaReceberInsert
// Tipo para INSERT — omite campos gerados automaticamente
// ============================================================
export type ContaReceberInsert = Omit<
  ContaReceber,
  'id' | 'created_at' | 'updated_at' | 'eventos'
>


// ============================================================
// ContaReceberUpdate
// Tipo para UPDATE — todos os campos opcionais exceto id
// ============================================================
export type ContaReceberUpdate = Partial<ContaReceberInsert> & { id: string }


// ============================================================
// ContaReceberEvento
// Representa uma linha da tabela contas_receber_eventos
// Imutável — apenas INSERT, nunca UPDATE ou DELETE
// ============================================================
export interface ContaReceberEvento {
  id:         string      // UUID — PK
  titulo_id:  string      // UUID — FK → contas_receber (CASCADE DELETE)
  tipo:       TipoEvento  // Tipo do evento — ver TipoEvento acima
  descricao:  string      // Descrição legível em PT-BR gerada pela aplicação
  created_at: string      // ISO timestamp — automático
}


// ============================================================
// RemessaImportada
// Representa uma linha da tabela remessas_importadas
// Registra cada arquivo bancário importado para idempotência
// ============================================================
export interface RemessaImportada {
  id:               string       // UUID — PK
  tipo:             TipoRemessa  // 'txt_bb' | 'rem' | 'ret'
  nome_arquivo:     string       // Nome original do arquivo
  hash_arquivo:     string       // SHA-256 do conteúdo — UNIQUE
  total_registros:  number       // Total de linhas de dados parseadas
  processados:      number       // Linhas vinculadas com sucesso
  nao_encontrados:  number       // Linhas sem correspondência
  created_at:       string       // ISO timestamp — automático
}


// ============================================================
// FiltrosContasReceber
// Estado dos filtros ativos na tela de listagem
// ============================================================
export interface FiltrosContasReceber {
  busca:           string  // Texto livre — nome, CNPJ, nº doc, nosso número
  vencimentoDe:    string  // Data vencimento início — ISO date string
  vencimentoAte:   string  // Data vencimento fim — ISO date string
  status:          string  // '' | StatusTitulo — filtro de status
}


// ============================================================
// ModoModal
// Controla o modo de abertura do modal de título
// ============================================================
export type ModoModal = 'novo' | 'editar' | 'visualizar' | null


// ============================================================
// ResultadoImportTxtBb
// Retorno da função de importação do arquivo TXT BB
// ============================================================
export interface ResultadoImportTxtBb {
  vinculados:      number                          // Nosso Número vinculado a título existente
  naoEncontrados:  number                          // Registros sem título correspondente
  jaExistentes:    number                          // Duplicatas — ignorados
  avulsosCriados:  number                          // Novos títulos criados para registros sem NF-e
  detalhes:        ResultadoLinhaImport[]          // Detalhe por linha processada
}


// ============================================================
// ResultadoImportRem
// Retorno da função de importação do arquivo REM CNAB 240
// ============================================================
export interface ResultadoImportRem {
  vinculados:     number                          // Nosso Número vinculado
  naoEncontrados: number                          // Sem correspondência
  jaExistentes:   number                          // Já tinham nosso_numero — pulados
  detalhes:       ResultadoLinhaImport[]          // Detalhe por registro
}


// ============================================================
// ResultadoImportRet
// Retorno da função de importação do arquivo RET CNAB 240
// ============================================================
export interface ResultadoImportRet {
  baixados:              number                   // Títulos liquidados (pago)
  atualizados:           number                   // Status alterado (protestado, cartório)
  naoEncontrados:        number                   // Nosso Número sem correspondência
  ocorrenciasInformativas: number                 // Códigos sem mudança de status
  detalhes:              ResultadoLinhaImport[]   // Detalhe por registro
}


// ============================================================
// ResultadoLinhaImport
// Detalhe de uma linha processada em qualquer import bancário
// Exibido na UI inline após o processamento
// ============================================================
export interface ResultadoLinhaImport {
  nossoNumero?:      string        // Nosso número extraído do arquivo
  numeroDocumento?:  string        // Número do documento extraído
  resultado:         'vinculado' | 'nao_encontrado' | 'ja_existe' | 'avulso_criado'
                   | 'baixado' | 'atualizado' | 'informativo' | 'erro'
  descricao:         string        // Mensagem legível para o usuário
}


// ============================================================
// RegistroTxtBb
// Dados extraídos de uma linha de dados do arquivo TXT BB
// Parseados por txtBbParser.ts a partir de posições fixas
// ============================================================
export interface RegistroTxtBb {
  carteira:        string   // Carteira (pos 8–9)
  nossoNumero:     string   // Nosso Número (pos 23–40) — trimmed
  numeroDocumento: string   // Número do documento (pos 41–54) — trimmed
  dataEmissao:     string   // Data emissão DDMMYYYY (pos 55–62)
  dataVencimento:  string   // Data vencimento DDMMYYYY (pos 63–70)
  valor:           number   // Valor em reais (pos 71–82) — dividido por 100
  cnpjCpf:         string   // CNPJ/CPF do sacado (pos 133–148) — trimmed
  nomeSacado:      string   // Nome do sacado (pos 149–188) — trimmed
  endereco:        string   // Endereço (pos 189–227) — trimmed
  cep:             string   // CEP (pos 228–235) — trimmed
  municipio:       string   // Cidade (pos 236–250) — trimmed
  uf:              string   // UF (pos 251–252) — trimmed
  linhaDigitavel?: string   // Linha digitável — extraída do registro de header/trailer se disponível
}


// ============================================================
// RegistroRemSegmentoP
// Dados do Segmento P (cobrança) do arquivo REM CNAB 240
// Parseados por remParser.ts
// ============================================================
export interface RegistroRemSegmentoP {
  nossoNumero:     string  // Posições 43–57 — trimmed
  numeroDocumento: string  // Posições 58–72 — trimmed
  dataVencimento:  string  // Posições 73–80 — DDMMYYYY
  valor:           number  // Posições 81–95 — dividido por 100
}


// ============================================================
// RegistroRemSegmentoQ
// Dados do Segmento Q (sacado) do arquivo REM CNAB 240
// Parseados por remParser.ts — complementa o Segmento P
// ============================================================
export interface RegistroRemSegmentoQ {
  cnpjCpf:    string  // CNPJ/CPF do sacado — extraído das posições do segmento Q
  nomeSacado: string  // Nome do sacado — trimmed
  endereco:   string  // Endereço completo — trimmed
  cep:        string  // CEP — trimmed
  municipio:  string  // Cidade — trimmed
  uf:         string  // UF — trimmed
}


// ============================================================
// RegistroRetSegmentoT
// Dados do Segmento T (liquidação) do arquivo RET CNAB 240
// Parseados por retParser.ts
// ============================================================
export interface RegistroRetSegmentoT {
  nossoNumero:      string  // Identificação do título no banco
  codigoOcorrencia: string  // Código de ocorrência BB (ex: "06", "09", "23", "25")
  dataOcorrencia:   string  // Data da ocorrência DDMMYYYY
  valorPago:        number  // Valor efetivamente pago — dividido por 100
  juros:            number  // Juros/mora — dividido por 100
  desconto:         number  // Desconto concedido — dividido por 100
}


// ============================================================
// TituloAvisoVencimento
// Título near-due usado na tela ContasReceberModalAvisos
// Enriquecido com email editável e flag de seleção
// ============================================================
export interface TituloAvisoVencimento {
  id:               string        // UUID do título
  numero_documento: string        // Número do documento
  cliente_nome:     string        // Razão social
  data_vencimento:  string        // ISO date
  valor:            number        // Valor do título
  emailEditavel:    string        // E-mail pré-preenchido — editável pelo usuário
  selecionado:      boolean       // Checkbox de seleção na modal de avisos
}


// ============================================================
// STATUS_LABELS
// Labels legíveis para cada status — usados em badges e filtros
// ============================================================
export const STATUS_LABELS: Record<StatusTitulo, string> = {
  em_aberto:        'Em Aberto',
  pago:             'Pago',
  recebido_pix_ted: 'Recebido PIX/TED',
  protestado:       'Protestado',
  enviado_cartorio: 'Cartório',
  cancelado:        'Cancelado',
}


// ============================================================
// STATUS_CORES
// Cores de badge para cada status — usadas em ContasReceberTabela
// e ContasReceberMobileList
// ============================================================
export const STATUS_CORES: Record<StatusTitulo, { bg: string; text: string }> = {
  em_aberto:        { bg: '#dbeafe', text: '#1e40af' }, // azul
  pago:             { bg: '#dcfce7', text: '#166534' }, // verde
  recebido_pix_ted: { bg: '#d1fae5', text: '#065f46' }, // verde-teal
  protestado:       { bg: '#ffedd5', text: '#9a3412' }, // laranja
  enviado_cartorio: { bg: '#fce7f3', text: '#9d174d' }, // rosa
  cancelado:        { bg: '#f3f4f6', text: '#9ca3af' }, // cinza
}


// ============================================================
// MAPEAMENTO_OCORRENCIAS_RET
// Mapeamento de códigos de ocorrência BB CNAB 240 → StatusTitulo
// Códigos não presentes aqui são tratados como informativos
// sem mudança de status
// ============================================================
export const MAPEAMENTO_OCORRENCIAS_RET: Record<string, StatusTitulo | null> = {
  '06': 'pago',             // Liquidação normal
  '09': 'pago',             // Liquidação por conta (parcial)
  '17': 'pago',             // Liquidação após baixa
  '23': 'enviado_cartorio', // Remessa a cartório
  '25': 'protestado',       // Protestado
}


// ============================================================
// CEDENTE_BB
// Dados fixos do cedente (Ceras Babinete) para geração do boleto
// Usado em boletoGenerator.ts e pages/api/boleto.ts
// ============================================================
export const CEDENTE_BB = {
  nome:        'CERAS BABINETE LTDA. ME',
  cnpj:        '10666614000160',   // Sem pontuação — 14 dígitos
  agencia:     '3512',             // Agência sem dígito
  agenciaDigito: '2',              // Dígito da agência
  conta:       '0000025605',       // Conta sem dígito — 10 dígitos
  contaDigito: '6',                // Dígito da conta
  carteira:    '17',               // Carteira de cobrança BB
  endereco: {
    logradouro: 'AV DOS PALMARES, 831',
    bairro:     'JARDIM AMERICA',
    cidade:     'MARINGA',
    estadoUF:   'PR',
    cep:        '87045-290',
  },
} as const
