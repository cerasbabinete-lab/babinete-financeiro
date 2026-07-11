-- ============================================================
-- sql/01_clientes.sql
-- Projeto: Ceras Babinete — Babinete Financeiro
-- Função: Documentação de referência do schema REAL e ATUAL da
--         tabela `clientes`, tal como existe hoje em produção no
--         Supabase (projeto sa-east-1). NÃO é um script de migration
--         automatizado — este arquivo não deve ser executado contra
--         o banco de produção, pois a tabela já existe. Serve para
--         que o schema real pare de existir apenas na cabeça do
--         Maycon e em conversas de chat antigas.
-- Conecta com: types/clientes.ts, lib/clientesService.ts,
--              app/clientes/page.tsx, e é referenciada por
--              `receitas.cliente_id` e `contas_receber.cliente_id`
-- Origem dos dados: information_schema.columns +
--                    information_schema.table_constraints,
--                    consultados manualmente por Maycon no SQL
--                    Editor do Supabase (MCP retornou vazio nesta
--                    sessão) — extração literal, não reconstruída
--                    de memória (Especificação Contas a Pagar, §2.2)
-- Referência: Especificacao_Modulo_Contas_a_Pagar.md, Seção 2.2,
--             item "Requisito não-negociável" — 1º dos 4 arquivos
--             obrigatórios antes de qualquer tabela nova do módulo
--             Contas a Pagar
-- ============================================================

-- Tabela: clientes
-- Cadastro de clientes (pessoa física ou jurídica) da Ceras Babinete,
-- usado como origem de `receitas.cliente_id` (NF-e emitidas) e
-- `contas_receber.cliente_id` (títulos a receber gerados a partir
-- delas). Cada linha representa um cliente único.
CREATE TABLE clientes (
  -- Identificador numérico sequencial (não UUID, diferente da maioria
  -- das tabelas novas do sistema) — convenção herdada de uma geração
  -- anterior do banco, mantida por compatibilidade com dados existentes
  id INTEGER NOT NULL DEFAULT nextval('clientes_id_seq'::regclass),

  -- Razão social (pessoa jurídica) ou nome completo (pessoa física) —
  -- único campo de identificação obrigatório do cadastro
  razao TEXT NOT NULL,

  -- Nome fantasia, opcional — usado em telas/documentos quando presente
  fantasia TEXT,

  -- Campos de endereço, todos opcionais (nem todo cliente tem endereço
  -- completo cadastrado)
  "end" TEXT,          -- logradouro (nome "end" é reservado/atípico — mantido como está em produção)
  num TEXT,            -- número do endereço
  bairro TEXT,
  cep TEXT,
  cidade TEXT,

  -- Unidade federativa — tipo "character" (bpchar) sem comprimento
  -- explícito capturado na consulta de schema; ASSUNÇÃO documentada
  -- aqui como char(2), coerente com sigla de UF brasileira — Maycon
  -- deve confirmar se o comprimento real do banco é diferente
  uf CHAR(2),

  -- Documentos fiscais — um cliente pode ter CNPJ (PJ) ou CPF (PF),
  -- ambos opcionais e sem CHECK de mútua exclusividade no banco atual
  cnpj TEXT,
  cpf TEXT,
  ie TEXT,              -- inscrição estadual, opcional

  -- Contato principal do cliente
  fone1 TEXT,
  fone2 TEXT,
  contato TEXT,          -- nome da pessoa de contato
  fone_contato TEXT,
  email TEXT,
  email_contato TEXT,

  -- Campo de controle de listagem/exibição — obrigatório, valor
  -- textual livre com default '1' (significado de negócio não
  -- documentado neste arquivo, apenas o schema)
  nomelista TEXT NOT NULL DEFAULT '1',

  observacoes TEXT,      -- campo livre

  -- Contatos de WhatsApp — array JSON de objetos (estrutura não
  -- tipada no banco, tipagem fica em types/clientes.ts)
  contato_whatsapp JSONB DEFAULT '[]'::jsonb,
  telefone_whatsapp TEXT,

  -- Timestamps automáticos de auditoria
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Data de nascimento — aplicável quando o cliente é pessoa física
  data_nascimento DATE,

  -- Chave primária
  CONSTRAINT clientes_pkey PRIMARY KEY (id)
);
