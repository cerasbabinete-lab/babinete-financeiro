-- ============================================================
-- sql/03_receitas_contas_receber.sql
-- Projeto: Ceras Babinete — Babinete Financeiro
-- Função: Documentação de referência do schema REAL e ATUAL das
--         tabelas do módulo Receitas + Contas a Receber, tal como
--         existem hoje em produção no Supabase (sa-east-1). NÃO é
--         um script de migration — não deve ser executado contra
--         produção, todas as tabelas já existem.
-- Conecta com: types/receitas.ts, types/contasReceber.ts,
--              lib/receitasService.ts, lib/contasReceberService.ts,
--              lib/remParser.ts, lib/retParser.ts, lib/txtBbParser.ts,
--              lib/xlsParser.ts, lib/xmlParser.ts
-- Origem dos dados: information_schema.columns +
--                    information_schema.table_constraints, consultados
--                    manualmente por Maycon no SQL Editor do Supabase
-- Referência: Especificacao_Modulo_Contas_a_Pagar.md, Seção 2.2 —
--             3º dos 4 arquivos obrigatórios de documentação de schema
-- Nota de escopo: `receitas.transportadora_id` referencia a tabela
--                 `transportadoras`, que NÃO faz parte do escopo dos
--                 4 arquivos pedidos na Seção 2.2 (não está na lista
--                 de tabelas a documentar). A FK é declarada abaixo
--                 apenas como comentário informativo — não incluída
--                 como CONSTRAINT executável, para não referenciar
--                 uma tabela fora deste documento.
-- ============================================================

-- ------------------------------------------------------------
-- Tabela: receitas
-- Cabeçalho de cada Nota Fiscal eletrônica (NF-e) emitida pela
-- Ceras Babinete, importada via XML (lib/xmlParser.ts). Dado
-- fiscal histórico e imutável — independente de alterações
-- posteriores em `clientes` (mesmo princípio de `favorecido_nome`
-- imutável em Despesas/Contas a Pagar)
-- ------------------------------------------------------------
CREATE TABLE receitas (
  id UUID NOT NULL DEFAULT gen_random_uuid(),

  -- Identificação fiscal da NF-e
  numero_nf INTEGER NOT NULL,
  serie INTEGER NOT NULL DEFAULT 1,
  chave_acesso VARCHAR NOT NULL,   -- chave de 44 dígitos, única por NF-e
  protocolo VARCHAR,               -- protocolo de autorização SEFAZ

  data_emissao TIMESTAMPTZ NOT NULL,
  data_autorizacao TIMESTAMPTZ,
  natureza_operacao VARCHAR,
  id_dest INTEGER,                 -- identificador de destino conforme layout NF-e
  status_nf INTEGER,                -- código de status da NF-e conforme SEFAZ

  -- Snapshot dos dados do cliente NO MOMENTO da emissão — imutável,
  -- não sobrescrito por alterações posteriores em `clientes`
  cliente_id INTEGER,               -- FK opcional para clientes.id (navegação)
  cliente_cpf_cnpj VARCHAR,
  cliente_nome VARCHAR,
  cliente_ie VARCHAR,
  cliente_fone VARCHAR,
  cliente_email VARCHAR,
  cliente_logradouro VARCHAR,
  cliente_numero VARCHAR,
  cliente_complemento VARCHAR,
  cliente_bairro VARCHAR,
  cliente_municipio VARCHAR,
  cliente_uf CHAR(2),               -- ASSUNÇÃO de comprimento, ver nota em 01_clientes.sql
  cliente_cep VARCHAR,

  -- Valores financeiros da NF-e
  valor_produtos NUMERIC NOT NULL DEFAULT 0,
  valor_frete NUMERIC NOT NULL DEFAULT 0,
  valor_seguro NUMERIC NOT NULL DEFAULT 0,
  valor_desconto NUMERIC NOT NULL DEFAULT 0,
  valor_outras NUMERIC NOT NULL DEFAULT 0,
  valor_ipi NUMERIC NOT NULL DEFAULT 0,
  valor_nf NUMERIC NOT NULL DEFAULT 0,   -- valor total da NF-e

  -- Transporte — transportadora_id referencia tabela fora do escopo
  -- deste documento (ver nota de escopo no cabeçalho)
  transportadora_id UUID,          -- FK informativa -> transportadoras.id (fora de escopo)
  modalidade_frete INTEGER,
  volume_qtd INTEGER,
  volume_marca VARCHAR,
  volume_numero VARCHAR,
  peso_liquido NUMERIC,
  peso_bruto NUMERIC,

  -- Fatura (duplicata única, quando aplicável — distinto de
  -- receitas_duplicatas, que cobre o caso de múltiplas parcelas)
  fatura_numero VARCHAR,
  fatura_valor_original NUMERIC,
  fatura_valor_desconto NUMERIC,

  -- Caminho do XML original no Supabase Storage
  xml_storage_path VARCHAR,

  observacoes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT receitas_pkey PRIMARY KEY (id),
  CONSTRAINT receitas_chave_acesso_unique UNIQUE (chave_acesso),
  CONSTRAINT receitas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes (id)
  -- receitas_transportadora_id_fkey: FOREIGN KEY (transportadora_id) REFERENCES transportadoras (id)
  --   -> não declarada aqui pois `transportadoras` está fora do escopo deste arquivo (ver nota no cabeçalho)
);

