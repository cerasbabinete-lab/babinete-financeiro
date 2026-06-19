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
  name: string   // Nome do contato WhatsApp
  phone: string  // Número do telefone
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
  data_nascimento?: string            // Data nascimento (CPF/pessoa física) — modal only
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
