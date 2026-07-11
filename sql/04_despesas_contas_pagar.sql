-- ============================================================
-- sql/04_despesas_contas_pagar.sql
-- Projeto: Ceras Babinete — Babinete Financeiro
-- Função: (A) Documentação de referência do schema REAL e ATUAL
--         de `despesas`, `despesas_parcelas` e `beneficiarios_pessoais`
--         (já em produção, módulo Despesas) — NÃO executar a parte
--         (A) contra produção, essas tabelas já existem.
--         (B) Definição das tabelas NOVAS do módulo Contas a Pagar
--         (`contas_a_pagar`, `contas_a_pagar_eventos`,
--         `pagar_arquivos_importados`, `pagar_comprovantes_processados`)
--         + `ALTER TABLE beneficiarios_pessoais` (4 colunas novas)
--         + seed de dados dos 4 beneficiários — a parte (B) AINDA
--         NÃO FOI EXECUTADA no Supabase; é o próximo passo do plano
--         de build, com aprovação própria e separada desta entrega.
-- Conecta com: types/despesas.ts, lib/despesas/*.ts (módulo Despesas,
--              já em produção); types/contasAPagar.ts,
--              lib/pagar/*.ts, lib/contasAPagarService.ts,
--              pages/api/pagar/*.ts (módulo Contas a Pagar, a construir)
-- Origem dos dados (parte A): information_schema.columns +
--              information_schema.table_constraints, consultados
--              manualmente por Maycon no SQL Editor do Supabase
-- Origem dos dados (parte B): Especificacao_Modulo_Contas_a_Pagar.md,
--              Seção 2.1 (modelo de dados) e Seção 2.2 (schema)
-- Referência: Especificacao_Modulo_Contas_a_Pagar.md, Seção 2.2 —
--             4º dos 4 arquivos obrigatórios de documentação de schema
-- ============================================================


-- ============================================================
-- PARTE A — Tabelas já existentes em produção (módulo Despesas)
-- Apenas documentação — NÃO EXECUTAR contra o banco de produção
-- ============================================================

-- ------------------------------------------------------------
-- Tabela: despesas
-- Documento financeiro de saída (NF-e de compra, NFS-e, comprovante
-- avulso etc.) — origem de `despesas_parcelas`, que por sua vez é
-- origem de `contas_a_pagar` (módulo Contas a Pagar, Parte B abaixo)
-- ------------------------------------------------------------
CREATE TABLE despesas (
  id UUID NOT NULL DEFAULT gen_random_uuid(),

  tipo_documento TEXT NOT NULL,             -- ex: 'nfe_compra' | 'nfse' | 'avulso'
  categoria_financeira TEXT NOT NULL,       -- ex: 'contabilidade', 'servicos_profissionais'

  -- Favorecido/credor — snapshot imutável no momento da criação,
  -- mesmo princípio de `contas_receber.cliente_nome`
  favorecido_nome TEXT NOT NULL,
  favorecido_cnpj_cpf TEXT,
  favorecido_endereco TEXT,

  fornecedor_id BIGINT NOT NULL,            -- FK -> fornecedores.id
  fornecedor_auto_criado BOOLEAN NOT NULL DEFAULT false,

  -- Rastreamento da classificação automática de origem
  -- (empresarial vs. pessoal_socio) feita por classificadorOrigemDespesa.ts
  origem_tipo TEXT NOT NULL,                -- 'empresarial' | 'pessoal_socio'
  origem_beneficiario_nome TEXT,
  origem_beneficiario_cpf TEXT,
  origem_beneficiario_vinculo TEXT,
  origem_classificacao_status TEXT NOT NULL,
  origem_criterios_batidos TEXT[] NOT NULL DEFAULT '{}'::text[],
  origem_ia_sugestao JSONB,                 -- sugestão bruta retornada pelo Gemini, quando usado

  documento_numero TEXT,
  documento_data_emissao DATE,
  documento_competencia TEXT,

  valor_original NUMERIC NOT NULL DEFAULT 0,
  valor_desconto NUMERIC NOT NULL DEFAULT 0,
  valor_juros_multa NUMERIC NOT NULL DEFAULT 0,
  valor_total NUMERIC NOT NULL DEFAULT 0,

  status_pagamento TEXT NOT NULL DEFAULT 'em_aberto',  -- 'em_aberto' | 'pago' | 'cancelado'

  -- Extensão de categoria — estrutura variável conforme categoria_financeira
  -- (ex: ExtensaoContabilidade), tipada em types/despesas.ts
  extensao_categoria JSONB NOT NULL DEFAULT '{}'::jsonb,

  origem_entrada TEXT NOT NULL DEFAULT 'manual',  -- 'manual' | 'xml' | outros

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,                   -- soft-delete, nunca DELETE físico

  CONSTRAINT despesas_pkey PRIMARY KEY (id),
  CONSTRAINT despesas_fornecedor_id_fkey FOREIGN KEY (fornecedor_id) REFERENCES fornecedores (id)
);

-- ------------------------------------------------------------
-- Tabela: despesas_parcelas
-- Parcela individual de uma Despesa (1:N com `despesas`) — origem
-- direta de `contas_a_pagar.despesa_parcela_id` (Parte B abaixo),
-- mesma cardinalidade 1:1 já validada em Contas a Receber
-- (receitas_duplicatas -> contas_receber)
-- ------------------------------------------------------------
CREATE TABLE despesas_parcelas (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  despesa_id UUID NOT NULL,                 -- FK -> despesas.id

  numero_parcela INTEGER NOT NULL,
  total_parcelas INTEGER NOT NULL,
  valor NUMERIC NOT NULL,
  data_vencimento DATE NOT NULL,

  linha_digitavel TEXT,
  codigo_barras TEXT,
  nosso_numero TEXT,                        -- herdado por contas_a_pagar.nosso_numero na criação

  pode_gerar_segunda_via BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'em_aberto',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT despesas_parcelas_pkey PRIMARY KEY (id),
  CONSTRAINT despesas_parcelas_despesa_id_fkey FOREIGN KEY (despesa_id) REFERENCES despesas (id)
);

-- ------------------------------------------------------------
-- Tabela: beneficiarios_pessoais (ESTADO ATUAL, antes do ALTER da
-- Parte B) — roster de sócios + prestador MEI, usado hoje pela
-- classificação origemDespesa (lib/despesas/beneficiariosRoster.ts)
-- e, a partir deste módulo, também pelo motor de conciliação de
-- Contas a Pagar
-- ------------------------------------------------------------
CREATE TABLE beneficiarios_pessoais (
  id UUID NOT NULL DEFAULT gen_random_uuid(),

  nome TEXT NOT NULL,
  cpf TEXT,
  vinculo TEXT NOT NULL,                    -- ex: 'socio' | 'prestador_mei'
  aliases TEXT[] NOT NULL DEFAULT '{}'::text[],
  endereco TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT beneficiarios_pessoais_pkey PRIMARY KEY (id)
);


-- ============================================================
-- PARTE B — Módulo Contas a Pagar (NOVO — ainda não executado)
-- Cada bloco abaixo é uma unidade de trabalho separada do plano
-- de build (item 2), com aprovação própria antes da execução real
-- no Supabase.
-- ============================================================

-- ------------------------------------------------------------
-- Função utilitária de trigger para manter `updated_at` sempre
-- atualizado automaticamente em UPDATE — usada apenas por
-- `contas_a_pagar` (Especificacao_Modulo_Contas_a_Pagar.md, §2.1,
-- coluna updated_at: "Automático via trigger"). Escopada com nome
-- específico deste módulo para não colidir com trigger genérica
-- que porventura já exista em outra parte do projeto (não
-- confirmado nesta sessão — Maycon deve avisar se já existir uma
-- função equivalente reutilizável).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at_contas_a_pagar()
RETURNS TRIGGER AS $$
BEGIN
  -- Atribui o timestamp atual à coluna updated_at da linha sendo alterada
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- Tabela: contas_a_pagar
-- Título a pagar — par estrutural inverso de `contas_receber`,
-- gerado a partir de `despesas_parcelas` (1 parcela -> exatamente
-- 1 título, regra de cardinalidade não-negociável, Seção 7)
-- ------------------------------------------------------------
CREATE TABLE contas_a_pagar (
  id UUID NOT NULL DEFAULT gen_random_uuid(),

  -- Origem do título
  despesa_parcela_id UUID,                  -- FK -> despesas_parcelas.id, ON DELETE SET NULL
  despesa_id UUID,                          -- FK -> despesas.id, ON DELETE SET NULL (navegação direta)
  fornecedor_id BIGINT,                     -- FK -> fornecedores.id, ON DELETE SET NULL (nullable: casos sócio/roster nem sempre têm fornecedor)

  numero_documento TEXT,
  data_vencimento DATE NOT NULL,
  data_processamento DATE NOT NULL DEFAULT CURRENT_DATE,
  valor NUMERIC NOT NULL,

  -- Herdados de despesas_parcelas na criação; nosso_numero também
  -- pode ser confirmado no momento da baixa via Relatório BB
  nosso_numero TEXT,
  linha_digitavel TEXT,

  -- Status — enum fechado (Especificação §2.1)
  status TEXT NOT NULL DEFAULT 'em_aberto'
    CONSTRAINT contas_a_pagar_status_check
    CHECK (status IN ('em_aberto', 'pago', 'pago_parcial', 'cancelado')),

  data_baixa DATE,

  -- Forma de baixa — enum fechado (Especificação §2.1)
  forma_baixa TEXT
    CONSTRAINT contas_a_pagar_forma_baixa_check
    CHECK (forma_baixa IN (
      'pix', 'transferencia', 'boleto_manual', 'relatorio_bb',
      'comprovante_individual', 'acumulo_automatico', 'manual'
    )),

  -- Favorecido — snapshot imutável no momento da emissão, nunca
  -- sobrescrito por alterações posteriores em fornecedores/beneficiarios_pessoais
  favorecido_nome TEXT NOT NULL,
  favorecido_cnpj_cpf TEXT,
  favorecido_endereco TEXT,

  observacoes TEXT,

  deleted_at TIMESTAMPTZ,                   -- soft-delete, nunca DELETE físico

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

-- Trigger que aciona a função acima antes de todo UPDATE em contas_a_pagar
CREATE TRIGGER trigger_set_updated_at_contas_a_pagar
  BEFORE UPDATE ON contas_a_pagar
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_contas_a_pagar();

-- ------------------------------------------------------------
-- Tabela: contas_a_pagar_eventos
-- Log de auditoria imutável de contas_a_pagar — apenas INSERT,
-- nunca UPDATE/DELETE (espelha contas_receber_eventos)
-- ------------------------------------------------------------
CREATE TABLE contas_a_pagar_eventos (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  titulo_id UUID NOT NULL,                  -- FK -> contas_a_pagar.id, ON DELETE CASCADE

  -- Tipo — enum fechado (Especificação §2.1)
  tipo TEXT NOT NULL
    CONSTRAINT contas_a_pagar_eventos_tipo_check
    CHECK (tipo IN (
      'criado', 'nosso_numero_vinculado', 'baixa_parcial', 'baixa_total',
      'baixa_manual', 'despesa_complementar_criada', 'cancelado', 'reaberto'
    )),

  descricao TEXT NOT NULL,

  -- Obrigatório em todo evento de baixa parcial ou total — é a
  -- partir da soma destes valores que o sistema calcula quanto já
  -- foi pago de um título em pago_parcial (única fonte de verdade,
  -- não existe valor_pago_acumulado em contas_a_pagar)
  valor_pago NUMERIC,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT contas_a_pagar_eventos_pkey PRIMARY KEY (id),
  CONSTRAINT contas_a_pagar_eventos_titulo_id_fkey
    FOREIGN KEY (titulo_id) REFERENCES contas_a_pagar (id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- Tabela: pagar_arquivos_importados
-- Dedupe por hash de arquivo inteiro — aplica-se exclusivamente
-- ao Relatório de Pagamentos BB consolidado (um arquivo = um
-- período; reimportação do mesmo arquivo é bloqueada por inteiro)
-- ------------------------------------------------------------
CREATE TABLE pagar_arquivos_importados (
  id UUID NOT NULL DEFAULT gen_random_uuid(),

  nome_arquivo TEXT NOT NULL,
  hash_arquivo TEXT NOT NULL,               -- SHA-256, mesmo padrão de remessas_importadas

  periodo_de DATE,                          -- extraído do cabeçalho "Período: ... a ...", só informativo
  periodo_ate DATE,

  total_registros INTEGER NOT NULL DEFAULT 0,
  processados INTEGER NOT NULL DEFAULT 0,
  nao_encontrados INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT pagar_arquivos_importados_pkey PRIMARY KEY (id),
  CONSTRAINT pagar_arquivos_importados_hash_arquivo_key UNIQUE (hash_arquivo)
);

-- ------------------------------------------------------------
-- Tabela: pagar_comprovantes_processados
-- Dedupe por comprovante individual (não por arquivo) — necessário
-- porque o TXT de comprovantes Pix é sempre sobrescrito com o
-- mesmo nome pelo sistema do BB; a chave de dedupe é o
-- identificador natural do comprovante (NR.AUTENTICACAO para PDF
-- de boleto; ID: ou AUTENTICACAO SISBB: para Pix/TXT)
-- ------------------------------------------------------------
CREATE TABLE pagar_comprovantes_processados (
  id UUID NOT NULL DEFAULT gen_random_uuid(),

  origem TEXT NOT NULL
    CONSTRAINT pagar_comprovantes_processados_origem_check
    CHECK (origem IN ('comprovante_pdf', 'comprovante_txt')),

  identificador_natural TEXT NOT NULL,      -- chave natural de dedupe (ver comentário acima)

  contas_a_pagar_id UUID,                   -- FK -> contas_a_pagar.id (nullable: pode ter virado despesa nova)

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT pagar_comprovantes_processados_pkey PRIMARY KEY (id),
  CONSTRAINT pagar_comprovantes_processados_identificador_natural_key UNIQUE (identificador_natural),
  CONSTRAINT pagar_comprovantes_processados_contas_a_pagar_id_fkey
    FOREIGN KEY (contas_a_pagar_id) REFERENCES contas_a_pagar (id)
);

-- ------------------------------------------------------------
-- ALTER TABLE beneficiarios_pessoais — 4 colunas novas
-- (roster já existe em produção, criado no build de Despesas —
-- NÃO recriar a tabela, apenas adicionar colunas)
-- ------------------------------------------------------------
ALTER TABLE beneficiarios_pessoais
  -- CNPJ do beneficiário, quando aplicável — necessário
  -- especificamente para o caso Maycon (ver seed abaixo e nota de
  -- ambiguidade de schema no final deste arquivo)
  ADD COLUMN cnpj TEXT,

  -- Regra de conciliação do motor de Contas a Pagar. Se NULL, o
  -- CPF/CNPJ é tratado como fornecedor genérico (sem regra
  -- especial), mesmo que exista uma linha no roster. Editável sem
  -- redeploy via RosterBeneficiariosModal.tsx (Seção 4)
  ADD COLUMN regra_conciliacao_pagar TEXT
    CONSTRAINT beneficiarios_pessoais_regra_conciliacao_pagar_check
    CHECK (regra_conciliacao_pagar IN (
      'holerite_com_abatimento', 'despesa_automatica_baixada', 'acumulo_ate_valor_integral'
    )),

  -- categoriaFinanceira a usar ao criar automaticamente uma Despesa
  -- para este beneficiário (ex: 'contabilidade', 'servicos_profissionais')
  ADD COLUMN despesa_gerada_categoria TEXT,

  -- Subtipo dentro da extensão de categoria (ex: 'folha_pro_labore',
  -- 'retirada_socio') — ver alteração de types/despesas.ts abaixo
  ADD COLUMN despesa_gerada_subtipo TEXT;

-- ------------------------------------------------------------
-- SEED — dados reais fornecidos pelo usuário (não é decisão de
-- arquitetura, é dado a inserir). Usa UPDATE por cpf, assumindo
-- que as 4 linhas já existem em produção (criadas no build de
-- Despesas) — se alguma não existir, o UPDATE correspondente não
-- afeta nenhuma linha e deve ser convertido em INSERT manualmente.
--
-- ⚠️ AMBIGUIDADE DE SCHEMA NÃO RESOLVIDA — Maycon precisa confirmar
-- antes desta parte ser executada: o caso Maycon tem DUAS regras
-- diferentes dependendo do documento que bate na transação (CPF ->
-- despesa_automatica_baixada / categoria contabilidade; CNPJ ->
-- acumulo_ate_valor_integral / categoria servicos_profissionais).
-- O modelo de dados definido na Seção 2.1 da especificação só
-- prevê UMA linha com UM valor de regra_conciliacao_pagar por
-- beneficiário — não há coluna para "regra por tipo de documento"
-- na mesma linha. A saída abaixo assume DUAS LINHAS de roster para
-- Maycon (uma por cpf, outra por cnpj, mesmo nome) para manter os
-- dados fiéis à regra de negócio sem alterar o motor de
-- conciliação para lógica hardcoded fora do roster. Isso é uma
-- interpretação minha da especificação, não uma decisão validada
-- por você — preciso da sua confirmação antes de rodar isto contra
-- produção.
-- ------------------------------------------------------------

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

-- Maycon — linha por CPF (documento pessoal, IRPF/benefício)
UPDATE beneficiarios_pessoais SET
  regra_conciliacao_pagar = 'despesa_automatica_baixada',
  despesa_gerada_categoria = 'contabilidade',
  despesa_gerada_subtipo = NULL  -- categoria/subtipo "existente" citado na especificação — Maycon deve confirmar qual subtipo usar aqui
WHERE cpf = '985.286.969-87';  -- Maycon Luiz Malaquias (CPF)

-- Maycon — linha por CNPJ (NF de serviço, prestador MEI)
-- ⚠️ Depende da resolução da ambiguidade de schema descrita acima:
-- se a decisão final for "uma linha só", este INSERT deve ser
-- descartado e a coluna cnpj some para a mesma linha do UPDATE acima
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


-- ============================================================
-- Alteração em types/despesas.ts (fora do banco, referência)
-- ============================================================
-- Adicionar 'retirada_socio' ao enum de subtipo de ExtensaoContabilidade,
-- hoje: 'guia_tributo_federal' | 'honorarios_contabeis' | 'folha_pro_labore'
-- Alteração de CÓDIGO (não de banco) — feita como unidade própria do
-- plano de build (item 3), não neste arquivo SQL. Citada aqui apenas
-- para rastreabilidade, já que os valores usados no seed acima
-- (despesa_gerada_subtipo = 'retirada_socio') dependem dela.
