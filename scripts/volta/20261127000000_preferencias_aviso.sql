-- VOLTA da migration 20261127000000_preferencias_aviso.
--
-- Apaga as escolhas de aviso por pessoa. Todo mundo volta a receber o que
-- recebia antes da página existir — que é o mesmo que acontece com a tabela
-- vazia. Rode depois de tirar do ar o código que lê a tabela.
--
-- Escrita em produção: roda só com o sim do Giovani, numa transação única
-- (`psql -1`). Não mexe em _prisma_migrations.

DROP TABLE IF EXISTS "preferencias_aviso";
