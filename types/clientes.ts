// ============================================================
// types/clientes.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Clientes
// Função: Tipagem TypeScript completa da tabela clientes
// Conecta com: clientesService.ts, ClientesModal.tsx,
//              ClientesTabela.tsx, ClientesMobileList.tsx
// ============================================================

// ============================================================
// ContatoWhatsApp
// Representa um contato da seção WhatsApp Business
// Armazenado como array JSONB no campo contato_whatsapp
// ============================================================
export interface ContatoWhatsApp {
  name: string   // Nome do contato WhatsApp
  phone: string  // Número do telefone (ex: 44999990000)
}

// ============================================================
// Cliente
// Representa um registro completo da tabela clientes
// Todos os campos opcionais exceto id, razao e nomelista
// ============================================================
export interface Cliente {
  id: number                          // Chave primária auto-increment (Código)
  razao: string                       // Razão Social (obrigatório)
  fantasia?: string                   // Nome Fantasia
  end?: string                        // Endereço
  num?: string                        // Número
  bairro?: string                     // Bairro
  cep?: string                        // CEP formato 00000-000
  cidade?: string                     // Cidade
  uf?: string                         // UF — sigla do estado (2 chars)
  cnpj?: string                       // CNPJ formatado
  cpf?: string                        // CPF formatado
  ie?: string                         // Inscrição Estadual
  fone1?: string                      // Telefone principal
  fone2?: string                      // Telefone secundário
  contato?: string                    // Nome do contato principal
  fone_contato?: string               // Telefone do contato
  email?: string                      // E-mail principal
  email_contato?: string              // E-mail do contato
  nomelista: string                   // Lista: '0'=inativo, '1','2','3','4','VAREJO'
  observacoes?: string                // Observações livres
  contato_whatsapp?: ContatoWhatsApp[] // Contatos WhatsApp Business (JSONB)
  telefone_whatsapp?: string          // Campo legado do CSV (depreciado)
  created_at?: string                 // Criado em (ISO string)
  updated_at?: string                 // Atualizado em (ISO string)
}

// ============================================================
// ClienteInsert
// Tipo para INSERT — omite campos gerados automaticamente
// Usado em clientesService.ts → criarCliente()
// ============================================================
export type ClienteInsert = Omit<Cliente, 'id' | 'created_at' | 'updated_at'>

// ============================================================
// ClienteUpdate
// Tipo para UPDATE — todos os campos opcionais exceto id
// Usado em clientesService.ts → editarCliente()
// ============================================================
export type ClienteUpdate = Partial<ClienteInsert> & { id: number }

// ============================================================
// FiltrosClientes
// Estado dos filtros ativos na tela de listagem
// Usado em ClientesFiltros.tsx e clientesService.ts
// ============================================================
export interface FiltrosClientes {
  busca: string      // Texto livre — busca em fantasia, razao, cnpj, cpf, cidade
  lista: string      // 'todas' | '1' | '2' | '3' | '4' | 'VAREJO'
  status: string     // 'ativos' | 'inativos' | 'todos'
}

// ============================================================
// ModoModal
// Controla o modo de abertura do modal de cliente
// ============================================================
export type ModoModal = 'novo' | 'editar' | 'visualizar' | null

// ============================================================
// OpcaoLista
// Valores válidos para o campo nomelista
// ============================================================
export const OPCOES_LISTA = [
  { value: '0', label: '0 — Inativo' },
  { value: '1', label: 'Lista 1' },
  { value: '2', label: 'Lista 2' },
  { value: '3', label: 'Lista 3' },
  { value: '4', label: 'Lista 4' },
  { value: 'VAREJO', label: 'Varejo' },
] as const
