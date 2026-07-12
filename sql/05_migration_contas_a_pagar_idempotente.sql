-- ============================================================
-- MIGRATION IDEMPOTENTE — Módulo Contas a Pagar
-- Projeto: Ceras Babinete — Gestão Financeira
-- Pode ser rodada quantas vezes for preciso, em qualquer estado
-- atual do banco (tabelas já existentes, parcialmente criadas, ou
-- inexistentes) — nunca duplica nem apaga dado real. Cada bloco
-- checa a existência do objeto antes de criar/alterar.
-- Motivo: a versão anterior (não-idempotente) falhou no meio da
-- execução em algum momento anterior a esta sessão, deixando o
-- banco num estado parcial não totalmente diagnosticável pelas
-- consultas de information_schema/pg_indexes (retornaram vazio,
-- mesmo com "contas_a_pagar" já existindo segundo o Postgres) —
-- provável causa: schema diferente de "public", ou nome de tabela
-- com capitalização/aspas diferente criado por engano em algum
-- momento anterior. Esta versão não depende desse diagnóstico:
-- ela é segura por construção, não por suposição do estado atual.
-- ============================================================

-- Trigger function de updated_at (CREATE OR REPLACE já é idempotente)
CREATE OR REPLACE FUNCTION set_updated_at_contas_a_pagar()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ── Tabela: contas_a_pagar ──────────────────────────────────
CREATE TABLE IF NOT EXISTS contas_a_pagar (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  despesa_parcela_id UUID,
  despesa_id UUID,
  fornecedor_id BIGINT,
  numero_documento TEXT,
  data_vencimento DATE NOT NULL,
  data_processamento DATE NOT NULL DEFAULT CURRENT_DATE,
  valor NUMERIC NOT NULL,
  nosso_numero TEXT,
  linha_digitavel TEXT,
  status TEXT NOT NULL DEFAULT 'em_aberto',
  data_baixa DATE,
  forma_baixa TEXT,
  favorecido_nome TEXT NOT NULL,
  favorecido_cnpj_cpf TEXT,
  favorecido_endereco TEXT,
  observacoes TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT contas_a_pagar_pkey PRIMARY KEY (id)
);

