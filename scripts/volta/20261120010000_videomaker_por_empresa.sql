-- VOLTA da migration 20261120010000_videomaker_por_empresa.
--
-- Tira os cinco gatilhos, as cinco funções, a tabela executor_espelho e as duas
-- colunas novas. PERDE DADO se o recurso já tiver sido usado: a "Empresa dele"
-- de cada videomaker, a marca de espelho automático (as arestas continuam,
-- viram terceirização manual) e quem da parceira fazia cada card. Antes de
-- rodar com uso real, salvar:
--   SELECT * FROM videomaker_organizacao WHERE "organizacaoExecutoraId" IS NOT NULL;
--   SELECT id, "porVideomakerId" FROM demanda_compartilhamento WHERE "porVideomakerId" IS NOT NULL;
--   SELECT * FROM executor_espelho;
--
-- Escrita em produção: só com o sim do Giovani, numa transação (`psql -1`). Não
-- mexe em _prisma_migrations: refazer depois é rodar o SQL da migration de novo.

DROP TRIGGER IF EXISTS empresa_executora_revoga_espelho ON "videomaker_organizacao";
DROP TRIGGER IF EXISTS demandas_videomaker_revoga_espelho ON "demandas";
DROP TRIGGER IF EXISTS espelho_ao_revogar ON "demanda_compartilhamento";
DROP TRIGGER IF EXISTS executor_espelho_regras ON "executor_espelho";
DROP TRIGGER IF EXISTS videomaker_empresa_executora_regras ON "videomaker_organizacao";

DROP FUNCTION IF EXISTS nuflow_empresa_executora_revoga_espelho();
DROP FUNCTION IF EXISTS nuflow_demandas_videomaker_revoga_espelho();
DROP FUNCTION IF EXISTS nuflow_espelho_ao_revogar();
DROP FUNCTION IF EXISTS nuflow_executor_espelho_regras();
DROP FUNCTION IF EXISTS nuflow_videomaker_empresa_executora_regras();

DROP TABLE IF EXISTS "executor_espelho";

ALTER TABLE "demanda_compartilhamento" DROP CONSTRAINT IF EXISTS "demanda_compartilhamento_porVideomakerId_fkey";
ALTER TABLE "demanda_compartilhamento" DROP COLUMN IF EXISTS "porVideomakerId";

DROP INDEX IF EXISTS "videomaker_organizacao_organizacaoExecutoraId_idx";
ALTER TABLE "videomaker_organizacao" DROP CONSTRAINT IF EXISTS "videomaker_organizacao_organizacaoExecutoraId_fkey";
ALTER TABLE "videomaker_organizacao" DROP COLUMN IF EXISTS "organizacaoExecutoraId";
