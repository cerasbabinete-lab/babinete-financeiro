-- ============================================================
-- sql/08_correcao_retroativa_sync_e_duplicidades.sql
-- Projeto: Ceras Babinete — Gestão Financeira
-- Sessão: 12/07/2026 — correção retroativa de 3 problemas reais
-- encontrados em teste ao vivo do módulo Contas a Pagar.
-- Idempotente: cada bloco checa o estado atual antes de agir, pode
-- ser executado mais de uma vez sem duplicar nem corromper nada.
-- ============================================================


-- ============================================================
-- PARTE A — Sincronização retroativa Despesas x Contas a Pagar
-- Corrige o gap confirmado com o caso SKY: títulos baixados pelo
-- motor de conciliação (Passos 2/3/3B e processarAcumulo) nunca
-- propagavam o novo status para despesas.status_pagamento nem
-- despesas_parcelas.status. Este UPDATE cobre todo o histórico já
-- desatualizado; o fix de código (motorConciliacao.ts) garante que
-- isso não volte a acontecer daqui pra frente.
-- ============================================================

UPDATE despesas d
SET status_pagamento = cap.status
FROM contas_a_pagar cap
WHERE cap.despesa_id = d.id
  AND cap.status IN ('em_aberto', 'pago', 'pago_parcial')
  AND d.status_pagamento IS DISTINCT FROM cap.status;

UPDATE despesas_parcelas dp
SET status = cap.status
FROM contas_a_pagar cap
WHERE cap.despesa_parcela_id = dp.id
  AND cap.status IN ('em_aberto', 'pago', 'pago_parcial')
  AND dp.status IS DISTINCT FROM cap.status;


-- ============================================================
-- PARTE B — Sheli de Almeida Aquotti (080.817.879-25)
-- Causa raiz: o título original do holerite (R$2.501,79) já estava
-- 'pago' (fechado manualmente numa sessão anterior, sem cálculo de
-- excedente) ANTES do CPF da Sheli ser corrigido no roster. Quando
-- os 3 pagamentos reais (R$300 + R$1.000 + R$3.000 = R$4.300) foram
-- reprocessados nesta sessão, o motor não achou título em aberto pra
-- acumular contra e criou 3 Despesas novas duplicadas, uma pra cada
-- pagamento — dado o mesmo dinheiro já ter sido usado pra fechar o
-- título original, isso duplicou R$4.300 no sistema.
-- Regra de negócio confirmada por Maycon: total depositado no CPF é
-- abatido contra a meta (R$2.501,79); o excedente vira UM título de
-- despesa "sócio" adicional. Excedente real = 4.300,00 - 2.501,79 =
-- 1.798,21 (não R$498,21 como uma correção anterior mal calculou,
-- que só considerava o Pix de R$3.000 isoladamente).
-- ============================================================

DO $$
DECLARE
  v_despesa_id UUID;
  v_parcela_id UUID;
  v_titulo_complementar_id UUID;
  v_valor_excedente NUMERIC := 1798.21; -- 300 + 1000 + 3000 - 2501.79