-- ------------------------------------------------------------
-- Tabela: receitas_itens
-- Itens/produtos de cada NF-e (1:N com `receitas`) — dado fiscal
-- imutável, extraído literalmente do XML no momento da importação
-- ------------------------------------------------------------
CREATE TABLE receitas_itens (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  receita_id UUID NOT NULL,          -- FK -> receitas.id

  codigo_produto VARCHAR,
  descricao VARCHAR NOT NULL,
  unidade VARCHAR,
  quantidade NUMERIC NOT NULL DEFAULT 0,
  valor_unitario NUMERIC NOT NULL DEFAULT 0,
  valor_total NUMERIC NOT NULL DEFAULT 0,
  valor_desconto NUMERIC NOT NULL DEFAULT 0,
  valor_frete NUMERIC NOT NULL DEFAULT 0,
  cfop VARCHAR,                       -- Código Fiscal de Operações e Prestações

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT receitas_itens_pkey PRIMARY KEY (id),
  CONSTRAINT receitas_itens_receita_id_fkey FOREIGN KEY (receita_id) REFERENCES receitas (id)
);

-- ------------------------------------------------------------
-- Tabela: receitas_duplicatas
-- Parcelas de cobrança (duplicatas) de cada NF-e (1:N com
-- `receitas`) — origem direta de `contas_receber.duplicata_id`
-- via `criarTitulosDeReceita` (lib/receitasService.ts)
-- ------------------------------------------------------------
CREATE TABLE receitas_duplicatas (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  receita_id UUID NOT NULL,           -- FK -> receitas.id

  numero_duplicata VARCHAR NOT NULL,
  data_vencimento DATE NOT NULL,
  valor NUMERIC NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT receitas_duplicatas_pkey PRIMARY KEY (id),
  CONSTRAINT receitas_duplicatas_receita_id_fkey FOREIGN KEY (receita_id) REFERENCES receitas (id)
);

