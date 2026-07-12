-- ============================================================
-- sql/clientes.sql
-- Projeto: Ceras Babinete — Gestão Financeira
-- Função: Fonte única de verdade do schema ATUAL da tabela
--         `clientes`. 100% idempotente — pode ser executado em
--         qualquer estado do banco (do zero ou já em produção) sem
--         duplicar nem quebrar nada. Editar ESTE arquivo sempre que
--         o schema mudar — nunca criar um arquivo numerado novo.
-- Conecta com: types/clientes.ts, lib/clientesService.ts,
--              app/clientes/page.tsx, receitas.cliente_id,
--              contas_receber.cliente_id
-- Revisão desta versão (consolidação, aprovada por Maycon):
--   - `uf CHAR(2)` CONFIRMADO via information_schema (era suposição
--     documentada nas versões anteriores — não é mais)
--   - Adicionado `deleted_at` — clientes era a única tabela raiz do
--     sistema sem soft-delete, inconsistente com o princípio geral
--     do projeto (nunca DELETE físico). Aditivo, não quebra nada.
--   - Adicionado UNIQUE parcial em `cnpj` e em `cpf` (confirmado por
--     Maycon: sem duplicata hoje) — bloqueia duplicidade de cliente
--     pelo mesmo documento fiscal daqui pra frente.
--   - Os mesmos índices UNIQUE já cobrem a necessidade de busca
--     rápida por documento (era um índice separado antes de virar
--     UNIQUE — um mecanismo só, não dois).
--   - Coluna `"end"` (logradouro) mantida como está — nome atípico
--     conhecido, mas renomear quebraria todo código que já referencia
--     `.end` em produção. Debt documentado, não é escopo desta
--     consolidação de schema.
--   - Coluna `nomelista` mantida como está — propósito de negócio
--     ainda não documentado por Maycon; sinalizado, não resolvido.
-- ============================================================

CREATE TABLE IF NOT EXISTS clientes (
  -- Identificador numérico sequencial (não UUID, diferente da maioria
  -- das tabelas novas do sistema) — convenção herdada de uma geração
  -- anterior do banco, mantida por compatibilidade com dados existentes
  id INTEGER NOT NULL DEFAULT nextval('clientes_id_seq'::regclass),

  -- Razão social (pessoa jurídica) ou nome completo (pessoa física) —
  -- único campo de identificação obrigatório do cadastro
  razao TEXT NOT NULL,

  -- Nome fantasia, opcional
  fantasia TEXT,

  -- Campos de endereço, todos opcionais
  "end" TEXT,          -- logradouro (nome atípico mantido — coluna já em produção, ver nota no cabeçalho)
  num TEXT,
  bairro TEXT,
  cep TEXT,
  cidade TEXT,

  -- Unidade federativa — CHAR(2) confirmado via information_schema
  -- nesta consolidação (não é mais suposição)
  uf CHAR(2),

  -- Documentos fiscais — um cliente pode ter CNPJ (PJ) ou CPF (PF)
  cnpj TEXT,
  cpf TEXT,
  ie TEXT,

  -- Contato principal
  fone1 TEXT,
  fone2 TEXT,
  contato TEXT,
  fone_contato TEXT,
  email TEXT,
  email_contato TEXT,

  -- Campo de controle de listagem/exibição — propósito de negócio
  -- ainda não documentado (pendência conhecida, não resolvida aqui)
  nomelista TEXT NOT NULL DEFAULT '1',

  observacoes TEXT,

  -- Contatos de WhatsApp — array JSON de objetos, tipado em types/clientes.ts
  contato_whatsapp JSONB DEFAULT '[]'::jsonb,
  telefone_whatsapp TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  data_nascimento DATE,

  -- Soft-delete — adicionado nesta consolidação para alinhar com o
  -- princípio geral do projeto (nunca DELETE físico). Antes desta
  -- versão, clientes era a única tabela raiz sem essa coluna.
  deleted_at TIMESTAMPTZ,

  CONSTRAINT clientes_pkey PRIMARY KEY (id)
);

-- Aditiva — cobre o caso de quem já tinha a tabela criada antes desta
-- consolidação (ambiente de produção real)
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- UNIQUE parcial (não bloqueia múltiplos clientes com cnpj/cpf NULL,
-- só bloqueia duplicidade real do mesmo documento preenchido).
-- Confirmado por Maycon nesta sessão: sem duplicata hoje em produção.
CREATE UNIQUE INDEX IF NOT EXISTS clientes_cnpj_key ON clientes (cnpj) WHERE cnpj IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS clientes_cpf_key ON clientes (cpf) WHERE cpf IS NOT NULL;