BEGIN
  -- Idempotência: se a despesa complementar certa já existe, não
  -- refaz nada (nem cancela as duplicadas de novo, nem cria outra)
  IF EXISTS (
    SELECT 1 FROM despesas
    WHERE origem_criterios_batidos @> ARRAY['correcao_retroativa_manual_v2']
      AND favorecido_cnpj_cpf = '080.817.879-25'
  ) THEN
    RAISE NOTICE 'Correção da Sheli já aplicada — nada a fazer.';
    RETURN;
  END IF;

  -- ── Cancela (soft-delete) as 3 despesas duplicadas criadas hoje ──
  -- pelo branch de "anomalia" do motor (ids confirmados nesta sessão
  -- via query, não deduzidos — R$300, R$1.000 e R$3.000)
  UPDATE despesas SET status_pagamento = 'cancelado', deleted_at = now()
  WHERE id IN (
    '18e6dc89-6f9b-439c-a9cb-782843a71b29', -- R$3.000
    '6ad62a9d-4dde-4cf0-80f3-ae5f0d19576b', -- R$1.000
    '5811b67a-d56f-42e4-90e2-8cc5de23c826'  -- R$300
  ) AND deleted_at IS NULL;

  UPDATE despesas_parcelas SET status = 'cancelado', deleted_at = now()
  WHERE despesa_id IN (
    '18e6dc89-6f9b-439c-a9cb-782843a71b29',
    '6ad62a9d-4dde-4cf0-80f3-ae5f0d19576b',
    '5811b67a-d56f-42e4-90e2-8cc5de23c826'
  ) AND deleted_at IS NULL;

  UPDATE contas_a_pagar SET status = 'cancelado', deleted_at = now(),
    observacoes = COALESCE(observacoes || ' | ', '') || 'Cancelado em correção retroativa (12/07/2026) — duplicava dinheiro já contabilizado no título original R$2.501,79.'
  WHERE despesa_id IN (
    '18e6dc89-6f9b-439c-a9cb-782843a71b29',
    '6ad62a9d-4dde-4cf0-80f3-ae5f0d19576b',
    '5811b67a-d56f-42e4-90e2-8cc5de23c826'
  ) AND deleted_at IS NULL;

  -- ── Cria a Despesa complementar única, já paga, com o valor certo ──
  INSERT INTO despesas (
    tipo_documento, categoria_financeira, favorecido_nome, favorecido_cnpj_cpf,
    fornecedor_id, fornecedor_auto_criado, origem_tipo, origem_beneficiario_nome,
    origem_beneficiario_cpf, origem_beneficiario_vinculo, origem_classificacao_status,
    origem_criterios_batidos, documento_data_emissao, valor_original, valor_total,
    status_pagamento, extensao_categoria, origem_entrada
  ) VALUES (
    'holerite', 'contabilidade', 'Sheli de Almeida Aquotti', '080.817.879-25',
    35, false, 'pessoal_socio', 'Sheli de Almeida Aquotti',
    '080.817.879-25', 'socio', 'auto_classificado',
    ARRAY['correcao_retroativa_manual_v2'], '2026-07-10', v_valor_excedente, v_valor_excedente,
    'pago',
    jsonb_build_object('contabilidade', jsonb_build_object(
      'subtipo', 'retirada_socio', 'composicaoTributos', NULL,
      'funcionario', NULL, 'rubricas', NULL, 'itensHonorarios', NULL
    )),
    'motor_conciliacao_pagar'
  ) RETURNING id INTO v_despesa_id;

  INSERT INTO despesas_parcelas (
    despesa_id, numero_parcela, total_parcelas, valor, data_vencimento,
    pode_gerar_segunda_via, status
  ) VALUES (
    v_despesa_id, 1, 1, v_valor_excedente, '2026-07-10', false, 'pago'
  ) RETURNING id INTO v_parcela_id;

  INSERT INTO contas_a_pagar (
    despesa_parcela_id, despesa_id, fornecedor_id, data_vencimento,
    valor, status, data_baixa, forma_baixa, favorecido_nome,
    favorecido_cnpj_cpf, observacoes
  ) VALUES (
    v_parcela_id, v_despesa_id, 35, '2026-07-10',
    v_valor_excedente, 'pago', '2026-07-10', 'acumulo_automatico', 'Sheli de Almeida Aquotti',
    '080.817.879-25',
    'Despesa complementar retroativa (correção v2, 12/07/2026) — excedente real dos 3 Pix de julho (R$300+R$1.000+R$3.000=R$4.300,00) sobre o holerite de R$2.501,79. Substitui as 3 Despesas duplicadas canceladas na mesma correção.'
  ) RETURNING id INTO v_titulo_complementar_id;

  INSERT INTO contas_a_pagar_eventos (titulo_id, tipo, descricao, valor_pago)
  VALUES (v_titulo_complementar_id, 'criado', 'Título complementar criado em correção retroativa (12/07/2026) — excedente real de R$1.798,21 sobre os 3 pagamentos de julho.', NULL);

  INSERT INTO contas_a_pagar_eventos (titulo_id, tipo, descricao, valor_pago)
  VALUES (v_titulo_complementar_id, 'baixa_total', 'Baixa retroativa — valor já efetivamente pago nos 3 Pix de julho de 2026.', v_valor_excedente);

  -- Anota o título original (holerite R$2.501,79), sem alterar seu status
  INSERT INTO contas_a_pagar_eventos (titulo_id, tipo, descricao, valor_pago)
  SELECT id, 'despesa_complementar_criada',
    'Excedente de R$1.798,21 identificado retroativamente (correção 12/07/2026) — gerou a Despesa complementar / título ' || v_titulo_complementar_id || '.',
    NULL
  FROM contas_a_pagar WHERE favorecido_cnpj_cpf = '080.817.879-25' AND valor = 2501.79 AND deleted_at IS NULL;

  RAISE NOTICE 'Correção da Sheli aplicada: Despesa % / título complementar %.', v_despesa_id, v_titulo_complementar_id;
END $$;


-- ============================================================
-- PARTE C — Maycon Luiz Malaquias, CNPJ 44.739.377/0001-32
-- Causa raiz: o histórico de eventos do título de R$6.000 (NF 34)
-- mostra DOIS eventos de R$3.000 (baixa_parcial + baixa_total,
-- somando 6.000 = valor cheio do título) — mas o Relatório BB real
-- só registra UM pagamento de R$3.000 (01/07) pro CNPJ do Maycon,
-- mais um de R$1.000 (07/07). Ou seja: um dos dois R$3.000 é
-- reprocessamento fantasma de sessão anterior, não dinheiro real.
-- Total real recebido = R$3.000 + R$1.000 = R$4.000 (não R$6.000).
-- contas_a_pagar_eventos é apenas-INSERT por desenho — a correção
-- não apaga o evento fantasma, ela ESTORNA numericamente (evento
-- negativo) e reabre o título pro valor real. Isso exige o novo
-- tipo de evento 'correcao_retroativa' (autorizar abaixo).
-- ============================================================

