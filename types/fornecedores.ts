// ============================================================
// types/fornecedores.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Fornecedores
// Função: Tipagem TypeScript completa da tabela fornecedores
//         Clone funcional de types/clientes.ts — sem nomelista,
//         com campos novos: website, dados_bancarios, data_nascimento
// Conecta com: fornecedoresService.ts, FornecedoresModal.tsx,
//              FornecedoresTabela.tsx, FornecedoresMobileList.tsx
// ============================================================

// ============================================================
// ContatoWhatsApp
// Reutiliza a mesma estrutura do módulo Clientes
// ============================================================
export interface ContatoWhatsApp {
  name: string        // Nome do contato WhatsApp
  phone: string       // Número do telefone
  favorito?: boolean  // Contato favorito — Especificacao_Fornecedores_Pix_Categorias_
                       // WhatsApp.md, Seção 2.1. No máximo 1 true por fornecedor,
                       // aplicado em código (WhatsAppSection.tsx), não em banco —
                       // coluna é JSONB de linha única, não tabela separada.
}

// ============================================================
// TipoChavePix
// Valores possíveis do tipo de chave Pix de um fornecedor — espelha
// 1:1 o CHECK de sql/fornecedores.sql (fornecedor_chaves_pix.tipo_chave).
// Especificacao_Fornecedores_Pix_Categorias_WhatsApp.md, Seção 1.
// ============================================================
export type TipoChavePix =
  | 'cpf'
  | 'cnpj'
  | 'email'
  | 'celular'
  | 'aleatoria'

// ============================================================
// ChavePix
// Representa um registro completo da tabela fornecedor_chaves_pix —
// um fornecedor pode ter 0..N, no máximo 1 com preferencial=true
// (garantido por índice único parcial no banco, Seção 1.2)
// ============================================================
export interface ChavePix {
  id: number                  // Chave primária auto-increment
  fornecedor_id: number       // FK — fornecedor dono da chave
  tipo_chave: TipoChavePix    // Tipo selecionado no formulário
  valor_chave: string         // Valor da chave — sem validação de formato (Seção 1.1)
  preferencial: boolean       // true = usada pelo Dashboard futuro e pela 2ª via de boleto
  created_at: string          // Criado em (ISO string)
  updated_at: string          // Atualizado em (ISO string)
  deleted_at: string | null   // Soft-delete — null enquanto ativa
}

// ============================================================
// OPCOES_TIPO_CHAVE_PIX
// Lista ordenada de {value,label} para popular o <select> do tipo de
// chave no bloco "Chaves Pix" de FornecedoresModal.tsx — evita
// duplicar a lista de valores em cada tela que precisar dela
// ============================================================
export const OPCOES_TIPO_CHAVE_PIX: { value: TipoChavePix; label: string }[] = [
  { value: 'cpf', label: 'CPF' },
  { value: 'cnpj', label: 'CNPJ' },
  { value: 'email', label: 'E-mail' },
  { value: 'celular', label: 'Celular' },
  { value: 'aleatoria', label: 'Aleatória' },
]

// ============================================================
// FornecedorCategoria
// Representa um registro completo da tabela fornecedor_categorias —
// substitui o antigo union fechado TipoFornecedor/TIPO_FORNECEDOR_LABELS
// (removidos nesta revisão) por uma lista totalmente gerenciável pelo
// usuário via CategoriasModal.tsx. Especificação, Seção 4.
// ============================================================
export interface FornecedorCategoria {
  id: number                  // Chave primária auto-increment
  nome: string                 // Nome da categoria, editável pelo usuário
  created_at: string          // Criado em (ISO string)
  updated_at: string          // Atualizado em (ISO string)
  deleted_at: string | null   // Soft-delete — null enquanto ativa
}

// ============================================================
// Fornecedor
// Representa um registro completo da tabela fornecedores
// Sem nomelista — não existe conceito de ativo/inativo neste módulo
// ============================================================
export interface Fornecedor {
  id: number                          // Chave primária auto-increment (Código)
  razao: string                       // Razão Social (obrigatório)
  fantasia?: string                   // Nome Fantasia
  end?: string                        // Endereço
  num?: string                        // Número
  bairro?: string                     // Bairro
  cep?: string                        // CEP
  cidade?: string                     // Cidade
  uf?: string                         // UF — sigla do estado (2 chars)
  cnpj?: string                       // CNPJ formatado
  cpf?: string                        // CPF formatado (fornecedor pode ser PF)
  ie?: string                         // Inscrição Estadual
  fone1?: string                      // Telefone principal
  fone2?: string                      // Telefone secundário
  contato?: string                    // Nome do contato principal
  fone_contato?: string               // Telefone do contato
  email?: string                      // E-mail principal
  email_contato?: string              // E-mail do contato
  website?: string                    // Website do fornecedor — campo novo
  dados_bancarios?: string            // Dados bancários (free text) — campo novo
  tipo_fornecedor_id?: number | null  // FK p/ fornecedor_categorias — Classificação usada pelo
                                       // relatório 2.6 — null até classificação manual (substitui
                                       // o antigo campo tipo_fornecedor TEXT, removido do banco)
  data_nascimento?: string | null     // Data nascimento (CPF/pessoa física) — modal only; null quando vazio
  observacoes?: string                // Observações livres
  contato_whatsapp?: ContatoWhatsApp[] // Contatos WhatsApp Business (JSONB)
  created_at?: string                 // Criado em (ISO string)
  updated_at?: string                 // Atualizado em (ISO string)
}

// ============================================================
// FornecedorInsert
// Tipo para INSERT — omite campos gerados automaticamente
// ============================================================
export type FornecedorInsert = Omit<Fornecedor, 'id' | 'created_at' | 'updated_at'>

// ============================================================
// FornecedorUpdate
// Tipo para UPDATE — todos os campos opcionais exceto id
// ============================================================
export type FornecedorUpdate = Partial<FornecedorInsert> & { id: number }

// ============================================================
// FiltrosFornecedores
// Apenas busca textual — sem filtros de Lista/Status (não existem neste módulo)
// ============================================================
export interface FiltrosFornecedores {
  busca: string  // Texto livre — busca em fantasia, razao, cnpj, cpf, cidade
}

// ============================================================
// ModoModal
// Controla o modo de abertura do modal de fornecedor
// ============================================================
export type ModoModal = 'novo' | 'editar' | 'visualizar' | null