-- ------------------------------------------------------------
-- Tabela: contas_receber
-- Título a receber — gerado automaticamente a partir de uma
-- `receitas_duplicatas` na importação do XML da NF-e. Par
-- estrutural inverso de `contas_a_pagar` (módulo Contas a Pagar,
-- a construir), mesmo padrão de campos "snapshot" imutáveis
-- (`cliente_nome`, `cliente_cpf_cnpj`, etc.) que não são
-- sobrescritos por alterações posteriores em `clientes`
-- ------------------------------------------------------------
CREATE TABLE contas_receber (
  id UUID NOT NULL DEFAULT gen_random_uuid(),

  -- Origem do título
  duplicata_id UUID,                  -- FK -> receitas_duplicatas.id
  receita_id UUID,                    -- FK -> receitas.id (navegação direta)
  cliente_id INTEGER,                 -- FK -> clientes.id

  numero_documento VARCHAR NOT NULL,
  numero_duplicata VARCHAR NOT NULL,

  data_vencimento DATE NOT NULL,
  data_processamento DATE NOT NULL DEFAULT CURRENT_DATE,
  valor NUMERIC NOT NULL,

  -- Preenchidos/confirmados no momento da baixa via arquivos bancários
  nosso_numero VARCHAR,
  linha_digitavel VARCHAR,

  -- Status e baixa
  status VARCHAR NOT NULL DEFAULT 'em_aberto',
  data_baixa DATE,
  forma_baixa VARCHAR,

  -- Snapshot imutável do cliente no momento da emissão
  cliente_nome VARCHAR NOT NULL,
  cliente_cpf_cnpj VARCHAR NOT NULL,
  cliente_fantasia VARCHAR,
  cliente_email VARCHAR,
  cliente_fone VARCHAR,
  cliente_municipio VARCHAR,
  cliente_uf CHAR(2),                 -- ASSUNÇÃO de comprimento, ver nota em 01_clientes.sql

  observacoes TEXT,

  -- Soft-delete — nunca DELETE físico
  deleted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT contas_receber_pkey PRIMARY KEY (id),
  CONSTRAINT contas_receber_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes (id),
  CONSTRAINT contas_receber_receita_id_fkey FOREIGN KEY (receita_id) REFERENCES receitas (id),
  CONSTRAINT contas_receber_duplicata_id_fkey FOREIGN KEY (duplicata_id) REFERENCES receitas_duplicatas (id)
);

-- ------------------------------------------------------------
-- Tabela: contas_receber_eventos
-- Log de auditoria imutável de `contas_receber` — apenas INSERT,
-- nunca UPDATE/DELETE. Modelo espelhado por
-- `contas_a_pagar_eventos` (módulo Contas a Pagar, a construir)
-- ------------------------------------------------------------
CREATE TABLE contas_receber_eventos (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  titulo_id UUID NOT NULL,            -- FK -> contas_receber.id

  tipo VARCHAR NOT NULL,
  descricao TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT contas_receber_eventos_pkey PRIMARY KEY (id),
  CONSTRAINT contas_receber_eventos_titulo_id_fkey FOREIGN KEY (titulo_id) REFERENCES contas_receber (id)
);

-- ------------------------------------------------------------
-- Tabela: remessas_importadas
-- Controle de deduplicação de arquivos bancários importados no
-- pipeline de Contas a Receber (TXT BB / REM / RET CNAB 240) —
-- dedupe por hash SHA-256 de arquivo inteiro. Modelo de referência
-- para `pagar_arquivos_importados` (módulo Contas a Pagar,
-- exclusivo do Relatório BB consolidado)
-- ------------------------------------------------------------
CREATE TABLE remessas_importadas (
  id UUID NOT NULL DEFAULT gen_random_uuid(),

  tipo VARCHAR NOT NULL,              -- ex: 'txt_bb' | 'rem' | 'ret' | 'xls'
  nome_arquivo VARCHAR NOT NULL,
  hash_arquivo VARCHAR NOT NULL,      -- SHA-256 do conteúdo do arquivo

  total_registros INTEGER NOT NULL DEFAULT 0,
  processados INTEGER NOT NULL DEFAULT 0,
  nao_encontrados INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT remessas_importadas_pkey PRIMARY KEY (id),
  CONSTRAINT remessas_importadas_hash_arquivo_key UNIQUE (hash_arquivo)
);