-- FKs e CHECKs adicionados separadamente e de forma condicional —
-- se a tabela já existia sem eles, esta migration completa o que
-- faltar; se já existirem (nome de constraint já em uso), pula.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contas_a_pagar_status_check') THEN
    ALTER TABLE contas_a_pagar ADD CONSTRAINT contas_a_pagar_status_check
      CHECK (status IN ('em_aberto', 'pago', 'pago_parcial', 'cancelado'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contas_a_pagar_forma_baixa_check') THEN
    ALTER TABLE contas_a_pagar ADD CONSTRAINT contas_a_pagar_forma_baixa_check
      CHECK (forma_baixa IN (
        'pix', 'transferencia', 'boleto_manual', 'relatorio_bb',
        'comprovante_individual', 'acumulo_automatico', 'manual'
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contas_a_pagar_despesa_parcela_id_fkey') THEN
    ALTER TABLE contas_a_pagar ADD CONSTRAINT contas_a_pagar_despesa_parcela_id_fkey
      FOREIGN KEY (despesa_parcela_id) REFERENCES despesas_parcelas (id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contas_a_pagar_despesa_id_fkey') THEN
    ALTER TABLE contas_a_pagar ADD CONSTRAINT contas_a_pagar_despesa_id_fkey
      FOREIGN KEY (despesa_id) REFERENCES despesas (id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contas_a_pagar_fornecedor_id_fkey') THEN
    ALTER TABLE contas_a_pagar ADD CONSTRAINT contas_a_pagar_fornecedor_id_fkey
      FOREIGN KEY (fornecedor_id) REFERENCES fornecedores (id) ON DELETE SET NULL;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trigger_set_updated_at_contas_a_pagar ON contas_a_pagar;
CREATE TRIGGER trigger_set_updated_at_contas_a_pagar
  BEFORE UPDATE ON contas_a_pagar
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_contas_a_pagar();

-- QA fix (M5) — UNIQUE parcial, o item que faltava aplicar. Impede
-- duas linhas de contas_a_pagar apontarem para a mesma parcela.
CREATE UNIQUE INDEX IF NOT EXISTS contas_a_pagar_despesa_parcela_id_ativo_key
  ON contas_a_pagar (despesa_parcela_id)
  WHERE despesa_parcela_id IS NOT NULL AND deleted_at IS NULL;


-- ── Tabela: contas_a_pagar_eventos ──────────────────────────
CREATE TABLE IF NOT EXISTS contas_a_pagar_eventos (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  titulo_id UUID NOT NULL,
  tipo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  valor_pago NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT contas_a_pagar_eventos_pkey PRIMARY KEY (id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contas_a_pagar_eventos_tipo_check') THEN
    ALTER TABLE contas_a_pagar_eventos ADD CONSTRAINT contas_a_pagar_eventos_tipo_check
      CHECK (tipo IN (
        'criado', 'nosso_numero_vinculado', 'baixa_parcial', 'baixa_total',
        'baixa_manual', 'despesa_complementar_criada', 'cancelado', 'reaberto'
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contas_a_pagar_eventos_titulo_id_fkey') THEN
    ALTER TABLE contas_a_pagar_eventos ADD CONSTRAINT contas_a_pagar_eventos_titulo_id_fkey
      FOREIGN KEY (titulo_id) REFERENCES contas_a_pagar (id) ON DELETE CASCADE;
  END IF;
END $$;


-- ── Tabela: pagar_arquivos_importados ───────────────────────
CREATE TABLE IF NOT EXISTS pagar_arquivos_importados (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  nome_arquivo TEXT NOT NULL,
  hash_arquivo TEXT NOT NULL,
  periodo_de DATE,
  periodo_ate DATE,
  total_registros INTEGER NOT NULL DEFAULT 0,
  processados INTEGER NOT NULL DEFAULT 0,
  nao_encontrados INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT pagar_arquivos_importados_pkey PRIMARY KEY (id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pagar_arquivos_importados_hash_arquivo_key') THEN
    ALTER TABLE pagar_arquivos_importados ADD CONSTRAINT pagar_arquivos_importados_hash_arquivo_key UNIQUE (hash_arquivo);
  END IF;
END $$;


-- ── Tabela: pagar_comprovantes_processados ──────────────────
CREATE TABLE IF NOT EXISTS pagar_comprovantes_processados (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  origem TEXT NOT NULL,
  identificador_natural TEXT NOT NULL,
  contas_a_pagar_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT pagar_comprovantes_processados_pkey PRIMARY KEY (id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pagar_comprovantes_processados_origem_check') THEN
    ALTER TABLE pagar_comprovantes_processados ADD CONSTRAINT pagar_comprovantes_processados_origem_check
      CHECK (origem IN ('comprovante_pdf', 'comprovante_txt'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pagar_comprovantes_processados_identificador_natural_key') THEN
    ALTER TABLE pagar_comprovantes_processados ADD CONSTRAINT pagar_comprovantes_processados_identificador_natural_key
      UNIQUE (identificador_natural);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pagar_comprovantes_processados_contas_a_pagar_id_fkey') THEN
    ALTER TABLE pagar_comprovantes_processados ADD CONSTRAINT pagar_comprovantes_processados_contas_a_pagar_id_fkey
      FOREIGN KEY (contas_a_pagar_id) REFERENCES contas_a_pagar (id);
  END IF;
END $$;


-- ── ALTER TABLE beneficiarios_pessoais — 4 colunas novas ────
ALTER TABLE beneficiarios_pessoais ADD COLUMN IF NOT EXISTS cnpj TEXT;
ALTER TABLE beneficiarios_pessoais ADD COLUMN IF NOT EXISTS regra_conciliacao_pagar TEXT;
ALTER TABLE beneficiarios_pessoais ADD COLUMN IF NOT EXISTS despesa_gerada_categoria TEXT;
ALTER TABLE beneficiarios_pessoais ADD COLUMN IF NOT EXISTS despesa_gerada_subtipo TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'beneficiarios_pessoais_regra_conciliacao_pagar_check') THEN
    ALTER TABLE beneficiarios_pessoais ADD CONSTRAINT beneficiarios_pessoais_regra_conciliacao_pagar_check
      CHECK (regra_conciliacao_pagar IN (
        'holerite_com_abatimento', 'despesa_automatica_baixada', 'acumulo_ate_valor_integral'
      ));
  END IF;
END $$;


-- ── SEED confirmado — UPDATEs são naturalmente idempotentes ──
-- (re-setar o mesmo valor não causa nenhum problema, mesmo rodando
-- várias vezes)
UPDATE beneficiarios_pessoais SET
  regra_conciliacao_pagar = 'holerite_com_abatimento',
  despesa_gerada_categoria = 'contabilidade',
  despesa_gerada_subtipo = 'folha_pro_labore'
WHERE cpf = '080.817.879-25';  -- Sheli de Almeida Aquotti

UPDATE beneficiarios_pessoais SET
  regra_conciliacao_pagar = 'despesa_automatica_baixada',
  despesa_gerada_categoria = 'contabilidade',
  despesa_gerada_subtipo = 'retirada_socio'
WHERE cpf = '130.716.068-93';  -- Darci de Almeida Aquotti

UPDATE beneficiarios_pessoais SET
  regra_conciliacao_pagar = 'despesa_automatica_baixada',
  despesa_gerada_categoria = 'contabilidade',
  despesa_gerada_subtipo = 'retirada_socio'
WHERE cpf = '051.750.059-01';  -- Fábio de Almeida Aquotti

UPDATE beneficiarios_pessoais SET
  regra_conciliacao_pagar = 'despesa_automatica_baixada',
  despesa_gerada_categoria = 'contabilidade',
  despesa_gerada_subtipo = 'bonus_anual'
WHERE cpf = '985.286.969-87';  -- Maycon Luiz Malaquias (CPF)

-- INSERT do Maycon-CNPJ — guardado por NOT EXISTS porque já
-- confirmamos nesta sessão que esta linha JÁ EXISTE no banco
-- (aparece na consulta de diagnóstico anterior) — rodar o INSERT
-- puro de novo duplicaria o prestador_mei do Maycon-CNPJ
INSERT INTO beneficiarios_pessoais (nome, cpf, cnpj, vinculo, regra_conciliacao_pagar, despesa_gerada_categoria, despesa_gerada_subtipo)
SELECT
  'Maycon Luiz Malaquias', NULL, '44.739.377/0001-32', 'prestador_mei',
  'acumulo_ate_valor_integral', 'servicos_profissionais', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM beneficiarios_pessoais WHERE cnpj = '44.739.377/0001-32'
);
