-- ============================================================
-- sql/notificacoes_configuracao.sql
-- Projeto: Ceras Babinete - Gestao Financeira
-- Tabela de configuracao (linha unica, id sempre = 1) para os
-- destinatarios do aviso diario de despesas - editavel pela tela
-- de Usuarios (aba "Notificacoes"), em vez de fixo no codigo ou
-- num secret do Supabase. Pensada para crescer com mais campos de
-- notificacao no futuro (ex: destinatarios do aviso a clientes),
-- sem precisar de uma tabela nova a cada novo tipo de aviso.
-- ============================================================

CREATE TABLE IF NOT EXISTS notificacoes_configuracao (
  id                                      INTEGER NOT NULL DEFAULT 1,
  destinatarios_aviso_diario_despesas     TEXT[] NOT NULL DEFAULT ARRAY['contato@cerasbabinete.com.br']::TEXT[],
  atualizado_em                           TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_por_usuario_id               UUID REFERENCES usuarios(id),
  PRIMARY KEY (id),
  CONSTRAINT notificacoes_configuracao_singleton CHECK (id = 1)
);

INSERT INTO notificacoes_configuracao (id, destinatarios_aviso_diario_despesas)
VALUES (1, ARRAY['contato@cerasbabinete.com.br'])
ON CONFLICT (id) DO NOTHING;

-- RLS ligado, sem nenhuma policy: ninguem consegue ler/escrever
-- direto do navegador (anon/authenticated), mesmo com RLS habilitado
-- e sem policies (aprendizado ja registrado: "RLS enabled with no
-- policies yields silent empty results, not errors"). Só o
-- service_role (usado pela rota de API e pela Edge Function)
-- ignora RLS e consegue acessar.
ALTER TABLE notificacoes_configuracao ENABLE ROW LEVEL SECURITY;
