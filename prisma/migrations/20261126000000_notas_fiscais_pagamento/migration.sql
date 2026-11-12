-- Notas fiscais dos videomakers (Giovani, 12/11/2026): "hoje eu não sei quem
-- enviou a nota fiscal e se foi cadastrada no sistema para pagamento", e "a
-- Débora também recebe a nota por e-mail com os dados e a descrição do trabalho".
--
-- Aditiva, só colunas novas em tabelas que já têm RLS por empresa
-- (custos_videomaker e config_email): nenhuma política muda, nenhuma tabela nova.
--   config_email.emailsNotasFiscais      quem recebe cada nota por e-mail (por empresa)
--   custos_videomaker.cadastradoPagamento* a nota foi cadastrada para pagamento: quando e quem
--   custos_videomaker.pagoPorId          quem marcou como paga (o quando já é dataPagamento)
--
-- O código no ar ignora as colunas: a migration pode subir antes do deploy sem
-- abrir janela. Sem ela, o código novo quebra (lê as colunas) — sobe ANTES do merge.
--
-- Volta: scripts/volta/20261126000000_notas_fiscais_pagamento.sql

ALTER TABLE "config_email" ADD COLUMN "emailsNotasFiscais" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "custos_videomaker" ADD COLUMN "cadastradoPagamentoEm" TIMESTAMP(3);
ALTER TABLE "custos_videomaker" ADD COLUMN "cadastradoPagamentoPorId" TEXT;
ALTER TABLE "custos_videomaker" ADD COLUMN "pagoPorId" TEXT;

ALTER TABLE "custos_videomaker" ADD CONSTRAINT "custos_videomaker_cadastradoPagamentoPorId_fkey"
  FOREIGN KEY ("cadastradoPagamentoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "custos_videomaker" ADD CONSTRAINT "custos_videomaker_pagoPorId_fkey"
  FOREIGN KEY ("pagoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
