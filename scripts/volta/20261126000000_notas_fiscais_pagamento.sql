-- VOLTA da migration 20261126000000_notas_fiscais_pagamento.
--
-- Tira o e-mail de notas por empresa (com o da Débora que a migration pôs) e
-- as marcas de "cadastrada para pagamento" e "quem marcou paga". O estado do
-- pagamento (statusPagamento, pago, dataPagamento) não muda: só se perde QUEM
-- marcou e QUANDO foi cadastrada. Com o código antigo de volta,
-- aguardando_pagamento volta a se chamar "enviada para compras".
-- Volte o código antes (ele lê estas colunas).
--
-- Escrita em produção: roda só com o sim do Giovani, numa transação única
-- (`psql -1`). Não mexe em _prisma_migrations.

ALTER TABLE "custos_videomaker" DROP CONSTRAINT IF EXISTS "custos_videomaker_pagoPorId_fkey";
ALTER TABLE "custos_videomaker" DROP CONSTRAINT IF EXISTS "custos_videomaker_cadastradoPagamentoPorId_fkey";
ALTER TABLE "custos_videomaker" DROP COLUMN IF EXISTS "pagoPorId";
ALTER TABLE "custos_videomaker" DROP COLUMN IF EXISTS "cadastradoPagamentoPorId";
ALTER TABLE "custos_videomaker" DROP COLUMN IF EXISTS "cadastradoPagamentoEm";
ALTER TABLE "config_email" DROP COLUMN IF EXISTS "emailsNotasFiscais";
