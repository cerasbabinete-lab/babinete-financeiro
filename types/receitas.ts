// ============================================================
// types/receitas.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Receitas
// Função: Tipagem TypeScript completa das tabelas receitas,
//         receitas_itens, receitas_duplicatas e transportadoras
// Conecta com: receitasService.ts, transportadorasService.ts,
//              ReceitasModal.tsx, ReceitasTabela.tsx,
//              ReceitasMobileList.tsx, xmlParser.ts
// ============================================================


// ============================================================
// Transportadora
// Registro da tabela transportadoras
// Populado automaticamente via import XML — sem tela de gestão
// ============================================================
export interface Transportadora {
  id: string                  // UUID — PK
  cnpj: string                // CNPJ sem pontuação (14 dígitos)
  nome: string                // Razão social (xNome do XML)
  endereco?: string           // Endereço (xEnder do XML)
  municipio?: string          // Município (xMun do XML)
  uf?: string                 // UF — sigla 2 chars
  created_at?: string         // ISO string
  updated_at?: string         // ISO string
}

// ============================================================
// ReceitaItem
// Representa um item (produto) da NF-e — tabela receitas_itens
// Imutável após import XML
// ============================================================
export interface ReceitaItem {
  id: string                  // UUID — PK
  receita_id: string          // UUID — FK → receitas (CASCADE DELETE)
  codigo_produto?: string     // Código/EAN do produto (cProd / cEAN)
  descricao: string           // Descrição do produto (xProd)
  unidade?: string            // Unidade comercial (uCom) ex: "UN"
  quantidade: number          // Quantidade (qCom)
  valor_unitario: number      // Valor unitário — 10 casas decimais (vUnCom)
  valor_total: number         // Valor total do item (vProd)
  valor_desconto: number      // Desconto no item (vDesc)
  valor_frete: number         // Frete rateado no item (vFrete)
  cfop?: string               // CFOP: "5101" (intra) ou "6101" (inter)
  created_at?: string         // ISO string
}

// ============================================================
// Duplicata
// Representa uma parcela da cobrança — tabela receitas_duplicatas
// Forma de Pagamento é SEMPRE derivada do count de duplicatas:
//   count >= 1 → "Boleto" | count = 0 → "À vista"
// ============================================================
export interface Duplicata {
  id: string                  // UUID — PK
  receita_id: string          // UUID — FK → receitas (CASCADE DELETE)
  numero_duplicata: string    // Número da parcela (nDup) ex: "001", "002"
  data_vencimento: string     // Data de vencimento ISO (dVenc)
  valor: number               // Valor da parcela (vDup)
  created_at?: string         // ISO string
}

// ============================================================
// Receita
// Representa um registro completo da tabela receitas
// Dados fiscais são imutáveis após import — nunca sobrescrever
// com dados atuais de clientes ou transportadoras
// ============================================================
export interface Receita {
  id: string                      // UUID — PK

  // Identificação da NF-e
  numero_nf: number               // Número da nota (nNF)
  serie: number                   // Série (serie do XML)
  chave_acesso: string            // Chave 44 dígitos (chNFe) — UNIQUE
  protocolo?: string              // Protocolo SEFAZ (nProt)
  data_emissao: string            // Data/hora emissão ISO (dhEmi)
  data_autorizacao?: string       // Data/hora autorização ISO (dhRecbto)
  natureza_operacao?: string      // Natureza da operação (natOp) ex: "VENDA"
  id_dest?: number                // 1=intraestadual, 2=interestadual
  status_nf?: number              // 100=autorizada (cStat)

  // Vínculo com Clientes (nullable — link, não fonte de verdade)
  cliente_id?: number | null      // INTEGER — FK → clientes.id (SET NULL)

