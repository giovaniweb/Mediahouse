-- VOLTA da migration 20261129000000_videomaker_cidades_atendidas.
--
-- Só rode depois de o código que lê `cidadesAtendidas` sair do ar: o cadastro,
-- a ficha, a lista de videomakers, a busca na rede e a escala no card passam a
-- falhar sem a coluna.
--
-- O que se perde: as cidades atendidas digitadas e as juntadas pelo
-- scripts/juntar-videomakers-duplicados.mjs. A cidade base fica. Para guardar
-- antes:
--   SELECT id, nome, cidade, "cidadesAtendidas" FROM videomakers WHERE cardinality("cidadesAtendidas") > 0;
--
-- Escrita em produção: roda só com o sim do Giovani, numa transação única
-- (`psql -1`). Não mexe em _prisma_migrations.

ALTER TABLE "videomakers" DROP COLUMN IF EXISTS "cidadesAtendidas";
