-- ============================================================
-- sql/usuarios.sql
-- Projeto: Ceras Babinete — Gestão Financeira
-- Função: Fonte única de verdade do schema do Módulo Usuários
--         (controle de acesso interno). 100% idempotente — pode
--         ser executado em qualquer estado do banco sem duplicar
--         nem quebrar nada. Editar ESTE arquivo sempre que o schema
--         mudar — nunca criar um arquivo numerado novo (convenção
--         do projeto, ver clientes.sql/fornecedores.sql).
-- Conecta com: lib/usuariosService.ts, pages/api/usuarios/*.ts,
--              app/usuarios/page.tsx, app/login/page.tsx (login
--              passa a usar email_tecnico derivado de username),
--              auth.users (Supabase Auth — cada linha de usuarios
--              tem um auth_user_id correspondente, criado via
--              Auth Admin API, nunca via INSERT direto neste arquivo)
-- Origem: Especificacao_Modulo_Usuarios.md (brain-engineer-interview,
--         aprovado por Maycon) + decisões confirmadas em sessão de
--         build (engineer-builder):
--   - Admin identificado por auth_user_id fixo + email de login fixo
--     (dupla verificação) — ver lib/usuariosService.ts
--   - status ('ativo'/'inativo') é flag só organizacional/visual,
--     NÃO bloqueia login — distinto de deleted_at (soft-delete real)
--   - Unicidade de username/email_tecnico escopada a deleted_at IS
--     NULL (permite reuso após exclusão de um usuário — decisão
--     explícita da Seção 2.2.1 da especificação).
--   - RLS: PRIMEIRA tabela do projeto com Row Level Security
--     habilitado. Nenhuma tabela existente (clientes, fornecedores,
--     despesas, receitas, contas_a_pagar, contas_receber) usa RLS —
--     usuarios e usuarios_permissoes são as primeiras exceções, por
--     decisão explícita da Seção 2.3.
-- Nota de bootstrap: o Admin ATUAL (temporário, em uso desde
-- 21/08/2026) reaproveita a conta já existente cerasbabinete@gmail.com
-- (auth_user_id 290d11d7-b725-4e3c-8d31-f08d872830b6), inserida via
-- script de bootstrap avulso (fora deste arquivo, entregue no chat da
-- sessão de build) — não semeada aqui. Quando um Admin definitivo for
-- criado pela própria tela, atualizar ADMIN_AUTH_USER_ID/
-- ADMIN_LOGIN_EMAIL/NEXT_PUBLIC_ADMIN_USERNAME/NEXT_PUBLIC_ADMIN_LOGIN_EMAIL
-- no .env e então excluir esta conta temporária do Auth.
-- ============================================================


-- ── Tabela usuarios ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id                    UUID NOT NULL DEFAULT gen_random_uuid(),
  nome_completo         TEXT NOT NULL,
  username              TEXT NOT NULL,
  email_tecnico         TEXT NOT NULL,
  cpf_cnpj              TEXT NOT NULL,
  data_nascimento       DATE NOT NULL,
  celular_whatsapp      TEXT NOT NULL,
  email_pessoal         TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'ativo',
  auth_user_id          UUID NOT NULL,
  deleted_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_status_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_status_check
  CHECK (status IN ('ativo', 'inativo'));

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_username_ativo_key
  ON usuarios (username) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_tecnico_ativo_key
  ON usuarios (email_tecnico) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION set_updated_at_usuarios()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_updated_at_usuarios ON usuarios;
CREATE TRIGGER trigger_set_updated_at_usuarios
  BEFORE UPDATE ON usuarios
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_usuarios();


-- ── Tabela usuarios_permissoes ───────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios_permissoes (
  id            UUID NOT NULL DEFAULT gen_random_uuid(),
  usuario_id    UUID NOT NULL,
  modulo        TEXT NOT NULL,
  acao          TEXT NOT NULL,
  permitido     BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT usuarios_permissoes_usuario_id_fkey
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
);

ALTER TABLE usuarios_permissoes DROP CONSTRAINT IF EXISTS usuarios_permissoes_modulo_check;
ALTER TABLE usuarios_permissoes ADD CONSTRAINT usuarios_permissoes_modulo_check
  CHECK (modulo IN (
    'clientes', 'fornecedores', 'receitas', 'contas_receber',
    'despesas', 'contas_a_pagar', 'relatorios', 'usuarios',
    'dashboard', 'backup'
  ));

ALTER TABLE usuarios_permissoes DROP CONSTRAINT IF EXISTS usuarios_permissoes_acao_check;
ALTER TABLE usuarios_permissoes ADD CONSTRAINT usuarios_permissoes_acao_check
  CHECK (acao IN ('criar', 'editar', 'excluir', 'exportar', 'visualizar'));

CREATE INDEX IF NOT EXISTS usuarios_permissoes_usuario_id_idx
  ON usuarios_permissoes (usuario_id);

CREATE OR REPLACE FUNCTION set_updated_at_usuarios_permissoes()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_updated_at_usuarios_permissoes ON usuarios_permissoes;
CREATE TRIGGER trigger_set_updated_at_usuarios_permissoes
  BEFORE UPDATE ON usuarios_permissoes
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_usuarios_permissoes();


-- ── Row Level Security ───────────────────────────────────────
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios_permissoes ENABLE ROW LEVEL SECURITY;
-- Nenhuma policy é criada de propósito — RLS habilitado sem NENHUMA
-- policy = deny-all por padrão pro client anon (service role bypassa).
