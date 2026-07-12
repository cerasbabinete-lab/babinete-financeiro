-- ============================================================
-- sql/receitas_contas_receber.sql
-- Projeto: Ceras Babinete — Gestão Financeira
-- Função: Fonte única de verdade do schema ATUAL dos módulos
--         Receitas + Contas a Receber. 100% idempotente — pode ser
--         executado em qualquer estado do banco sem duplicar nem
--         quebrar nada. Editar ESTE arquivo sempre que o schema
--         mudar — nunca criar um arquivo numerado novo.
-- Conecta com: types/receitas.ts, types/contasReceber.ts,
--              lib/receitasService.ts, lib/contasReceberService.ts,
--              lib/remParser.ts, lib/retParser.ts, lib/txtBbParser.ts,
--              lib/xlsParser.ts, lib/xmlParser.ts
-- Nota de escopo: receitas.transportadora_id referencia a tabela
--                 transportadoras, fora do escopo deste arquivo —
--                 FK não declarada como CONSTRAINT executável.
-- Revisão desta versão (consolidação, aprovada por Maycon):
--   - Adicionado índice em TODA coluna de foreign key desta seção
--     (Postgres não cria índice automático do lado que aponta pra
--     uma FK, só do lado que é PK) — sem isso, toda busca por
--     cliente/receita/duplicata/título era varredura sequencial.
--     Achado de maior impacto de performance da revisão.
--   - Adicionado CHECK de valores válidos em contas_receber.status,
--     contas_receber.forma_baixa, contas_receber_eventos.tipo e
--     remessas_importadas.tipo — nenhum tinha trava antes (o par
--     inverso, contas_a_pagar, já tinha desde o build original).
--     Valores confirmados em types/contasReceber.ts, anexado por
--     Maycon nesta sessão.
--   - cliente_uf CHAR(2) CONFIRMADO via information_schema em
--     `receitas` e `contas_receber` (era suposição documentada)
-- ============================================================

