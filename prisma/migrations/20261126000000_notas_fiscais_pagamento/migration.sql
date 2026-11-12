-- Notas fiscais dos videomakers (Giovani, 12/11/2026): "hoje eu não sei quem
-- enviou a nota fiscal e se foi cadastrada no sistema para pagamento", e "a
-- Débora também recebe a nota por e-mail com os dados e a descrição do trabalho".
--
-- Só colunas novas em tabelas que já têm RLS por empresa (custos_videomaker e
-- config_email): nenhuma política muda, nenhuma tabela nova. E dois acertos de
-- dados, no fim (decisões do Giovani, 12/11/2026).
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

-- 1. "Cadastrada para pagamento" substitui "enviada para compras": o estado
--    aguardando_pagamento passa a significar cadastrada. As notas que já estão
--    nele ganham o quando (o envio a compras, ou a última mudança) e o quem
--    (quem encaminhou, pelo histórico do card; sem registro, fica vazio).
--    Em 12/11/2026 eram 3 em produção: PLN-26-5848 (gravação externa, enviada
--    por e-mail em 09/11) e 2 jobs de maio/junho do fluxo de Aprovações.
UPDATE "custos_videomaker" c
   SET "cadastradoPagamentoEm" = COALESCE(c."emailFinanceiroAt", c."updatedAt"),
       "cadastradoPagamentoPorId" = (
         SELECT h."usuarioId" FROM "historico_status" h
          WHERE h."demandaId" = c."demandaId"
            AND h."statusNovo" = 'nota_videomaker'
            AND h."observacao" LIKE 'Nota enviada para compras%'
            AND h."usuarioId" IS NOT NULL
          ORDER BY h."createdAt" DESC LIMIT 1)
 WHERE c."statusPagamento" = 'aguardando_pagamento'
   AND c."cadastradoPagamentoEm" IS NULL;

-- 2. O e-mail das notas da Contourline: a Débora. Só se a empresa existe e o
--    campo ainda está vazio (não sobrescreve o que alguém já pôs na tela).
--    Em qualquer outro banco (teste, prévia) não acha a empresa e não faz nada.
UPDATE "config_email"
   SET "emailsNotasFiscais" = ARRAY['debora.soares@contourline.com.br']::TEXT[]
 WHERE "organizacaoId" = (SELECT "id" FROM "organizacoes" WHERE "slug" = 'contourline')
   AND cardinality("emailsNotasFiscais") = 0;
