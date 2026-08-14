-- ============================================================
-- sql/despesas_contas_pagar.sql
-- Projeto: Ceras Babinete — Gestão Financeira
-- Função: Fonte única de verdade do schema ATUAL dos módulos
--         Despesas + Contas a Pagar — tabelas, constraints, índices,
--         trigger, seed do roster e correções de dado pontuais já
--         aplicadas. 100% idempotente — pode ser executado em
--         qualquer estado do banco sem duplicar nem quebrar nada.
--         Editar ESTE arquivo sempre que o schema OU o dado do
--         roster mudar — nunca criar um arquivo numerado novo.
-- Substitui: 04_despesas_contas_pagar.sql,
--            05_migration_contas_a_pagar_idempotente.sql,
--            06_backfill_titulos_contas_a_pagar.sql,
--            07_fix_roster_cpf_ausente.sql,
--            08_correcao_retroativa_sync_e_duplicidades.sql
-- Conecta com: types/despesas.ts, types/contasAPagar.ts,
--              lib/despesas/*.ts, lib/pagar/*.ts,
--              lib/despesasService.ts, lib/contasAPagarService.ts,
--              pages/api/despesas/*.ts, pages/api/pagar/*.ts
-- Revisão desta versão (fusão, aprovada por Maycon, 14/08/2026):
--   - QA fix: 4 constraints atualizadas pra DROP+ADD incondicional
--     (não mais "IF NOT EXISTS ... WHERE conname" — esse padrão só
--     checa o NOME da constraint, não a definição; ficou provado na
--     prática que isso deixa a constraint desatualizada presa depois
--     de qualquer extensão de enum feita direto no banco em produção):
--       - despesas_categoria_financeira_check: + 'salario'
--       - despesas_status_pagamento_check: + 'pago_parcial'
--       - despesas_parcelas_status_check: + 'pago_parcial'
--       - contas_a_pagar_eventos_tipo_check: + 'correcao_retroativa'
--   - Removida a seção "CORREÇÃO PONTUAL — Excedente do pagamento da
--     Sheli" (R$498,21): esse valor foi substituído duas vezes desde
--     então (R$1.798,21, depois absorvido na consolidação do salário
--     pra R$6.000,00) — mantê-la rodaria dado errado num banco novo.
--     Correções de dado pontuais e já superadas não pertencem ao
--     schema permanente; só a mudança estrutural (constraints acima)
--     tem valor duradouro e foi preservada.
-- Revisão anterior (consolidação):
--   - Índice em TODA coluna de foreign key deste módulo (mesmo
--     achado sistêmico dos outros 3 módulos — Postgres não cria
--     índice automático do lado que aponta pra uma FK)
--   - CHECK de valores válidos em despesas.tipo_documento,
--     categoria_financeira, origem_tipo, origem_classificacao_status,
--     status_pagamento, origem_entrada, despesas_parcelas.status e
--     beneficiarios_pessoais.vinculo — nenhum tinha trava antes.
--   - UNIQUE parcial + índice em beneficiarios_pessoais.cpf/cnpj —
--     consultados a cada pagamento pelo motor de conciliação
--   - Backfill dos títulos retroativos (era 06) incorporado como
--     bloco permanente idempotente, não mais arquivo separado
-- ============================================================


-- ============================================================
-- MÓDULO DESPESAS
-- ============================================================

CREATE TABLE IF NOT EXISTS despesas (
  id UUID NOT NULL DEFAULT gen_random_uuid(),

  tipo_documento TEXT NOT NULL,
  categoria_financeira TEXT NOT NULL,

  favorecido_nome TEXT NOT NULL,
  favorecido_cnpj_cpf TEXT,
  favorecido_endereco TEXT,

  fornecedor_id BIGINT NOT NULL,
  fornecedor_auto_criado BOOLEAN NOT NULL DEFAULT false,

  origem_tipo TEXT NOT NULL,
  origem_beneficiario_nome TEXT,
  origem_beneficiario_cpf TEXT,
  origem_beneficiario_vinculo TEXT,
  origem_classificacao_status TEXT NOT NULL,
  origem_criterios_batidos TEXT[] NOT NULL DEFAULT '{}'::text[],
  origem_ia_sugestao JSONB,

  documento_numero TEXT,
  documento_data_emissao DATE,
  documento_competencia TEXT,

  valor_original NUMERIC NOT NULL DEFAULT 0,
  valor_desconto NUMERIC NOT NULL DEFAULT 0,
  valor_juros_multa NUMERIC NOT NULL DEFAULT 0,
  valor_total NUMERIC NOT NULL DEFAULT 0,

  status_pagamento TEXT NOT NULL DEFAULT 'em_aberto',

  extensao_categoria JSONB NOT NULL DEFAULT '{}'::jsonb,

  origem_entrada TEXT NOT NULL DEFAULT 'manual',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT despesas_pkey PRIMARY KEY (id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'despesas_fornecedor_id_fkey') THEN
    ALTER TABLE despesas ADD CONSTRAINT despesas_fornecedor_id_fkey
      FOREIGN KEY (fornecedor_id) REFERENCES fornecedores (id);
  END IF;

  -- QA fix: nenhum destes 6 campos tinha CHECK antes. Valores
  -- confirmados em types/despesas.ts (anexado por Maycon nesta sessão)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'despesas_tipo_documento_check') THEN
    ALTER TABLE despesas ADD CONSTRAINT despesas_tipo_documento_check
      CHECK (tipo_documento IN ('boleto', 'guia_tributo', 'nota_fiscal', 'recibo', 'fatura_concessionaria', 'holerite'));
  END IF;

  -- QA fix (14/08/2026): trocado de "IF NOT EXISTS...conname" pra
  -- DROP+ADD incondicional — o padrão anterior só checava o NOME da
  -- constraint, não a definição, deixando 'salario' fora mesmo depois
  -- de ter sido adicionada direto no banco em produção
  ALTER TABLE despesas DROP CONSTRAINT IF EXISTS despesas_categoria_financeira_check;
  ALTER TABLE despesas ADD CONSTRAINT despesas_categoria_financeira_check
    CHECK (categoria_financeira IN (
      'aluguel', 'tributos_estadual_municipal', 'concessionarias_utilidades',
      'transporte_frete', 'compra_mercadoria_insumo', 'servicos_profissionais',
      'contabilidade', 'plano_saude', 'salario'
    ));

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'despesas_origem_tipo_check') THEN
    ALTER TABLE despesas ADD CONSTRAINT despesas_origem_tipo_check
      CHECK (origem_tipo IN ('empresarial', 'pessoal_socio'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'despesas_origem_classificacao_status_check') THEN
    ALTER TABLE despesas ADD CONSTRAINT despesas_origem_classificacao_status_check
      CHECK (origem_classificacao_status IN ('auto_classificado', 'revisao_manual'));
  END IF;

  -- QA fix (14/08/2026): mesmo motivo acima — + 'pago_parcial'
  ALTER TABLE despesas DROP CONSTRAINT IF EXISTS despesas_status_pagamento_check;
  ALTER TABLE despesas ADD CONSTRAINT despesas_status_pagamento_check
    CHECK (status_pagamento IN ('em_aberto', 'pago_parcial', 'pago', 'cancelado'));

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'despesas_origem_entrada_check') THEN
    ALTER TABLE despesas ADD CONSTRAINT despesas_origem_entrada_check
      CHECK (origem_entrada IN ('xml_nfse', 'xml_nfe_compra', 'ia_gemini', 'manual', 'motor_conciliacao_pagar'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS despesas_fornecedor_id_idx ON despesas (fornecedor_id);


CREATE TABLE IF NOT EXISTS despesas_parcelas (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  despesa_id UUID NOT NULL,

  numero_parcela INTEGER NOT NULL,
  total_parcelas INTEGER NOT NULL,
  valor NUMERIC NOT NULL,
  data_vencimento DATE NOT NULL,

  linha_digitavel TEXT,
  codigo_barras TEXT,
  nosso_numero TEXT,

  pode_gerar_segunda_via BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'em_aberto',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT despesas_parcelas_pkey PRIMARY KEY (id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'despesas_parcelas_despesa_id_fkey') THEN
    ALTER TABLE despesas_parcelas ADD CONSTRAINT despesas_parcelas_despesa_id_fkey
      FOREIGN KEY (despesa_id) REFERENCES despesas (id);
  END IF;

  -- QA fix (14/08/2026): mesmo motivo acima — + 'pago_parcial'
  ALTER TABLE despesas_parcelas DROP CONSTRAINT IF EXISTS despesas_parcelas_status_check;
  ALTER TABLE despesas_parcelas ADD CONSTRAINT despesas_parcelas_status_check
    CHECK (status IN ('em_aberto', 'pago_parcial', 'pago', 'cancelado'));
END $$;

CREATE INDEX IF NOT EXISTS despesas_parcelas_despesa_id_idx ON despesas_parcelas (despesa_id);


-- ── beneficiarios_pessoais — roster de sócios + prestador MEI ──
CREATE TABLE IF NOT EXISTS beneficiarios_pessoais (
  id UUID NOT NULL DEFAULT gen_random_uuid(),

  nome TEXT NOT NULL,
  cpf TEXT,
  vinculo TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}'::text[],
  endereco TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT beneficiarios_pessoais_pkey PRIMARY KEY (id)
);

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

  -- QA fix: vinculo nunca teve CHECK. Valores confirmados nos
  -- comentários de types/despesas.ts (BeneficiarioPessoalRoster)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'beneficiarios_pessoais_vinculo_check') THEN
    ALTER TABLE beneficiarios_pessoais ADD CONSTRAINT beneficiarios_pessoais_vinculo_check
      CHECK (vinculo IN ('socio', 'prestador_mei'));
  END IF;
END $$;

-- QA fix: cpf/cnpj do roster são consultados a cada pagamento
-- processado pelo motor de conciliação (buscarBeneficiarioRosterPorDocumento)
-- — sem índice, varredura sequencial a cada importação. UNIQUE
-- parcial não conflita com o caso legítimo do Maycon (2 linhas, uma
-- só com cpf preenchido, outra só com cnpj — nunca as duas ao mesmo
-- tempo na mesma linha)
CREATE UNIQUE INDEX IF NOT EXISTS beneficiarios_pessoais_cpf_key ON beneficiarios_pessoais (cpf) WHERE cpf IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS beneficiarios_pessoais_cnpj_key ON beneficiarios_pessoais (cnpj) WHERE cnpj IS NOT NULL;


-- ============================================================
-- MÓDULO CONTAS A PAGAR
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at_contas_a_pagar()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


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

-- Cardinalidade: uma despesa_parcela gera exatamente um título ativo
CREATE UNIQUE INDEX IF NOT EXISTS contas_a_pagar_despesa_parcela_id_ativo_key
  ON contas_a_pagar (despesa_parcela_id)
  WHERE despesa_parcela_id IS NOT NULL AND deleted_at IS NULL;

-- QA fix: índices de FK que faltavam
CREATE INDEX IF NOT EXISTS contas_a_pagar_despesa_id_idx ON contas_a_pagar (despesa_id);
CREATE INDEX IF NOT EXISTS contas_a_pagar_fornecedor_id_idx ON contas_a_pagar (fornecedor_id);


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
  -- QA fix (14/08/2026): mesmo motivo acima — + 'correcao_retroativa'
  -- (necessário pra estornar numericamente um evento errado sem violar
  -- a regra de nunca apagar histórico — contas_a_pagar_eventos é
  -- apenas-INSERT por desenho)
  ALTER TABLE contas_a_pagar_eventos DROP CONSTRAINT IF EXISTS contas_a_pagar_eventos_tipo_check;
  ALTER TABLE contas_a_pagar_eventos ADD CONSTRAINT contas_a_pagar_eventos_tipo_check
    CHECK (tipo IN (
      'criado', 'nosso_numero_vinculado', 'baixa_parcial', 'baixa_total',
      'baixa_manual', 'despesa_complementar_criada', 'cancelado', 'reaberto',
      'correcao_retroativa'
    ));

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contas_a_pagar_eventos_titulo_id_fkey') THEN
    ALTER TABLE contas_a_pagar_eventos ADD CONSTRAINT contas_a_pagar_eventos_titulo_id_fkey
      FOREIGN KEY (titulo_id) REFERENCES contas_a_pagar (id) ON DELETE CASCADE;
  END IF;
END $$;

-- QA fix: consultada toda vez que o sistema calcula "quanto já foi pago"
CREATE INDEX IF NOT EXISTS contas_a_pagar_eventos_titulo_id_idx ON contas_a_pagar_eventos (titulo_id);


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

CREATE INDEX IF NOT EXISTS pagar_comprovantes_processados_contas_a_pagar_id_idx ON pagar_comprovantes_processados (contas_a_pagar_id);


-- ============================================================
-- SEED — Roster de conciliação (sócios + prestador MEI)
-- Trava por `id` (não por cpf — as 4 linhas de sócios/prestador
-- nunca tiveram cpf preenchido antes desta correção, achado desta
-- sessão de testes em uso real)
-- ============================================================

UPDATE beneficiarios_pessoais SET
  cpf = '080.817.879-25',
  regra_conciliacao_pagar = 'holerite_com_abatimento',
  despesa_gerada_categoria = 'contabilidade',
  despesa_gerada_subtipo = 'folha_pro_labore'
WHERE id = 'e21efc65-43c2-47f8-a421-b31ead37f18d';  -- Sheli de Almeida Aquotti

UPDATE beneficiarios_pessoais SET
  cpf = '130.716.068-93',
  regra_conciliacao_pagar = 'despesa_automatica_baixada',
  despesa_gerada_categoria = 'contabilidade',
  despesa_gerada_subtipo = 'retirada_socio'
WHERE id = '9fd17ece-c894-40b0-b6d5-b1cafef33fb0';  -- Darci de Almeida Aquotti

UPDATE beneficiarios_pessoais SET
  cpf = '051.750.059-01',
  regra_conciliacao_pagar = 'despesa_automatica_baixada',
  despesa_gerada_categoria = 'contabilidade',
  despesa_gerada_subtipo = 'retirada_socio'
WHERE id = '65497974-1198-448b-82f4-439849102330';  -- Fábio de Almeida Aquotti

UPDATE beneficiarios_pessoais SET
  cpf = '985.286.969-87',
  regra_conciliacao_pagar = 'despesa_automatica_baixada',
  despesa_gerada_categoria = 'contabilidade',
  despesa_gerada_subtipo = 'bonus_anual'
WHERE id = 'f2edc092-6bf4-4b3b-8555-8784681ff135';  -- Maycon Luiz Malaquias (CPF)

INSERT INTO beneficiarios_pessoais (nome, cpf, cnpj, vinculo, regra_conciliacao_pagar, despesa_gerada_categoria, despesa_gerada_subtipo)
SELECT 'Maycon Luiz Malaquias', NULL, '44.739.377/0001-32', 'prestador_mei',
       'acumulo_ate_valor_integral', 'servicos_profissionais', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM beneficiarios_pessoais WHERE cnpj = '44.739.377/0001-32'
);


-- ============================================================
-- BACKFILL — Títulos retroativos (era 06_backfill_titulos_contas_a_pagar.sql)
-- Cria título em contas_a_pagar para toda despesas_parcela ativa que
-- ainda não tinha um (peça que faltou no build original do módulo —
-- criarTitulosDePagar() cobre todo lançamento novo daqui em diante).
-- Idempotente: NOT EXISTS cobre parcelas que já ganharam título,
-- seja por este bloco antes, seja pelo fluxo normal do sistema.
-- ============================================================

WITH novos_titulos AS (
  INSERT INTO contas_a_pagar (
    despesa_parcela_id, despesa_id, fornecedor_id, numero_documento,
    data_vencimento, data_processamento, valor, nosso_numero, linha_digitavel,
    status, favorecido_nome, favorecido_cnpj_cpf, favorecido_endereco, observacoes
  )
  SELECT
    dp.id, dp.despesa_id, d.fornecedor_id, d.documento_numero,
    dp.data_vencimento, COALESCE(d.documento_data_emissao, dp.data_vencimento),
    dp.valor, dp.nosso_numero, dp.linha_digitavel,
    'em_aberto', d.favorecido_nome, d.favorecido_cnpj_cpf, d.favorecido_endereco,
    'Título criado retroativamente (backfill) — Despesa já existia antes da criação automática de títulos entrar em produção.'
  FROM despesas_parcelas dp
  JOIN despesas d ON d.id = dp.despesa_id
  WHERE dp.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM contas_a_pagar cap WHERE cap.despesa_parcela_id = dp.id)
  RETURNING id
)
INSERT INTO contas_a_pagar_eventos (titulo_id, tipo, descricao, valor_pago)
SELECT id, 'criado', 'Título criado retroativamente (backfill) — Despesa já existia antes da criação automática de títulos entrar em produção.', NULL
FROM novos_titulos;


-- (Seção "CORREÇÃO PONTUAL — Excedente do pagamento da Sheli" removida
-- em 14/08/2026 — o valor de R$498,21 foi substituído duas vezes desde
-- então, ver nota no cabeçalho do arquivo)
