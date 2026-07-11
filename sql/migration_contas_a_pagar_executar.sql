-- ============================================================
-- MIGRATION — Módulo Contas a Pagar (Item 2 do plano de build)
-- Rodar de uma vez só no SQL Editor do Supabase (projeto sa-east-1).
-- Fonte: sql/04_despesas_contas_pagar.sql, Parte B — já revisado e
-- confirmado por Maycon (comprimento de uf, roster Maycon 2 linhas,
-- subtipo bonus_anual).
-- Idempotência: NÃO é idempotente — rodar duas vezes vai falhar em
-- "already exists" nas tabelas/trigger e pode duplicar as linhas de
-- INSERT do seed do Maycon-CNPJ. Rodar uma única vez.
-- ============================================================

-- Trigger function de updated_at, escopada só para contas_a_pagar
CREATE OR REPLACE FUNCTION set_updated_at_contas_a_pagar()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Tabela: contas_a_pagar
CREATE TABLE contas_a_pagar (
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
  status TEXT NOT NULL DEFAULT 'em_aberto'
    CONSTRAINT contas_a_pagar_status_check
    CHECK (status IN ('em_aberto', 'pago', 'pago_parcial', 'cancelado')),
  data_baixa DATE,
  forma_baixa TEXT
    CONSTRAINT contas_a_pagar_forma_baixa_check
    CHECK (forma_baixa IN (
      'pix', 'transferencia', 'boleto_manual', 'relatorio_bb',
      'comprovante_individual', 'acumulo_automatico', 'manual'
    )),
  favorecido_nome TEXT NOT NULL,
  favorecido_cnpj_cpf TEXT,
  favorecido_endereco TEXT,
  observacoes TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT contas_a_pagar_pkey PRIMARY KEY (id),
  CONSTRAINT contas_a_pagar_despesa_parcela_id_fkey
    FOREIGN KEY (despesa_parcela_id) REFERENCES despesas_parcelas (id) ON DELETE SET NULL,
  CONSTRAINT contas_a_pagar_despesa_id_fkey
    FOREIGN KEY (despesa_id) REFERENCES despesas (id) ON DELETE SET NULL,
  CONSTRAINT contas_a_pagar_fornecedor_id_fkey
    FOREIGN KEY (fornecedor_id) REFERENCES fornecedores (id) ON DELETE SET NULL
);

CREATE TRIGGER trigger_set_updated_at_contas_a_pagar
  BEFORE UPDATE ON contas_a_pagar
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_contas_a_pagar();

-- Tabela: contas_a_pagar_eventos
CREATE TABLE contas_a_pagar_eventos (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  titulo_id UUID NOT NULL,
  tipo TEXT NOT NULL
    CONSTRAINT contas_a_pagar_eventos_tipo_check
    CHECK (tipo IN (
      'criado', 'nosso_numero_vinculado', 'baixa_parcial', 'baixa_total',
      'baixa_manual', 'despesa_complementar_criada', 'cancelado', 'reaberto'
    )),
  descricao TEXT NOT NULL,
  valor_pago NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT contas_a_pagar_eventos_pkey PRIMARY KEY (id),
  CONSTRAINT contas_a_pagar_eventos_titulo_id_fkey
    FOREIGN KEY (titulo_id) REFERENCES contas_a_pagar (id) ON DELETE CASCADE
);

-- Tabela: pagar_arquivos_importados
CREATE TABLE pagar_arquivos_importados (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  nome_arquivo TEXT NOT NULL,
  hash_arquivo TEXT NOT NULL,
  periodo_de DATE,
  periodo_ate DATE,
  total_registros INTEGER NOT NULL DEFAULT 0,
  processados INTEGER NOT NULL DEFAULT 0,
  nao_encontrados INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT pagar_arquivos_importados_pkey PRIMARY KEY (id),
  CONSTRAINT pagar_arquivos_importados_hash_arquivo_key UNIQUE (hash_arquivo)
);

-- Tabela: pagar_comprovantes_processados
CREATE TABLE pagar_comprovantes_processados (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  origem TEXT NOT NULL
    CONSTRAINT pagar_comprovantes_processados_origem_check
    CHECK (origem IN ('comprovante_pdf', 'comprovante_txt')),
  identificador_natural TEXT NOT NULL,
  contas_a_pagar_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT pagar_comprovantes_processados_pkey PRIMARY KEY (id),
  CONSTRAINT pagar_comprovantes_processados_identificador_natural_key UNIQUE (identificador_natural),
  CONSTRAINT pagar_comprovantes_processados_contas_a_pagar_id_fkey
    FOREIGN KEY (contas_a_pagar_id) REFERENCES contas_a_pagar (id)
);

-- ALTER TABLE beneficiarios_pessoais — 4 colunas novas
ALTER TABLE beneficiarios_pessoais
  ADD COLUMN cnpj TEXT,
  ADD COLUMN regra_conciliacao_pagar TEXT
    CONSTRAINT beneficiarios_pessoais_regra_conciliacao_pagar_check
    CHECK (regra_conciliacao_pagar IN (
      'holerite_com_abatimento', 'despesa_automatica_baixada', 'acumulo_ate_valor_integral'
    )),
  ADD COLUMN despesa_gerada_categoria TEXT,
  ADD COLUMN despesa_gerada_subtipo TEXT;

-- SEED confirmado
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

INSERT INTO beneficiarios_pessoais (nome, cpf, cnpj, vinculo, regra_conciliacao_pagar, despesa_gerada_categoria, despesa_gerada_subtipo)
VALUES (
  'Maycon Luiz Malaquias',
  NULL,
  '44.739.377/0001-32',
  'prestador_mei',
  'acumulo_ate_valor_integral',
  'servicos_profissionais',
  NULL
);
