-- ============================================================
-- sql/cron_aviso_diario_despesas.sql
-- Projeto: Ceras Babinete - Gestao Financeira
-- Agenda a Edge Function aviso-diario-despesas via pg_cron, para
-- rodar de segunda a sexta, as 8h no horario de Brasilia
-- (11h UTC - Brasil nao tem mais horario de verao desde 2019).
--
-- ATENCAO, Maycon - NAO VERIFICADO CONTRA UM ARQUIVO REAL EXISTENTE:
-- a migracao que agenda supabase/functions/backup-semanal-automatico
-- (que ja roda toda sexta as 15h) NAO esta commitada neste
-- repositorio - so o comentario da propria funcao menciona sua
-- existencia ("ver a migracao SQL que agenda isso via cron.schedule").
-- Procurei em sql/ e no repositorio inteiro por "cron.schedule" e so
-- apareceu esse comentario, nao a definicao real. Este arquivo foi
-- escrito do zero seguindo a sintaxe padrao do Supabase (extensoes
-- pg_cron + pg_net), sem poder copiar um padrao ja comprovado
-- funcionando. ANTES DE RODAR: abra o Dashboard do Supabase ->
-- Database -> Cron Jobs, veja a definicao real do job de backup, e
-- confira se a forma de autenticacao (nome do secret no Vault, ou
-- outro mecanismo) bate com o que está abaixo. Se for diferente,
-- ajuste este arquivo para seguir o padrao real, nao o contrario.
--
-- Pre-requisito: extensoes pg_cron e pg_net habilitadas no projeto
-- (Dashboard -> Database -> Extensions). Se a funcao de backup ja
-- roda hoje com pg_cron, elas ja devem estar habilitadas.
--
-- Referencia do projeto (ja confirmada em sessao anterior):
--   Supabase Project Ref: hfustjtycznspillcybe
-- ============================================================

-- Idempotente: remove o job antes de recriar, caso este script rode
-- mais de uma vez (mesmo espirito do padrao DROP+ADD ja usado no
-- projeto para constraints).
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'aviso-diario-despesas';

SELECT cron.schedule(
  'aviso-diario-despesas',
  '0 11 * * 1-5',  -- minuto 0, hora 11 UTC (8h Brasilia), segunda(1) a sexta(5)
  $$
  SELECT net.http_post(
    url := 'https://hfustjtycznspillcybe.supabase.co/functions/v1/aviso-diario-despesas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- Nome do secret confirmado no Vault do projeto (Integrations
      -- -> Vault -> Secrets): service_role_key_cron, adicionado em
      -- 12/09/2026 - mesmo secret usado pelo job de backup.
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key_cron'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