-- ------------------------------------------------------------
-- Tabela: receitas
-- Cabeçalho de cada NF-e emitida — dado fiscal imutável
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS receitas (
  id UUID NOT NULL DEFAULT gen_random_uuid(),

  numero_nf INTEGER NOT NULL,
  serie INTEGER NOT NULL DEFAULT 1,
  chave_acesso VARCHAR NOT NULL,
  protocolo VARCHAR,

  data_emissao TIMESTAMPTZ NOT NULL,
  data_autorizacao TIMESTAMPTZ,
  natureza_operacao VARCHAR,
  id_dest INTEGER,
  status_nf INTEGER,

  -- Snapshot imutável do cliente no momento da emissão
  cliente_id INTEGER,
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
  cliente_uf CHAR(2),                -- confirmado via information_schema nesta consolidação
  cliente_cep VARCHAR,

  valor_produtos NUMERIC NOT NULL DEFAULT 0,
  valor_frete NUMERIC NOT NULL DEFAULT 0,
  valor_seguro NUMERIC NOT NULL DEFAULT 0,
  valor_desconto NUMERIC NOT NULL DEFAULT 0,
  valor_outras NUMERIC NOT NULL DEFAULT 0,
  valor_ipi NUMERIC NOT NULL DEFAULT 0,
  valor_nf NUMERIC NOT NULL DEFAULT 0,

  transportadora_id UUID,            -- FK informativa -> transportadoras.id (fora de escopo)
  modalidade_frete INTEGER,
  volume_qtd INTEGER,
  volume_marca VARCHAR,
  volume_numero VARCHAR,
  peso_liquido NUMERIC,
  peso_bruto NUMERIC,

  fatura_numero VARCHAR,
  fatura_valor_original NUMERIC,
  fatura_valor_desconto NUMERIC,

  xml_storage_path VARCHAR,
  observacoes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT receitas_pkey PRIMARY KEY (id),
  CONSTRAINT receitas_chave_acesso_unique UNIQUE (chave_acesso)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receitas_cliente_id_fkey') THEN
    ALTER TABLE receitas ADD CONSTRAINT receitas_cliente_id_fkey
      FOREIGN KEY (cliente_id) REFERENCES clientes (id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS receitas_cliente_id_idx ON receitas (cliente_id);


-- ------------------------------------------------------------
-- Tabela: receitas_itens
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS receitas_itens (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  receita_id UUID NOT NULL,

  codigo_produto VARCHAR,
  descricao VARCHAR NOT NULL,
  unidade VARCHAR,
  quantidade NUMERIC NOT NULL DEFAULT 0,
  valor_unitario NUMERIC NOT NULL DEFAULT 0,
  valor_total NUMERIC NOT NULL DEFAULT 0,
  valor_desconto NUMERIC NOT NULL DEFAULT 0,
  valor_frete NUMERIC NOT NULL DEFAULT 0,
  cfop VARCHAR,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT receitas_itens_pkey PRIMARY KEY (id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receitas_itens_receita_id_fkey') THEN
    ALTER TABLE receitas_itens ADD CONSTRAINT receitas_itens_receita_id_fkey
      FOREIGN KEY (receita_id) REFERENCES receitas (id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS receitas_itens_receita_id_idx ON receitas_itens (receita_id);


-- ------------------------------------------------------------
-- Tabela: receitas_duplicatas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS receitas_duplicatas (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  receita_id UUID NOT NULL,

  numero_duplicata VARCHAR NOT NULL,
  data_vencimento DATE NOT NULL,
  valor NUMERIC NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT receitas_duplicatas_pkey PRIMARY KEY (id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receitas_duplicatas_receita_id_fkey') THEN
    ALTER TABLE receitas_duplicatas ADD CONSTRAINT receitas_duplicatas_receita_id_fkey
      FOREIGN KEY (receita_id) REFERENCES receitas (id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS receitas_duplicatas_receita_id_idx ON receitas_duplicatas (receita_id);


-- ------------------------------------------------------------
-- Tabela: contas_receber
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contas_receber (
  id UUID NOT NULL DEFAULT gen_random_uuid(),

  duplicata_id UUID,
  receita_id UUID,
  cliente_id INTEGER,

  numero_documento VARCHAR NOT NULL,
  numero_duplicata VARCHAR NOT NULL,

  data_vencimento DATE NOT NULL,
  data_processamento DATE NOT NULL DEFAULT CURRENT_DATE,
  valor NUMERIC NOT NULL,

  nosso_numero VARCHAR,
  linha_digitavel VARCHAR,

  status VARCHAR NOT NULL DEFAULT 'em_aberto',
  data_baixa DATE,
  forma_baixa VARCHAR,

  cliente_nome VARCHAR NOT NULL,
  cliente_cpf_cnpj VARCHAR NOT NULL,
  cliente_fantasia VARCHAR,
  cliente_email VARCHAR,
  cliente_fone VARCHAR,
  cliente_municipio VARCHAR,
  cliente_uf CHAR(2),                -- confirmado via information_schema nesta consolidação

  observacoes TEXT,
  deleted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT contas_receber_pkey PRIMARY KEY (id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contas_receber_cliente_id_fkey') THEN
    ALTER TABLE contas_receber ADD CONSTRAINT contas_receber_cliente_id_fkey
      FOREIGN KEY (cliente_id) REFERENCES clientes (id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contas_receber_receita_id_fkey') THEN
    ALTER TABLE contas_receber ADD CONSTRAINT contas_receber_receita_id_fkey
      FOREIGN KEY (receita_id) REFERENCES receitas (id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contas_receber_duplicata_id_fkey') THEN
    ALTER TABLE contas_receber ADD CONSTRAINT contas_receber_duplicata_id_fkey
      FOREIGN KEY (duplicata_id) REFERENCES receitas_duplicatas (id);
  END IF;

  -- QA fix: contas_receber.status e forma_baixa nunca tiveram CHECK,
  -- diferente do par inverso (contas_a_pagar), que já tinha desde o
  -- build original. Valores confirmados em types/contasReceber.ts
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contas_receber_status_check') THEN
    ALTER TABLE contas_receber ADD CONSTRAINT contas_receber_status_check
      CHECK (status IN ('em_aberto', 'pago', 'recebido_pix_ted', 'protestado', 'enviado_cartorio', 'cancelado'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contas_receber_forma_baixa_check') THEN
    ALTER TABLE contas_receber ADD CONSTRAINT contas_receber_forma_baixa_check
      CHECK (forma_baixa IN ('ret', 'xls', 'pix', 'transferencia', 'manual'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS contas_receber_cliente_id_idx ON contas_receber (cliente_id);
CREATE INDEX IF NOT EXISTS contas_receber_receita_id_idx ON contas_receber (receita_id);
CREATE INDEX IF NOT EXISTS contas_receber_duplicata_id_idx ON contas_receber (duplicata_id);


-- ------------------------------------------------------------
-- Tabela: contas_receber_eventos
-- Log de auditoria imutável — apenas INSERT, nunca UPDATE/DELETE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contas_receber_eventos (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  titulo_id UUID NOT NULL,

  tipo VARCHAR NOT NULL,
  descricao TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT contas_receber_eventos_pkey PRIMARY KEY (id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contas_receber_eventos_titulo_id_fkey') THEN
    ALTER TABLE contas_receber_eventos ADD CONSTRAINT contas_receber_eventos_titulo_id_fkey
      FOREIGN KEY (titulo_id) REFERENCES contas_receber (id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contas_receber_eventos_tipo_check') THEN
    ALTER TABLE contas_receber_eventos ADD CONSTRAINT contas_receber_eventos_tipo_check
      CHECK (tipo IN (
        'criado', 'nosso_numero_vinculado', 'baixa_ret', 'baixa_manual',
        'protestado', 'enviado_cartorio', 'cancelado', 'reaberto',
        'email_enviado', 'ocorrencia_informativa'
      ));
  END IF;
END $$;

-- Índice de maior impacto da revisão: esta tabela é consultada toda
-- vez que o sistema calcula "quanto já foi pago" de um título
CREATE INDEX IF NOT EXISTS contas_receber_eventos_titulo_id_idx ON contas_receber_eventos (titulo_id);


-- ------------------------------------------------------------
-- Tabela: remessas_importadas
-- Dedupe de arquivos bancários (TXT BB / REM / RET / XLS)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS remessas_importadas (
  id UUID NOT NULL DEFAULT gen_random_uuid(),

  tipo VARCHAR NOT NULL,
  nome_arquivo VARCHAR NOT NULL,
  hash_arquivo VARCHAR NOT NULL,

  total_registros INTEGER NOT NULL DEFAULT 0,
  processados INTEGER NOT NULL DEFAULT 0,
  nao_encontrados INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT remessas_importadas_pkey PRIMARY KEY (id),
  CONSTRAINT remessas_importadas_hash_arquivo_key UNIQUE (hash_arquivo)
);

DO $$
BEGIN
  -- QA fix: mesmo gap de contas_receber.status — sem CHECK antes
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'remessas_importadas_tipo_check') THEN
    ALTER TABLE remessas_importadas ADD CONSTRAINT remessas_importadas_tipo_check
      CHECK (tipo IN ('txt_bb', 'rem', 'ret', 'xls'));
  END IF;
END $$;
