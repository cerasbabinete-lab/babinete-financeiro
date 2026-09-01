-- ============================================================
-- sql/fornecedores.sql
-- Projeto: Ceras Babinete — Gestão Financeira
-- Função: Fonte única de verdade do schema ATUAL da tabela
--         `fornecedores`. 100% idempotente — pode ser executado em
--         qualquer estado do banco sem duplicar nem quebrar nada.
--         Editar ESTE arquivo sempre que o schema mudar — nunca
--         criar um arquivo numerado novo.
-- Conecta com: types/fornecedores.ts, lib/fornecedoresService.ts,
--              app/fornecedores/page.tsx, despesas.fornecedor_id,
--              contas_a_pagar.fornecedor_id,
--              lib/despesas/fornecedorAutoCreate.ts (busca por
--              cnpj/cpf a cada importação — motivo do índice abaixo),
--              lib/relatorios/gastosPorTipoFornecedor.ts (Módulo
--              Relatórios, relatório 2.6 — consome tipo_fornecedor)
-- Revisão desta versão (Especificacao_Fornecedores_Pix_Categorias_
-- WhatsApp.md, aprovada por Maycon):
--   - Adicionada fornecedor_chaves_pix (Seção 1) — 0..N chaves Pix
--     por fornecedor, no máximo 1 preferencial (garantido por índice
--     único parcial + RPC set_chave_pix_preferencial).
--   - Adicionada fornecedor_categorias (Seção 4) — substitui o CHECK
--     fechado de tipo_fornecedor por tabela editável pelo usuário.
--     Coluna tipo_fornecedor_id (FK) substitui tipo_fornecedor (TEXT);
--     RPC excluir_categoria_fornecedor reclassifica fornecedores para
--     "Não classificado" antes de soft-deletar a categoria.
--   - Nota RLS: assumido inicialmente que fornecedores não tinha RLS
--     habilitado (nenhuma CREATE POLICY/ENABLE ROW LEVEL SECURITY
--     encontrada para esta tabela em todo o sql/*.sql versionado) —
--     CORRIGIDO em produção (01/09/2026): Maycon confirmou via
--     pg_policies que fornecedores tem a política "Usuarios
--     autenticados tem acesso total" (FOR ALL, authenticated,
--     USING true, WITH CHECK true), não capturada em nenhum arquivo
--     .sql do projeto. Ver bloco "HOTFIX — RLS" ao final deste
--     arquivo: replica essa mesma política, com o mesmo nome, nas
--     duas tabelas novas.
-- Revisão anterior (Módulo Relatórios — Especificacao_Modulo_
-- Relatorios.md, Seção 2.6/3, aprovada por Maycon):
--   - Adicionado tipo_fornecedor TEXT + CHECK, nullable. Fornecedores
--     existentes ficam NULL até classificação manual (tela de
--     Fornecedores) — relatório 2.6 trata NULL como grupo visível
--     "Não classificado", nunca omite do total.
--   - Nota de convenção: esta alteração foi feita EDITANDO este
--     arquivo, não criando um sql/relatorios.sql novo — a spec do
--     módulo Relatórios (escrita antes desta consolidação de schema)
--     recomendava arquivo novo, mas o cabeçalho deste arquivo já
--     supersede essa recomendação ("editar sempre que o schema
--     mudar — nunca criar um arquivo numerado novo"). Seguindo a
--     instrução mais recente e explícita do próprio arquivo.
-- Revisão anterior (consolidação, aprovada por Maycon):
--   - uf alinhado para CHAR(2) (era TEXT — inconsistência com
--     clientes.uf, confirmado via information_schema que nenhum
--     valor existente passa de 2 caracteres)
--   - Adicionado deleted_at (soft-delete, alinhado ao resto do sistema)
--   - Normalizado cpf/cnpj = '' para NULL (14 linhas de cpf='' vazio
--     encontradas nesta sessão — string vazia não é a mesma coisa
--     que "sem documento" para fins de UNIQUE constraint)
--   - Adicionado UNIQUE parcial em cnpj e em cpf, agora que estão
--     normalizados (confirmado por Maycon: sem duplicata real de cnpj)
--   - contato_whatsapp ganhou DEFAULT '[]'::jsonb (alinhado com
--     clientes.contato_whatsapp, que já tinha)
--   - dados_bancarios TEXT livre mantido como está — falta de
--     estrutura é debt conhecido, migrar isso é projeto à parte,
--     fora do escopo de uma consolidação de schema
-- ============================================================

CREATE TABLE IF NOT EXISTS fornecedores (
  -- Identificador sequencial bigint (não UUID) — mesma convenção
  -- numérica de clientes.id, mantida por compatibilidade
  id BIGINT NOT NULL DEFAULT nextval('fornecedores_id_seq'::regclass),

  razao TEXT NOT NULL,
  fantasia TEXT,

  "end" TEXT,           -- logradouro (nome atípico mantido — coluna já em produção)
  num TEXT,
  bairro TEXT,
  cep TEXT,
  cidade TEXT,
  uf CHAR(2),            -- alinhado com clientes.uf nesta consolidação

  -- IMPORTANTE: usados pelo motor de conciliação de Contas a Pagar
  -- (buscarFornecedorPorDocumentoAdmin, buscarOuCriarFornecedor) a
  -- cada importação — índice UNIQUE abaixo não é só integridade,
  -- é performance de hot-path
  cnpj TEXT,
  cpf TEXT,
  ie TEXT,

  fone1 TEXT,
  fone2 TEXT,
  contato TEXT,
  fone_contato TEXT,
  email TEXT,
  email_contato TEXT,
  website TEXT,

  dados_bancarios TEXT,  -- texto livre, sem estrutura — debt conhecido, não resolvido aqui

  -- Classificação usada pelo relatório "Gastos por tipo de fornecedor"
  -- (Módulo Relatórios, 2.6) — nullable: fornecedor existente só tem
  -- valor depois de classificação manual na tela de Fornecedores
  tipo_fornecedor TEXT
    CONSTRAINT fornecedores_tipo_fornecedor_check
    CHECK (tipo_fornecedor IN ('materia_prima_insumo', 'embalagem', 'servicos', 'outros')),

  data_nascimento DATE,
  observacoes TEXT,

  contato_whatsapp JSONB DEFAULT '[]'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  deleted_at TIMESTAMPTZ,

  CONSTRAINT fornecedores_pkey PRIMARY KEY (id)
);

-- ── Aditivas — cobrem quem já tinha a tabela criada antes desta consolidação ──
ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE fornecedores ALTER COLUMN contato_whatsapp SET DEFAULT '[]'::jsonb;

-- tipo_fornecedor — Módulo Relatórios (2.6). ADD COLUMN é idempotente
-- por natureza (IF NOT EXISTS); o CHECK precisa do padrão condicional
-- via pg_constraint porque ALTER TABLE ... ADD CONSTRAINT não aceita
-- IF NOT EXISTS diretamente em Postgres
ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS tipo_fornecedor TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fornecedores_tipo_fornecedor_check') THEN
    ALTER TABLE fornecedores ADD CONSTRAINT fornecedores_tipo_fornecedor_check
      CHECK (tipo_fornecedor IN ('materia_prima_insumo', 'embalagem', 'servicos', 'outros'));
  END IF;
END $$;

-- uf: TEXT -> CHAR(2). Seguro porque confirmado nesta sessão que
-- nenhuma linha existente tem valor de uf com mais de 2 caracteres
ALTER TABLE fornecedores ALTER COLUMN uf TYPE CHAR(2);

-- ── Normalização de dado — string vazia não é a mesma coisa que
-- ausência de documento. Idempotente por natureza: depois da
-- primeira execução, não sobra nenhuma linha com '' pra normalizar
-- de novo (WHERE vira no-op) ──
UPDATE fornecedores SET cpf = NULL WHERE cpf = '';
UPDATE fornecedores SET cnpj = NULL WHERE cnpj = '';

-- UNIQUE parcial — confirmado por Maycon nesta sessão: sem duplicata
-- real de cnpj; cpf normalizado acima antes de aplicar
CREATE UNIQUE INDEX IF NOT EXISTS fornecedores_cnpj_key ON fornecedores (cnpj) WHERE cnpj IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS fornecedores_cpf_key ON fornecedores (cpf) WHERE cpf IS NOT NULL;


-- ============================================================
-- SEED — 19 fornecedores (era sql/seed_fornecedores.sql, arquivo
-- separado — incorporado aqui por decisão de Maycon: dado do módulo
-- Fornecedores mora no arquivo do módulo Fornecedores, sem exceção).
-- Gerado originalmente a partir de Fornecedores_Consolidado.csv.
-- Idempotente por razao OU cnpj (corrigido nesta sessão — dedupe só
-- por razao falhava quando a razão social no banco já estava
-- ligeiramente diferente do texto fixo abaixo, ex: sem um "1" sobrando
-- no final de "FENIX CERAS E PROD DERIVADOS LTDA1", provável artefato
-- do CSV original — o script tentava inserir de novo e batia de
-- frente no UNIQUE de cnpj). Cobre também o caso da linha com cnpj
-- NULL, que dedupe só por cnpj não cobriria sozinho.
-- ============================================================
INSERT INTO fornecedores (razao, "end", num, cidade, uf, cnpj, cep, contato, fone1, fone2, website, email, dados_bancarios)
SELECT v.razao, v."end", v.num, v.cidade, v.uf, v.cnpj, v.cep, v.contato, v.fone1, v.fone2, v.website, v.email, v.dados_bancarios
FROM (VALUES
  ('NATHALIA GALVAO GRAFICA E EDITORA', 'RUA MADRE MONICA MARIA', '595', 'MARINGA', 'PR', '32.980.949/0001-91', '87040-440', 'NATHALIA / CARLINHOS', '44-3034-1001', NULL, NULL, 'comercial@graficagalvao.com.br', 'BRADESCO - PIX 32.980.949/0001-91'),
  ('APEX PRECISION INDUSTRIA METALURGICA LTDA - DIAS & DIAS', 'RUA JOSE SILVERIO DO NASCIMENTO', '161', 'LINS', 'SP', '05.641.837/0001-33', '16401-090', 'ELIANA/JULICE', '11-5078-6133', '143532-4141', 'apexprecision.com.br', 'ELIANA@DIASEDIAS.COM', 'BRADESCO - AG: 3512-2 - C/C: 25605-6'),
  ('CASA DO SILICONE - EQUIPE COMERCIAL EIRELI', 'RUA PARÁ', '1670', 'CURITIBA', 'PR', '10.569.086/0001-21', '80610-020', 'KLEVERSON', '41-3345-5577', '41-3329-2299', 'CASADOSILICONE.COM.BR', 'VENDAS@CASADOSILICONE.COM.BR; KLEVERSON@CASADOSILICONE.COM.BR', 'BRADESCO - AG: 3131-3 - C/C: 488-0  |  BANCO DO BRASIL - AG: 4500-4 - C/C: 21172-9'),
  ('IMPORTADORA POWER', 'RUA ITABAIANA', '775', 'SÃO PAULO', 'SP', NULL, '03171-010', 'DANIEL', '11-2605-4533', NULL, 'POWERCORANTES.COM.BR', 'VENDAS@POWERCORANTES.COM.BR', 'BRADESCO - AG: 0299 - C/C: 71855-6  |  ITAU - AG: 0375 - C/C: 30001-9'),
  ('RUFPLAST', 'AV. NOVA CANTAREIRA', '1756', 'SÃO PAULO', 'SP', '08.110.557/0001-97', '02330-002', 'ROBSON', '11-2206-1545', NULL, NULL, 'RUFPLAST@UOL.COM.BR', 'BRADESCO - AG: 3296-4 - C/C: 2635-2'),
  ('MEDMAG INDUST METELURGICA LTDA ME - DIAS E DIAS', 'RUA JOSE SILVERIO DO NASCIMENTO', '161', 'LINS', 'SP', '07.449.923/0001-74', '16401-090', NULL, '14-3523-8454', NULL, NULL, NULL, NULL),
  ('CERAS AIB', 'R. SILVIO ROMERO', '115', 'DIADEMA', 'SP', '60.840.048/0001-30', '09950-340', 'ISABEL', '11-4066-2420', '11-3705-9926', NULL, 'VELASAIB@TERRA.COM.BR', 'BB - AG.: 5853-X - C/C: 1420-6'),
  ('EQUIPE IDEAL COMÉRCIO EIRELI', 'R. ITATIAIA', '605', 'CURITIBA', 'PR', '10.569.086/0002-02', '81070-100', NULL, '41-3565-1095', NULL, NULL, NULL, NULL),
  ('PALACIO DA CERA | M CORDIO CERA - ME', 'R. TABAPUA', '953', 'SÃO PAULO', 'SP', '06.126.575/0001-31', '04533-013', NULL, '11-3079-1197', NULL, NULL, NULL, NULL),
  ('FENIX CERAS E PROD DERIVADOS LTDA1', 'R. MANUEL FAGUNDES DE SOUZA', '361', 'SÃO PAULO', 'SP', '16.984.351/0001-14', '02913-040', 'MARIA CRISTINA', '11-2594-5551', '11-2594-5571', 'FENIXCERAS.COM.BR', 'CRISTINA@FENIXCERAS.COM.BR', 'BRADESCO - AG: 6304-5 - C/C: 1019-7'),
  ('SANTA CRUZ INDUSTRIAL E COMERCIAL LTDA', 'AV. GUILHERME GIORGI', '1320', NULL, NULL, '53.186.342/0001-04', '03422-001', 'DIONÍZIO / CURITIBA', '41-3275-8306', NULL, NULL, NULL, NULL),
  ('EH LATAS', 'RUA JOSE SILVERIO DO NASCIEMNTO', '161', NULL, NULL, '218.962.308-14', '16401-090', 'JULYSSE', '14-99158-2234', NULL, 'INSTAGRAM/EHLATAS', 'JULYSSE@EHLATAS.COM.BR', NULL),
  ('SOLVEN SOLVENTES E QUIMICOS LTDA', 'RUA PROFA. ABIGAIL ALVES PIRES', '301', 'HORTOLANDIA', 'SP', '74.259.896/0001-64', '13185-071', 'ELISANGELA', '19-38659521', '19-99114-5644', 'SOLVEN.COM.BR', 'ELISANGELA@SOLVEN.COM.BR', 'BB - AG.: 3362-6 - C/C: 3007-4   // BRASDESCO - AG.: 3389-8 - C/C: 59.740-6'),
  ('AUTOMACAO MARINGA - W BRASIL ETIQUETAS LTDA', 'R. Manuel Prudêncio de Brito', '130', 'LINS', 'SP', '11.506.178/0001-25', NULL, 'Silvana/Gabriely Maria', '44-3029-1556', NULL, 'https://automacaomaringa.com.br/', 'silvanaautomacaomaringa.com.br; gabriely@automacaomaringa.com.br', NULL),
  ('ISOGAMA INDUSTRIA QUIMICA LTDA', 'ROD BR 376 KM 622', '22175', 'CURITIBA', 'PR', '80.228.893/0001-66', '83090-360', 'IVANA MARIANE TSUCHIYA', '41-2426-4153', '41-99269-5583', 'https://isogama.com/', 'ivana.tsuchiya@isogama.com', NULL),
  ('SYMA INFORMATICA', 'AV. JOAO PAULINO VIEIRA FILHO', '625', 'MARINGA', 'PR', '04.912.543/0001-36', '87020-015', 'SARYTA', '44-4009-9090', NULL, 'https://www.syma.com.br/', 'saryta@syma.com.br', NULL),
  ('EMBALAGENS MARINGA LTDA', 'Rua Joubert de Carvalho', '958', 'MARINGA', 'PR', '80.596.604/0001-81', '87013-200', NULL, '44-3031-3535', '44-99930-9898', 'https://www.embalagensmaringa.com.br/', NULL, NULL),
  ('POLYKRAFT EMBALAGENS', 'RUA PIONEIRO CARLOS HOFFERER', '77', 'MARINGÁ', 'PR', '05.798.961/0001-07', NULL, 'Emerson', '44 99800-5888', NULL, NULL, 'emerson@polykraft.com.br', NULL),
  ('REDE FEMININA DE COMBATE AO CÂNCER - REGIONAL MARINGÁ', 'AVENIDA CERRO AZUL', '1979', NULL, NULL, '76.718.592/0001-43', '87010-055', NULL, '44-3028-7277', '44-9118-4982', NULL, NULL, NULL)
) AS v(razao, "end", num, cidade, uf, cnpj, cep, contato, fone1, fone2, website, email, dados_bancarios)
WHERE NOT EXISTS (
  SELECT 1 FROM fornecedores f
  WHERE f.razao = v.razao
     OR (v.cnpj IS NOT NULL AND f.cnpj = v.cnpj)
);

-- Ressincroniza a sequence de id — defensivo, no-op se já estiver em dia
SELECT setval(pg_get_serial_sequence('public.fornecedores', 'id'), MAX(id)) FROM public.fornecedores;


-- ============================================================
-- ADENDO — CHAVES PIX + CATEGORIAS DINÂMICAS DE FORNECEDOR
-- Especificacao_Fornecedores_Pix_Categorias_WhatsApp.md
-- Aprovado por Maycon. Segue a mesma convenção do resto deste
-- arquivo: idempotente, sem numeração, sem patch separado.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1) FORNECEDOR_CHAVES_PIX — Especificação, Seção 1.2
-- 0..N chaves Pix por fornecedor; no máximo 1 preferencial por vez.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fornecedor_chaves_pix (
  -- Chave primária auto-increment — mesmo padrão numérico do resto do banco
  id             SERIAL PRIMARY KEY,

  -- FK para o fornecedor dono da chave — obrigatório, sem chave órfã
  fornecedor_id  INTEGER NOT NULL REFERENCES fornecedores(id),

  -- Tipo da chave — espelha 1:1 o union TipoChavePix em types/fornecedores.ts
  tipo_chave     TEXT NOT NULL CHECK (tipo_chave IN ('cpf','cnpj','email','celular','aleatoria')),

  -- Valor da chave — SEM validação de formato (regex/dígitos), decisão
  -- explícita da Seção 1.1: só exige "não vazio", aplicado na UI/serviço
  valor_chave    TEXT NOT NULL,

  -- true = chave usada pelo futuro módulo Dashboard e pela geração de
  -- 2ª via de boleto — no máximo uma por fornecedor (índice único abaixo)
  preferencial   BOOLEAN NOT NULL DEFAULT false,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),  -- auditoria — criado em
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),  -- auditoria — atualizado em
  deleted_at     TIMESTAMPTZ                          -- soft-delete — nunca DELETE físico (convenção do projeto)
);

-- Postgres não cria índice de FK automaticamente — obrigatório por
-- convenção do projeto (performance de lookup por fornecedor)
CREATE INDEX IF NOT EXISTS idx_fornecedor_chaves_pix_fornecedor_id
  ON fornecedor_chaves_pix (fornecedor_id);

-- Garante, em nível de banco, no máximo 1 chave preferencial (não-deletada)
-- por fornecedor — o RPC abaixo depende desta garantia pra ser seguro
DROP INDEX IF EXISTS uq_fornecedor_chave_pix_preferencial;
CREATE UNIQUE INDEX uq_fornecedor_chave_pix_preferencial
  ON fornecedor_chaves_pix (fornecedor_id)
  WHERE preferencial = true AND deleted_at IS NULL;

-- RPC — troca atômica da chave preferencial (Seção 1.3). Único jeito de
-- alterar `preferencial` — chamado por definirChavePixPreferencial() em
-- lib/fornecedoresService.ts via supabase.rpc(). Função explícita,
-- NÃO é trigger (proibido pela Seção 0.3 da spec).
CREATE OR REPLACE FUNCTION set_chave_pix_preferencial(p_fornecedor_id INTEGER, p_chave_id INTEGER)
RETURNS void AS $$
BEGIN
  -- Passo 1: desmarca a chave preferencial atual do fornecedor (se houver)
  UPDATE fornecedor_chaves_pix
     SET preferencial = false, updated_at = now()
   WHERE fornecedor_id = p_fornecedor_id AND deleted_at IS NULL AND preferencial = true;

  -- Passo 2: marca a nova chave como preferencial — mesma transação da
  -- função plpgsql do Passo 1, portanto atômico (os dois sucedem juntos ou nenhum)
  UPDATE fornecedor_chaves_pix
     SET preferencial = true, updated_at = now()
   WHERE id = p_chave_id AND fornecedor_id = p_fornecedor_id AND deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────
-- 2) FORNECEDOR_CATEGORIAS — Especificação, Seção 4.2
-- Substitui o CHECK fechado de tipo_fornecedor por tabela editável
-- por qualquer usuário logado, sem restrição de permissão.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fornecedor_categorias (
  id          SERIAL PRIMARY KEY,                -- chave primária auto-increment
  nome        TEXT NOT NULL,                     -- nome da categoria, editável pelo usuário
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(), -- auditoria — criado em
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(), -- auditoria — atualizado em
  deleted_at  TIMESTAMPTZ                         -- soft-delete — nunca DELETE físico
);

-- Impede duas categorias ativas com o mesmo nome (case-insensitive via lower())
DROP INDEX IF EXISTS uq_fornecedor_categoria_nome;
CREATE UNIQUE INDEX uq_fornecedor_categoria_nome
  ON fornecedor_categorias (lower(nome))
  WHERE deleted_at IS NULL;

-- Remove o CHECK do enum fechado — incondicional (DROP CONSTRAINT IF
-- EXISTS + ADD, nunca "IF NOT EXISTS WHERE conname=", convenção do projeto)
ALTER TABLE fornecedores DROP CONSTRAINT IF EXISTS fornecedores_tipo_fornecedor_check;

-- Adiciona a nova coluna FK que substitui tipo_fornecedor (TEXT) —
-- ADD COLUMN IF NOT EXISTS é idempotente por natureza
ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS tipo_fornecedor_id INTEGER REFERENCES fornecedor_categorias(id);

-- Índice de FK — Postgres não cria automaticamente (mesma convenção do
-- índice de fornecedor_chaves_pix acima)
CREATE INDEX IF NOT EXISTS idx_fornecedores_tipo_fornecedor_id
  ON fornecedores (tipo_fornecedor_id);

-- Migração de dados (Seção 4.3) — reset limpo e intencional: sistema
-- ainda pré-lançamento, não é mapeamento campo-a-campo cuidadoso.
--
-- Semeia as 4 categorias que já existiam no enum fechado, agora como
-- pontos de partida editáveis pelo usuário
INSERT INTO fornecedor_categorias (nome)
SELECT v FROM (VALUES ('Matéria-prima / Insumo'), ('Embalagem'), ('Serviços'), ('Outros')) AS t(v)
WHERE NOT EXISTS (SELECT 1 FROM fornecedor_categorias WHERE lower(nome) = lower(t.v));

-- Reseta a classificação de TODO fornecedor para "Não classificado"
-- (tipo_fornecedor_id = NULL) — Maycon reclassifica manualmente pela
-- nova tela. NÃO mapear os valores antigos de tipo_fornecedor para as
-- novas categorias automaticamente — decisão explícita da Seção 4.3
UPDATE fornecedores SET tipo_fornecedor_id = NULL;

-- RPC — exclusão de categoria (Seção 4.4). Único jeito de excluir uma
-- categoria — chamado por excluirCategoria() em lib/fornecedoresService.ts.
-- Ordem importa: reclassifica os fornecedores ANTES de soft-deletar a
-- categoria, pra nenhum fornecedor apontar pra uma categoria já deletada,
-- nem que seja momentaneamente.
CREATE OR REPLACE FUNCTION excluir_categoria_fornecedor(p_categoria_id INTEGER)
RETURNS void AS $$
BEGIN
  -- Passo 1: reclassifica todo fornecedor que usava esta categoria para "Não classificado"
  UPDATE fornecedores
     SET tipo_fornecedor_id = NULL
   WHERE tipo_fornecedor_id = p_categoria_id;

  -- Passo 2: soft-delete da categoria em si — só depois do passo 1 acima
  UPDATE fornecedor_categorias
     SET deleted_at = now(), updated_at = now()
   WHERE id = p_categoria_id AND deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- HOTFIX — RLS em fornecedor_chaves_pix e fornecedor_categorias
-- Descoberto em produção: "new row violates row-level security
-- policy for table 'fornecedor_categorias'" ao tentar adicionar uma
-- categoria. A nota original acima ("fornecedores não tem RLS
-- habilitado") foi baseada só na inspeção dos arquivos .sql
-- versionados no repo — não há acesso de leitura ao estado real do
-- banco neste ambiente (Supabase MCP indisponível).
--
-- Confirmado por Maycon via consulta direta a pg_policies: fornecedores
-- tem a política "Usuarios autenticados tem acesso total" — FOR ALL,
-- TO authenticated, USING (true), WITH CHECK (true). As duas tabelas
-- novas abaixo replicam ESSA política exatamente, inclusive o nome,
-- para consistência entre tabelas do módulo (Seção 1.2: "mirror it
-- exactly, do not invent stricter or looser policies").
--
-- FOR ALL cobre SELECT/INSERT/UPDATE/DELETE em uma política só; os
-- dois RPCs (set_chave_pix_preferencial, excluir_categoria_
-- fornecedor) rodam como SECURITY INVOKER (padrão do Postgres — não
-- declarados SECURITY DEFINER), então ficam sujeitos à mesma política
-- do usuário que chamou, sem necessidade de tratamento à parte.
-- ============================================================

ALTER TABLE fornecedor_chaves_pix ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fornecedor_chaves_pix_authenticated ON fornecedor_chaves_pix; -- nome do hotfix anterior, se já aplicado
DROP POLICY IF EXISTS "Usuarios autenticados tem acesso total" ON fornecedor_chaves_pix;
CREATE POLICY "Usuarios autenticados tem acesso total" ON fornecedor_chaves_pix
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

ALTER TABLE fornecedor_categorias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fornecedor_categorias_authenticated ON fornecedor_categorias; -- nome do hotfix anterior, se já aplicado
DROP POLICY IF EXISTS "Usuarios autenticados tem acesso total" ON fornecedor_categorias;
CREATE POLICY "Usuarios autenticados tem acesso total" ON fornecedor_categorias
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- PASSO FINAL SEPARADO — NÃO roda automaticamente com o resto acima.
-- Execute esta linha manualmente SÓ depois de confirmar que
-- tipo_fornecedor_id está funcionando ponta-a-ponta na aplicação
-- (Builder note, Seção 4.3 da especificação). Deixada comentada de
-- propósito para ser fácil de pular.
-- ============================================================
-- ALTER TABLE fornecedores DROP COLUMN IF EXISTS tipo_fornecedor;