-- Novo valor de enum — mesmo padrão de extensão já usado antes
-- neste projeto (retirada_socio, bonus_anual, motor_conciliacao_pagar)
DO $$
BEGIN
  ALTER TABLE contas_a_pagar_eventos DROP CONSTRAINT IF EXISTS contas_a_pagar_eventos_tipo_check;
  ALTER TABLE contas_a_pagar_eventos ADD CONSTRAINT contas_a_pagar_eventos_tipo_check
    CHECK (tipo IN (
      'criado', 'nosso_numero_vinculado', 'baixa_parcial', 'baixa_total',
      'baixa_manual', 'despesa_complementar_criada', 'cancelado', 'reaberto',
      'correcao_retroativa'
    ));
END $$;

DO $$
DECLARE
  v_titulo_id UUID := '1aebf10a-ec8d-473e-9431-1b341c7037d1'; -- título R$6.000, NF 34
  v_despesa_duplicada_id UUID := '87eebc80-add6-4ecd-b91c-34b626da99c9'; -- Despesa R$1.000 criada hoje (anomalia)
BEGIN
  -- Idempotência: se já existe uma correcao_retroativa neste título, sai
  IF EXISTS (SELECT 1 FROM contas_a_pagar_eventos WHERE titulo_id = v_titulo_id AND tipo = 'correcao_retroativa') THEN
    RAISE NOTICE 'Correção do Maycon-CNPJ já aplicada — nada a fazer.';
    RETURN;
  END IF;

  -- Reabre o título pro estado real: R$4.000 de R$6.000, pago_parcial
  UPDATE contas_a_pagar
  SET status = 'pago_parcial', data_baixa = NULL, forma_baixa = NULL,
    observacoes = COALESCE(observacoes || ' | ', '') || 'Reaberto em correção retroativa (12/07/2026) — um dos dois eventos de R$3.000 no histórico era reprocessamento duplicado, não dinheiro real.'
  WHERE id = v_titulo_id;

  -- Estorna numericamente o R$3.000 fantasma (evento append-only,
  -- nunca apaga o original — soma bruta dos eventos passa a refletir
  -- a realidade: 3000 (real) + 3000 (fantasma) - 3000 (estorno) + 1000
  -- (real, ver próximo evento) = 4000)
  INSERT INTO contas_a_pagar_eventos (titulo_id, tipo, descricao, valor_pago)
  VALUES (v_titulo_id, 'correcao_retroativa',
    'Estorno de duplicidade — um dos dois eventos de baixa de R$3.000 no histórico deste título não corresponde a um Pix real (Relatório BB só registra 1 pagamento de R$3.000 pro CNPJ do Maycon). Evento original mantido intacto (histórico apenas-INSERT); este estorno neutraliza numericamente o valor duplicado para as próximas conciliações automáticas somarem corretamente.',
    -3000);

  -- Conta o R$1.000 real de 07/07 (que hoje virou Despesa duplicada
  -- isolada por engano) como baixa parcial real deste título
  INSERT INTO contas_a_pagar_eventos (titulo_id, tipo, descricao, valor_pago)
  VALUES (v_titulo_id, 'baixa_parcial',
    'Baixa parcial de R$1.000,00 (Pix 07/07/2026) recontabilizada em correção retroativa (12/07/2026) — antes lançada por engano como Despesa nova isolada (' || v_despesa_duplicada_id || '), agora corretamente acumulada contra este título.',
    1000);

  -- Cancela (soft-delete) a Despesa duplicada de R$1.000 criada hoje
  UPDATE despesas SET status_pagamento = 'cancelado', deleted_at = now()
  WHERE id = v_despesa_duplicada_id AND deleted_at IS NULL;

  UPDATE despesas_parcelas SET status = 'cancelado', deleted_at = now()
  WHERE despesa_id = v_despesa_duplicada_id AND deleted_at IS NULL;

  UPDATE contas_a_pagar SET status = 'cancelado', deleted_at = now(),
    observacoes = COALESCE(observacoes || ' | ', '') || 'Cancelado em correção retroativa (12/07/2026) — R$1.000 recontabilizado como baixa parcial do título 34 (R$6.000).'
  WHERE despesa_id = v_despesa_duplicada_id AND deleted_at IS NULL;

  RAISE NOTICE 'Correção do Maycon-CNPJ aplicada — título % agora pago_parcial (R$4.000 de R$6.000).', v_titulo_id;
END $$;


-- ============================================================
-- CONFIRMAÇÃO — rodar depois e conferir os números
-- ============================================================
SELECT id, favorecido_nome, favorecido_cnpj_cpf, valor, status, data_baixa
FROM contas_a_pagar
WHERE favorecido_cnpj_cpf IN ('080.817.879-25', '44.739.377/0001-32')
  AND deleted_at IS NULL
ORDER BY favorecido_cnpj_cpf, data_baixa;
