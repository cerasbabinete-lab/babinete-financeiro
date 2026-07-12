-- ============================================================
-- FIX — Seed do roster de beneficiários (CPF ausente)
-- Projeto: Ceras Babinete — Gestão Financeira
-- Contexto: as 4 linhas de sócios/prestador MEI (Darci, Fábio,
-- Sheli, Maycon-CPF) nunca tiveram a coluna `cpf` preenchida desde
-- que foram criadas no build do módulo Despesas. O seed original de
-- Contas a Pagar filtrava por `WHERE cpf = '...'`, que por isso
-- nunca bateu em nenhuma linha — regra_conciliacao_pagar ficou NULL
-- silenciosamente nas 4, mesmo depois da migration idempotente
-- rodar (idempotente evita duplicar, mas não corrige um WHERE que
-- não bate em nada).
--
-- Esta versão trava por `id` (confirmado via SELECT nesta sessão),
-- não por `cpf` — elimina de vez a fragilidade do critério anterior.
-- Idempotente: pode rodar de novo sem problema, só re-seta os mesmos
-- valores.
-- ============================================================

UPDATE beneficiarios_pessoais SET
  cpf = '080.817.879-25',
  regra_conciliacao_pagar = 'holerite_com_abatimento',
  despesa_gerada_categoria = 'contabilidade',
  despesa_gerada_subtipo = 'folha_pro_labore'
WHERE id = 'e21efc65-43c2-47f8-a421-b31ead37f18d';  -- Sheli de Almeida Aquotti

UPDATE beneficiarios_pessoais SET
  cpf = '130.716.068-93',
  regra_conciliacao_pagar = 'despesa_automatica_baixada',
  despesa_gerada_categoria = 'contabilidade',
  despesa_gerada_subtipo = 'retirada_socio'
WHERE id = '9fd17ece-c894-40b0-b6d5-b1cafef33fb0';  -- Darci de Almeida Aquotti

UPDATE beneficiarios_pessoais SET
  cpf = '051.750.059-01',
  regra_conciliacao_pagar = 'despesa_automatica_baixada',
  despesa_gerada_categoria = 'contabilidade',
  despesa_gerada_subtipo = 'retirada_socio'
WHERE id = '65497974-1198-448b-82f4-439849102330';  -- Fábio de Almeida Aquotti

UPDATE beneficiarios_pessoais SET
  cpf = '985.286.969-87',
  regra_conciliacao_pagar = 'despesa_automatica_baixada',
  despesa_gerada_categoria = 'contabilidade',
  despesa_gerada_subtipo = 'bonus_anual'
WHERE id = 'f2edc092-6bf4-4b3b-8555-8784681ff135';  -- Maycon Luiz Malaquias (CPF)

-- Confirmação — deve retornar as 5 linhas (4 corrigidas + Maycon-CNPJ
-- que já estava correta), todas com regra_conciliacao_pagar preenchida
SELECT id, nome, cpf, cnpj, regra_conciliacao_pagar, despesa_gerada_categoria, despesa_gerada_subtipo
FROM beneficiarios_pessoais
WHERE regra_conciliacao_pagar IS NOT NULL
ORDER BY nome;
