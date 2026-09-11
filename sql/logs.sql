-- ============================================================
-- sql/logs.sql
-- Projeto: Ceras Babinete — Gestão Financeira
-- Módulo: Log de Acesso (auditoria)
-- Etapa 1: schema — login/logout. Ações de CRUD por módulo
--          (criar/editar/excluir) serão adicionadas incrementalmente
--          conforme cada módulo for plugado (ver Handoff da sessão
--          de 27/08/2026).
-- Convenção: idempotente, pode ser rodado mais de uma vez sem erro.
-- ============================================================

CREATE TABLE IF NOT EXISTS logs_acesso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid REFERENCES usuarios(id),
  username text NOT NULL,
  tipo_evento text NOT NULL CHECK (tipo_evento IN (
    'login_sucesso', 'login_falha', 'logout', 'criar', 'editar', 'excluir'
  )),
  modulo text,               -- null para login/logout; nome do módulo para CRUD (ex.: 'clientes', 'receitas')
  registro_id text,          -- id do registro afetado, só para eventos de CRUD
  registro_descricao text,   -- descrição legível do registro (ex.: "Cliente: João Silva"), evita join na tela de log
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Append-only por natureza (trilha de auditoria) — sem soft-delete,
-- sem UPDATE. Nenhuma linha desta tabela deve ser editada ou
-- fisicamente apagada pela aplicação.

CREATE INDEX IF NOT EXISTS logs_acesso_created_at_idx ON logs_acesso (created_at DESC);
CREATE INDEX IF NOT EXISTS logs_acesso_usuario_id_idx ON logs_acesso (usuario_id);
CREATE INDEX IF NOT EXISTS logs_acesso_modulo_idx ON logs_acesso (modulo);

-- ── Row Level Security (27/08/2026) ──────────────────────────
-- Sem RLS até agora — um Visitante com DevTools poderia apagar a
-- própria trilha de auditoria direto no Supabase. A gravação de
-- verdade (registrarLog()) já passa por pages/api/logs/*.ts com
-- service role (bypassa RLS, não afetada). usuario_atual_eh_
-- visitante() está definida em sql/usuarios.sql — rode aquele
-- arquivo ANTES deste.
ALTER TABLE logs_acesso ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_autenticados" ON logs_acesso;
CREATE POLICY "select_autenticados" ON logs_acesso
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_bloqueia_visitante" ON logs_acesso;
CREATE POLICY "insert_bloqueia_visitante" ON logs_acesso
  FOR INSERT TO authenticated
  WITH CHECK (NOT (SELECT usuario_atual_eh_visitante()));

-- Sem política de UPDATE/DELETE de propósito — append-only por
-- natureza (ver comentário acima na definição da tabela), ninguém
-- deveria poder alterar/apagar via navegador, nem Admin nem equipe.
