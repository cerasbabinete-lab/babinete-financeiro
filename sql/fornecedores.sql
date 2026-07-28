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
-- Revisão desta versão (Módulo Relatórios — Especificacao_Modulo_
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
  ('EMBALAGENS MARINGA LTDA', 'Rua Joubert de Carvalho', '958', 'MARINGA', 'PR', '80.596.604/0001', '87013-200', NULL, '44-3031-3535', '44-99930-9898', 'https://www.embalagensmaringa.com.br/', NULL, NULL),
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

