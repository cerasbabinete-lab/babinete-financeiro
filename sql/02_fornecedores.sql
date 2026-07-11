-- ============================================================
-- sql/02_fornecedores.sql
-- Projeto: Ceras Babinete — Babinete Financeiro
-- Função: Documentação de referência do schema REAL e ATUAL da
--         tabela `fornecedores`, tal como existe hoje em produção
--         no Supabase (sa-east-1). NÃO é um script de migration —
--         não deve ser executado contra produção, a tabela já existe.
-- Conecta com: types/fornecedores.ts, lib/fornecedoresService.ts,
--              app/fornecedores/page.tsx, `despesas.fornecedor_id`
--              (módulo Despesas, já em produção), e será referenciada
--              por `contas_a_pagar.fornecedor_id` (módulo Contas a
--              Pagar, ainda a construir)
-- Origem dos dados: information_schema.columns +
--                    information_schema.table_constraints, consultados
--                    manualmente por Maycon no SQL Editor do Supabase
-- Referência: Especificacao_Modulo_Contas_a_Pagar.md, Seção 2.2 —
--             2º dos 4 arquivos obrigatórios de documentação de schema
-- ============================================================

-- Tabela: fornecedores
-- Cadastro de fornecedores/credores (pessoa física ou jurídica) da
-- Ceras Babinete. É a origem de `despesas.fornecedor_id` (módulo
-- Despesas) e, no módulo Contas a Pagar, de `contas_a_pagar.fornecedor_id`
-- quando o título tem um fornecedor cadastrado vinculado.
CREATE TABLE fornecedores (
  -- Identificador sequencial bigint (não UUID) — mesma convenção
  -- numérica de `clientes.id`, mantida por compatibilidade
  id BIGINT NOT NULL DEFAULT nextval('fornecedores_id_seq'::regclass),

  -- Razão social (PJ) ou nome completo (PF) — único campo obrigatório
  razao TEXT NOT NULL,

  -- Nome fantasia, opcional
  fantasia TEXT,

  -- Campos de endereço, todos opcionais
  "end" TEXT,           -- logradouro (nome atípico "end", mesma convenção de clientes)
  num TEXT,
  bairro TEXT,
  cep TEXT,
  cidade TEXT,

  -- Unidade federativa — aqui já é `text` (diferente de `clientes.uf`,
  -- que é `character`/bpchar) — inconsistência real do schema atual,
  -- documentada e não "corrigida" por este arquivo
  uf TEXT,

  -- Documentos fiscais — CNPJ (PJ) ou CPF (PF), ambos opcionais.
  -- IMPORTANTE para o módulo Contas a Pagar: o matching de favorecido
  -- no motor de conciliação (Especificacao_Modulo_Contas_a_Pagar.md,
  -- Seção 5) usa estes dois campos para achar `fornecedor_id`
  cnpj TEXT,
  cpf TEXT,
  ie TEXT,               -- inscrição estadual, opcional

  -- Contato
  fone1 TEXT,
  fone2 TEXT,
  contato TEXT,
  fone_contato TEXT,
  email TEXT,
  email_contato TEXT,
  website TEXT,

  -- Dados bancários em texto livre (sem estrutura tipada no banco)
  dados_bancarios TEXT,

  -- Data de nascimento — aplicável quando o fornecedor é pessoa física
  data_nascimento DATE,

  observacoes TEXT,

  -- Contatos de WhatsApp — array JSON de objetos, sem default
  -- explícito registrado no schema (diferente de `clientes`, que
  -- tem default '[]'::jsonb) — documentado como está, não "corrigido"
  contato_whatsapp JSONB,

  -- Timestamps automáticos de auditoria
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Chave primária
  CONSTRAINT fornecedores_pkey PRIMARY KEY (id)
);
