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
-- só bloqueia duplicidade real do mesmo documento preenchido, entre
-- clientes ATIVOS — deleted_at IS NULL evita que um cliente
-- soft-deletado trave o cadastro de um novo com o mesmo documento).
-- REATIVADO (11/09/2026): as 148x/397x de texto de máscara vazia
-- foram limpas (viraram NULL) e os 7 pares de duplicata real foram
-- resolvidos via soft-delete do registro mais antigo/menos completo
-- de cada par — confirmado sem nenhuma duplicata ativa restante.
CREATE UNIQUE INDEX IF NOT EXISTS clientes_cnpj_key ON clientes (cnpj) WHERE cnpj IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS clientes_cpf_key ON clientes (cpf) WHERE cpf IS NOT NULL AND deleted_at IS NULL;

-- ── Row Level Security (27/08/2026) ──────────────────────────
-- Fecha o acesso direto do navegador (client anon) à tabela — hoje
-- lib/clientesService.ts fala direto com o Supabase, sem passar por
-- rota de API nenhuma, então RLS é o ÚNICO ponto que protege contra
-- escrita do Visitante nesse caminho (proxy.ts só cobre /api/*).
-- Leitura continua liberada pra todo autenticado — nada muda para
-- Admin/equipe. usuario_atual_eh_visitante() está definida em
-- sql/usuarios.sql — rode aquele arquivo ANTES deste.
-- ACHADO CRÍTICO nesta sessão (27/08/2026, confirmado via
-- pg_policies): já existiam policies "clientes_select"/
-- "clientes_insert"/"clientes_update" nesta tabela, criadas fora do
-- controle de versão — nomes que meus DROP POLICY originais não
-- previam. Sem derrubar essas, minha policy nova coexistiria com
-- a antiga (permissiva, sem checagem de Visitante) e — como o
-- Postgres combina policies permissivas com OU — a antiga sozinha
-- já bastaria pra liberar geral, anulando a proteção nova por
-- completo. Derrubadas explicitamente abaixo.
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clientes_select" ON clientes;
DROP POLICY IF EXISTS "clientes_insert" ON clientes;
DROP POLICY IF EXISTS "clientes_update" ON clientes;
DROP POLICY IF EXISTS "clientes_delete" ON clientes;  -- não existia, mas idempotente por precaução

DROP POLICY IF EXISTS "select_autenticados" ON clientes;
CREATE POLICY "select_autenticados" ON clientes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_bloqueia_visitante" ON clientes;
CREATE POLICY "insert_bloqueia_visitante" ON clientes
  FOR INSERT TO authenticated
  WITH CHECK (NOT (SELECT usuario_atual_eh_visitante()));

DROP POLICY IF EXISTS "update_bloqueia_visitante" ON clientes;
CREATE POLICY "update_bloqueia_visitante" ON clientes
  FOR UPDATE TO authenticated
  USING (NOT (SELECT usuario_atual_eh_visitante()));

DROP POLICY IF EXISTS "delete_bloqueia_visitante" ON clientes;
CREATE POLICY "delete_bloqueia_visitante" ON clientes
  FOR DELETE TO authenticated
  USING (NOT (SELECT usuario_atual_eh_visitante()));

-- ── Parte 2 (27/08/2026): mascaramento pro Visitante ─────────
-- ATUALIZA a policy de SELECT acima: bloqueia leitura DIRETA da
-- tabela real pro Visitante (senão ele consegue ver dado real via
-- DevTools/REST direto, ignorando a view abaixo por completo — a
-- view sozinha não adianta nada se a tabela real continuar aberta
-- pra leitura). Admin/equipe continuam lendo a tabela real
-- normalmente, sem nenhuma mudança.
DROP POLICY IF EXISTS "select_autenticados" ON clientes;
DROP POLICY IF EXISTS "select_bloqueia_visitante_na_tabela_real" ON clientes;
CREATE POLICY "select_bloqueia_visitante_na_tabela_real" ON clientes
  FOR SELECT TO authenticated
  USING (NOT (SELECT usuario_atual_eh_visitante()));

-- clientes_visitante: view com os mesmos nomes/tipos de coluna da
-- tabela real, mas com campos sensíveis trocados por dado fictício
-- (determinístico por id — o mesmo cliente sempre mostra o mesmo
-- nome fictício, sem trocar a cada carregamento) quando quem lê é
-- Visitante. Para Admin/equipe, a view devolve os dados reais sem
-- nenhuma alteração — um único código de leitura serve pros dois
-- perfis (ver lib/clientesService.ts, troca de TABELA para
-- TABELA_LEITURA). Views rodam com o privilégio de quem criou (não
-- do usuário que consulta), então conseguem ler a tabela real mesmo
-- com o SELECT bloqueado acima — comportamento padrão do Postgres
-- pra views, documentado pela própria Supabase.
CREATE OR REPLACE VIEW clientes_visitante AS
SELECT
  c.id,
  CASE WHEN v.eh_visitante THEN 'Cliente exemplo #' || lpad(c.id::text, 3, '0') ELSE c.razao END AS razao,
  CASE WHEN v.eh_visitante THEN NULL ELSE c.fantasia END AS fantasia,
  CASE WHEN v.eh_visitante THEN NULL ELSE c."end" END AS "end",
  CASE WHEN v.eh_visitante THEN NULL ELSE c.num END AS num,
  CASE WHEN v.eh_visitante THEN NULL ELSE c.bairro END AS bairro,
  CASE WHEN v.eh_visitante THEN NULL ELSE c.cep END AS cep,
  CASE WHEN v.eh_visitante THEN NULL ELSE c.cidade END AS cidade,
  c.uf,
  CASE WHEN v.eh_visitante AND c.cnpj IS NOT NULL THEN lpad(((c.id * 7919) % 100000000000000)::text, 14, '0') ELSE c.cnpj END AS cnpj,
  CASE WHEN v.eh_visitante AND c.cpf IS NOT NULL THEN lpad(((c.id * 7919) % 100000000000)::text, 11, '0') ELSE c.cpf END AS cpf,
  CASE WHEN v.eh_visitante THEN NULL ELSE c.ie END AS ie,
  CASE WHEN v.eh_visitante THEN '(44) 90000-' || lpad((c.id % 10000)::text, 4, '0') ELSE c.fone1 END AS fone1,
  CASE WHEN v.eh_visitante THEN NULL ELSE c.fone2 END AS fone2,
  CASE WHEN v.eh_visitante THEN NULL ELSE c.contato END AS contato,
  CASE WHEN v.eh_visitante THEN NULL ELSE c.fone_contato END AS fone_contato,
  CASE WHEN v.eh_visitante THEN 'contato' || c.id || '@exemplo.com.br' ELSE c.email END AS email,
  CASE WHEN v.eh_visitante THEN NULL ELSE c.email_contato END AS email_contato,
  c.nomelista,
  CASE WHEN v.eh_visitante THEN NULL ELSE c.observacoes END AS observacoes,
  CASE WHEN v.eh_visitante THEN '[]'::jsonb ELSE c.contato_whatsapp END AS contato_whatsapp,
  CASE WHEN v.eh_visitante THEN NULL ELSE c.telefone_whatsapp END AS telefone_whatsapp,
  c.created_at,
  c.updated_at,
  CASE WHEN v.eh_visitante THEN NULL ELSE c.data_nascimento END AS data_nascimento,
  c.deleted_at
FROM clientes c, LATERAL (SELECT usuario_atual_eh_visitante() AS eh_visitante) v;

GRANT SELECT ON clientes_visitante TO authenticated;

-- ============================================================
-- IMPORTANTE — cole e rode em DUAS VEZES separadas, não de uma vez:
-- 1) Selecione e cole só até a linha do GRANT acima, rode, confirme
--    sucesso (SELECT viewname FROM pg_views WHERE viewname =
--    'clientes_visitante';)
-- 2) Só depois, selecione e cole o resto abaixo (bloco de Storage)
-- Motivo: storage.objects pertence a outro dono dentro do Supabase
-- (supabase_storage_admin, não postgres). Se essa parte falhar por
-- permissão colada junto com o resto numa única execução, o
-- Supabase reverte TUDO — inclusive a view acima, que já tinha
-- rodado com sucesso. Isso já aconteceu nesta sessão (11/09/2026) e
-- foi a causa raiz de a view nunca aparecer mesmo "rodando o
-- arquivo inteiro". Ainda é 1 arquivo só — só a colagem no editor
-- que precisa ser em duas partes.
-- ============================================================

-- ── Storage: bucket 'backups' (27/08/2026) ───────────────────
-- RLS de tabela não cobre Storage — é um sistema de permissão à
-- parte (storage.objects). listarBackups()/baixarBackup() em
-- lib/clientesService.ts chamam esse bucket direto do navegador.
-- Achado nesta sessão: as políticas existentes (criadas antes, fora
-- do controle de versão deste projeto — confirmado via
-- pg_policies, não existiam em nenhum arquivo sql/*.sql) liberavam
-- qualquer autenticado sem distinção — o Visitante conseguia listar
-- e baixar backups reais. Recriadas com o mesmo escopo original
-- (bucket 'backups'), só acrescentando o bloqueio. Sem versão
-- "mascarada" de um arquivo de backup — Visitante fica sem acesso
-- nenhum a este bucket, leitura ou escrita.
DROP POLICY IF EXISTS "backups_select_authenticated" ON storage.objects;
CREATE POLICY "backups_select_authenticated" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'backups' AND NOT (SELECT usuario_atual_eh_visitante()));

DROP POLICY IF EXISTS "backups_insert_authenticated" ON storage.objects;
CREATE POLICY "backups_insert_authenticated" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'backups' AND NOT (SELECT usuario_atual_eh_visitante()));
