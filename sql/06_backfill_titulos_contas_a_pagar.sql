-- ============================================================
-- BACKFILL — Contas a Pagar retroativo
-- Projeto: Ceras Babinete — Gestão Financeira
-- Contexto: até esta sessão, nenhum código gerava título em
-- contas_a_pagar a partir de uma Despesa comum (peça que faltava
-- desde o build original do módulo — ver criarTitulosDePagar() em
-- lib/contasAPagarService.ts para o fix definitivo, daqui em diante
-- toda Despesa nova já nasce com título). Este script cobre as
-- despesas_parcelas que já existiam ANTES do fix.
--
-- Idempotente: pode rodar mais de uma vez sem duplicar — o
-- NOT EXISTS cobre parcelas que já tenham título (seja criado por
-- este script antes, seja criado pelo fluxo normal a partir de agora).
-- Ignora parcelas com deleted_at preenchido (soft-deleted).
-- ============================================================

WITH novos_titulos AS (
  INSERT INTO contas_a_pagar (
    despesa_parcela_id, despesa_id, fornecedor_id, numero_documento,
    data_vencimento, data_processamento, valor, nosso_numero, linha_digitavel,
    status, favorecido_nome, favorecido_cnpj_cpf, favorecido_endereco, observacoes
  )
  SELECT
    dp.id,
    dp.despesa_id,
    d.fornecedor_id,
    d.documento_numero,
    dp.data_vencimento,
    COALESCE(d.documento_data_emissao, dp.data_vencimento),
    dp.valor,
    dp.nosso_numero,
    dp.linha_digitavel,
    'em_aberto',
    d.favorecido_nome,
    d.favorecido_cnpj_cpf,
    d.favorecido_endereco,
    'Título criado retroativamente (backfill) — Despesa já existia antes da criação automática de títulos entrar em produção.'
  FROM despesas_parcelas dp
  JOIN despesas d ON d.id = dp.despesa_id
  WHERE dp.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM contas_a_pagar cap WHERE cap.despesa_parcela_id = dp.id
    )
  RETURNING id
)
INSERT INTO contas_a_pagar_eventos (titulo_id, tipo, descricao, valor_pago)
SELECT id, 'criado', 'Título criado retroativamente (backfill) — Despesa já existia antes da criação automática de títulos entrar em produção.', NULL
FROM novos_titulos;