  // Dados históricos do destinatário (imutáveis após import)
  cliente_cpf_cnpj?: string       // CPF/CNPJ sem pontuação
  cliente_nome?: string           // Razão social histórica
  cliente_ie?: string             // Inscrição Estadual
  cliente_fone?: string           // Telefone
  cliente_email?: string          // E-mail
  cliente_logradouro?: string     // Logradouro
  cliente_numero?: string         // Número do endereço
  cliente_complemento?: string    // Complemento
  cliente_bairro?: string         // Bairro
  cliente_municipio?: string      // Município
  cliente_uf?: string             // UF (2 chars)
  cliente_cep?: string            // CEP sem hífen (8 dígitos)

  // Valores financeiros
  valor_produtos: number          // Valor total dos produtos (vProd)
  valor_frete: number             // Valor do frete (vFrete)
  valor_seguro: number            // Valor do seguro (vSeg)
  valor_desconto: number          // Valor do desconto (vDesc)
  valor_outras: number            // Outras despesas (vOutro)
  valor_ipi: number               // IPI — sempre 0 para Ceras Babinete
  valor_nf: number                // Valor total da nota (vNF) — campo principal

  // Transporte
  transportadora_id?: string | null  // UUID — FK → transportadoras (SET NULL)
  modalidade_frete?: number          // 0=Remetente,1=Destinatário,2=Terceiros,9=Sem frete
  volume_qtd?: number                // Quantidade de volumes (qVol)
  volume_marca?: string              // Marca dos volumes
  volume_numero?: string             // Numeração dos volumes
  peso_liquido?: number              // Peso líquido em kg
  peso_bruto?: number                // Peso bruto em kg

  // Fatura
  fatura_numero?: string          // Número da fatura (nFat)
  fatura_valor_original?: number  // Valor original (vOrig)
  fatura_valor_desconto?: number  // Desconto da fatura (vDesc)

  // Storage / Observações
  xml_storage_path?: string       // Path no bucket receitas_xml
  observacoes?: string            // Campo livre (infCpl do XML)

  // Controle
  created_at?: string
  updated_at?: string

  // Campos calculados — preenchidos via join no select (não existem na tabela)
  transportadora?: Transportadora | null   // Join com transportadoras
  itens?: ReceitaItem[]                    // Join com receitas_itens
  duplicatas?: Duplicata[]                 // Join com receitas_duplicatas
}

// ============================================================
// ReceitaInsert
// Tipo para INSERT — omite campos gerados automaticamente
// ============================================================
export type ReceitaInsert = Omit<Receita,
  'id' | 'created_at' | 'updated_at' | 'transportadora' | 'itens' | 'duplicatas'
>

// ============================================================
// ReceitaUpdate
// Tipo para UPDATE — todos os campos opcionais exceto id
// ============================================================
export type ReceitaUpdate = Partial<ReceitaInsert> & { id: string }

// ============================================================
// FiltrosReceitas
// Estado dos filtros ativos na tela de listagem
// ============================================================
export interface FiltrosReceitas {
  busca: string           // Texto livre — nome, CNPJ/CPF, nº NF
  dataEmissaoDe: string   // Data emissão início (ISO date string)
  dataEmissaoAte: string  // Data emissão fim (ISO date string)
  prazo: string           // '' | '0' | '15DD' | '30DD' | '30/60DD' etc.
  formaPagamento: string  // '' | 'Boleto' | 'À vista'
  transportadoraId: string // '' | uuid da transportadora
}

// ============================================================
// ModoModal
// Controla o modo de abertura do modal de receita
// ============================================================
export type ModoModal = 'novo' | 'editar' | 'visualizar' | null

// ============================================================
// ResultadoImportXml
// Retorno da função de import em lote de XMLs
// ============================================================
export interface ResultadoImportXml {
  success: number
  errors: { file: string; reason: string }[]
}

// ============================================================
// OPCOES_MODALIDADE_FRETE
// Valores válidos para o campo modalidade_frete
// ============================================================
export const OPCOES_MODALIDADE_FRETE = [
  { value: 0, label: '0 — Por conta do Remetente' },
  { value: 1, label: '1 — Por conta do Destinatário' },
  { value: 2, label: '2 — Por conta de Terceiros' },
  { value: 9, label: '9 — Sem frete' },
] as const
