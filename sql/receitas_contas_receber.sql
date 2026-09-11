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

-- ── Row Level Security (27/08/2026) ──────────────────────────
-- Nenhuma das 6 tabelas deste módulo tinha RLS até agora — fecha o
-- acesso direto do navegador (client anon), único ponto que protege
-- contra escrita do Visitante nesse caminho (proxy.ts só cobre
-- /api/*). Leitura continua liberada pra todo autenticado — nada
-- muda para Admin/equipe. usuario_atual_eh_visitante() está definida
-- em sql/usuarios.sql — rode aquele arquivo ANTES deste.
-- ACHADO CRÍTICO nesta sessão (confirmado via pg_policies, mesmo
-- problema de sql/clientes.sql): TODAS as 6 tabelas já tinham
-- policies antigas, criadas fora do controle de versão, no padrão
-- "<tabela>_select"/"_insert"/"_update"/"_delete" (nem toda tabela
-- tem as 4 — varia), permissivas e sem checagem de Visitante. Sem
-- derrubar explicitamente, coexistiriam com as novas e as anulariam
-- por completo (Postgres combina policies permissivas com OU).
-- Generalizado dentro do próprio loop, já que o padrão de nome é
-- consistente em todas as 6.
DO $$
DECLARE
  tabela text;
  cmd text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY[
    'receitas', 'receitas_itens', 'receitas_duplicatas',
    'contas_receber', 'contas_receber_eventos', 'remessas_importadas'
  ]
  LOOP
    FOREACH cmd IN ARRAY ARRAY['select', 'insert', 'update', 'delete']
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tabela || '_' || cmd, tabela);
    END LOOP;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tabela);

    EXECUTE format('DROP POLICY IF EXISTS "select_autenticados" ON %I', tabela);
    EXECUTE format('DROP POLICY IF EXISTS "select_bloqueia_visitante_na_tabela_real" ON %I', tabela);
    EXECUTE format(
      'CREATE POLICY "select_bloqueia_visitante_na_tabela_real" ON %I FOR SELECT TO authenticated USING (NOT (SELECT usuario_atual_eh_visitante()))',
      tabela
    );

    EXECUTE format('DROP POLICY IF EXISTS "insert_bloqueia_visitante" ON %I', tabela);
    EXECUTE format(
      'CREATE POLICY "insert_bloqueia_visitante" ON %I FOR INSERT TO authenticated WITH CHECK (NOT (SELECT usuario_atual_eh_visitante()))',
      tabela
    );

    EXECUTE format('DROP POLICY IF EXISTS "update_bloqueia_visitante" ON %I', tabela);
    EXECUTE format(
      'CREATE POLICY "update_bloqueia_visitante" ON %I FOR UPDATE TO authenticated USING (NOT (SELECT usuario_atual_eh_visitante()))',
      tabela
    );

    EXECUTE format('DROP POLICY IF EXISTS "delete_bloqueia_visitante" ON %I', tabela);
    EXECUTE format(
      'CREATE POLICY "delete_bloqueia_visitante" ON %I FOR DELETE TO authenticated USING (NOT (SELECT usuario_atual_eh_visitante()))',
      tabela
    );
  END LOOP;
END $$;

-- ── Parte 2 (27/08/2026): mascaramento pro Visitante ─────────
-- Mesmo mecanismo de sql/clientes.sql. chave_acesso é o identificador
-- fiscal único da NF-e de verdade (consultável na Receita/SEFAZ) —
-- tratado com o mesmo cuidado de um CPF/CNPJ. xml_storage_path é o
-- caminho do arquivo no bucket receitas_xml — mascarado também, pra
-- não sobrar nenhuma pista de onde o XML real está guardado.
CREATE OR REPLACE VIEW receitas_visitante AS
SELECT
  r.id,
  r.numero_nf,
  r.serie,
  CASE WHEN v.eh_visitante THEN lpad((abs(hashtext(r.id::text || 'chave')))::text, 44, '0') ELSE r.chave_acesso END AS chave_acesso,
  CASE WHEN v.eh_visitante THEN NULL ELSE r.protocolo END AS protocolo,
  r.data_emissao,
  r.data_autorizacao,
  r.natureza_operacao,
  r.id_dest,
  r.status_nf,
  r.cliente_id,
  CASE WHEN v.eh_visitante AND r.cliente_cpf_cnpj IS NOT NULL THEN lpad((abs(hashtext(r.id::text || 'doc')) % 100000000000000)::text, 14, '0') ELSE r.cliente_cpf_cnpj END AS cliente_cpf_cnpj,
  CASE WHEN v.eh_visitante THEN 'Cliente exemplo #' || lpad((abs(hashtext(r.id::text)) % 1000)::text, 3, '0') ELSE r.cliente_nome END AS cliente_nome,
  CASE WHEN v.eh_visitante THEN NULL ELSE r.cliente_ie END AS cliente_ie,
  CASE WHEN v.eh_visitante THEN NULL ELSE r.cliente_fone END AS cliente_fone,
  CASE WHEN v.eh_visitante THEN NULL ELSE r.cliente_email END AS cliente_email,
  CASE WHEN v.eh_visitante THEN NULL ELSE r.cliente_logradouro END AS cliente_logradouro,
  CASE WHEN v.eh_visitante THEN NULL ELSE r.cliente_numero END AS cliente_numero,
  CASE WHEN v.eh_visitante THEN NULL ELSE r.cliente_complemento END AS cliente_complemento,
  CASE WHEN v.eh_visitante THEN NULL ELSE r.cliente_bairro END AS cliente_bairro,
  CASE WHEN v.eh_visitante THEN NULL ELSE r.cliente_municipio END AS cliente_municipio,
  r.cliente_uf,
  CASE WHEN v.eh_visitante THEN NULL ELSE r.cliente_cep END AS cliente_cep,
  CASE WHEN v.eh_visitante THEN (500 + abs(hashtext(r.id::text || 'v1')) % 49500)::numeric(12,2) ELSE r.valor_produtos END AS valor_produtos,
  CASE WHEN v.eh_visitante THEN (10 + abs(hashtext(r.id::text || 'v2')) % 490)::numeric(12,2) ELSE r.valor_frete END AS valor_frete,
  CASE WHEN v.eh_visitante THEN 0::numeric ELSE r.valor_seguro END AS valor_seguro,
  CASE WHEN v.eh_visitante THEN 0::numeric ELSE r.valor_desconto END AS valor_desconto,
  CASE WHEN v.eh_visitante THEN 0::numeric ELSE r.valor_outras END AS valor_outras,
  CASE WHEN v.eh_visitante THEN 0::numeric ELSE r.valor_ipi END AS valor_ipi,
  CASE WHEN v.eh_visitante THEN (500 + abs(hashtext(r.id::text || 'v1')) % 49500)::numeric(12,2) ELSE r.valor_nf END AS valor_nf,
  r.transportadora_id,
  r.modalidade_frete,
  r.volume_qtd,
  r.volume_marca,
  r.volume_numero,
  r.peso_liquido,
  r.peso_bruto,
  CASE WHEN v.eh_visitante THEN NULL ELSE r.fatura_numero END AS fatura_numero,
  CASE WHEN v.eh_visitante THEN NULL ELSE r.fatura_valor_original END AS fatura_valor_original,
  CASE WHEN v.eh_visitante THEN NULL ELSE r.fatura_valor_desconto END AS fatura_valor_desconto,
  CASE WHEN v.eh_visitante THEN NULL ELSE r.xml_storage_path END AS xml_storage_path,
  CASE WHEN v.eh_visitante THEN NULL ELSE r.observacoes END AS observacoes,
  r.created_at,
  r.updated_at
FROM receitas r, LATERAL (SELECT usuario_atual_eh_visitante() AS eh_visitante) v;

GRANT SELECT ON receitas_visitante TO authenticated;

-- receitas_itens_visitante — descricao é o nome do produto, pode
-- revelar o que a empresa vende a esse cliente especificamente;
-- mascarado por precaução, mesmo sendo menos crítico que os outros
CREATE OR REPLACE VIEW receitas_itens_visitante AS
SELECT
  i.id,
  i.receita_id,
  CASE WHEN v.eh_visitante THEN NULL ELSE i.codigo_produto END AS codigo_produto,
  CASE WHEN v.eh_visitante THEN 'Produto exemplo' ELSE i.descricao END AS descricao,
  i.unidade,
  i.quantidade,
  CASE WHEN v.eh_visitante THEN (10 + abs(hashtext(i.id::text || 'v1')) % 990)::numeric(12,2) ELSE i.valor_unitario END AS valor_unitario,
  CASE WHEN v.eh_visitante THEN (500 + abs(hashtext(i.id::text || 'v2')) % 9500)::numeric(12,2) ELSE i.valor_total END AS valor_total,
  CASE WHEN v.eh_visitante THEN 0::numeric ELSE i.valor_desconto END AS valor_desconto,
  CASE WHEN v.eh_visitante THEN 0::numeric ELSE i.valor_frete END AS valor_frete,
  i.cfop,
  i.created_at
FROM receitas_itens i, LATERAL (SELECT usuario_atual_eh_visitante() AS eh_visitante) v;

GRANT SELECT ON receitas_itens_visitante TO authenticated;

-- receitas_duplicatas_visitante
CREATE OR REPLACE VIEW receitas_duplicatas_visitante AS
SELECT
  d.id,
  d.receita_id,
  d.numero_duplicata,
  d.data_vencimento,
  CASE WHEN v.eh_visitante THEN (500 + abs(hashtext(d.id::text || 'v1')) % 49500)::numeric(12,2) ELSE d.valor END AS valor,
  d.created_at
FROM receitas_duplicatas d, LATERAL (SELECT usuario_atual_eh_visitante() AS eh_visitante) v;

GRANT SELECT ON receitas_duplicatas_visitante TO authenticated;

-- contas_receber_visitante
CREATE OR REPLACE VIEW contas_receber_visitante AS
SELECT
  c.id,
  c.duplicata_id,
  c.receita_id,
  c.cliente_id,
  c.numero_documento,
  c.numero_duplicata,
  c.data_vencimento,
  c.data_processamento,
  CASE WHEN v.eh_visitante THEN (500 + abs(hashtext(c.id::text || 'v1')) % 49500)::numeric(12,2) ELSE c.valor END AS valor,
  CASE WHEN v.eh_visitante THEN NULL ELSE c.nosso_numero END AS nosso_numero,
  CASE WHEN v.eh_visitante THEN NULL ELSE c.linha_digitavel END AS linha_digitavel,
  c.status,
  c.data_baixa,
  c.forma_baixa,
  CASE WHEN v.eh_visitante THEN 'Cliente exemplo #' || lpad((abs(hashtext(c.id::text)) % 1000)::text, 3, '0') ELSE c.cliente_nome END AS cliente_nome,
  CASE WHEN v.eh_visitante THEN lpad((abs(hashtext(c.id::text || 'doc')) % 100000000000000)::text, 14, '0') ELSE c.cliente_cpf_cnpj END AS cliente_cpf_cnpj,
  CASE WHEN v.eh_visitante THEN NULL ELSE c.cliente_fantasia END AS cliente_fantasia,
  CASE WHEN v.eh_visitante THEN NULL ELSE c.cliente_email END AS cliente_email,
  CASE WHEN v.eh_visitante THEN NULL ELSE c.cliente_fone END AS cliente_fone,
  CASE WHEN v.eh_visitante THEN NULL ELSE c.cliente_municipio END AS cliente_municipio,
  c.cliente_uf,
  CASE WHEN v.eh_visitante THEN NULL ELSE c.observacoes END AS observacoes,
  c.deleted_at,
  c.created_at,
  c.updated_at
FROM contas_receber c, LATERAL (SELECT usuario_atual_eh_visitante() AS eh_visitante) v;

GRANT SELECT ON contas_receber_visitante TO authenticated;

-- contas_receber_eventos_visitante
CREATE OR REPLACE VIEW contas_receber_eventos_visitante AS
SELECT
  e.id,
  e.titulo_id,
  e.tipo,
  CASE WHEN v.eh_visitante THEN 'Evento de exemplo' ELSE e.descricao END AS descricao,
  e.created_at
FROM contas_receber_eventos e, LATERAL (SELECT usuario_atual_eh_visitante() AS eh_visitante) v;

GRANT SELECT ON contas_receber_eventos_visitante TO authenticated;

-- remessas_importadas_visitante — nome_arquivo pode conter dado
-- identificável (nome de banco/empresa no arquivo); hash_arquivo é
-- técnico, não sensível, mas mascarado por consistência
CREATE OR REPLACE VIEW remessas_importadas_visitante AS
SELECT
  m.id,
  m.tipo,
  CASE WHEN v.eh_visitante THEN 'arquivo_exemplo.txt' ELSE m.nome_arquivo END AS nome_arquivo,
  CASE WHEN v.eh_visitante THEN NULL ELSE m.hash_arquivo END AS hash_arquivo,
  m.total_registros,
  m.processados,
  m.nao_encontrados,
  m.created_at
FROM remessas_importadas m, LATERAL (SELECT usuario_atual_eh_visitante() AS eh_visitante) v;

GRANT SELECT ON remessas_importadas_visitante TO authenticated;

-- ============================================================
-- IMPORTANTE — cole e rode em DUAS VEZES separadas, não de uma vez:
-- 1) Selecione e cole só até a linha do GRANT acima (as 6 views),
--    rode, confirme sucesso (SELECT viewname FROM pg_views WHERE
--    viewname LIKE '%visitante%';)
-- 2) Só depois, selecione e cole o resto abaixo (bloco de Storage)
-- Mesmo motivo de sql/clientes.sql: storage.objects pertence a
-- outro dono dentro do Supabase (supabase_storage_admin, não
-- postgres) — uma falha aí, colada junto, reverte as 6 views acima.
-- ============================================================

-- ── Storage: bucket 'receitas_xml' (27/08/2026) ──────────────
-- Mesmo achado/mecanismo do bucket 'backups' (ver sql/clientes.sql).
-- As 4 políticas existentes (também criadas fora do controle de
-- versão, confirmadas via pg_policies) liberavam
-- SELECT/INSERT/UPDATE/DELETE pra qualquer autenticado,
-- inclusive DELETE — Visitante conseguia até apagar XML de nota
-- fiscal real. Recriadas com o mesmo escopo original (bucket
-- 'receitas_xml'), só acrescentando o bloqueio.
DROP POLICY IF EXISTS "receitas_xml_select" ON storage.objects;
CREATE POLICY "receitas_xml_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'receitas_xml' AND NOT (SELECT usuario_atual_eh_visitante()));

DROP POLICY IF EXISTS "receitas_xml_insert" ON storage.objects;
CREATE POLICY "receitas_xml_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receitas_xml' AND NOT (SELECT usuario_atual_eh_visitante()));

DROP POLICY IF EXISTS "receitas_xml_update" ON storage.objects;
CREATE POLICY "receitas_xml_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'receitas_xml' AND NOT (SELECT usuario_atual_eh_visitante()));

DROP POLICY IF EXISTS "receitas_xml_delete" ON storage.objects;
CREATE POLICY "receitas_xml_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'receitas_xml' AND NOT (SELECT usuario_atual_eh_visitante()));
