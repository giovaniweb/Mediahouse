-- VOLTA da migration 20261112120000_empresa_nasce_pronta (Onda 2A).
--
-- Só rode depois de o código da Onda 2A sair do ar: o código novo numera as
-- demandas pelo contador da empresa e lê prefixoCodigo; sem as colunas, criar
-- demanda passa a falhar.
--
-- ATENÇÃO ao índice: a volta recria a unicidade do código na plataforma
-- inteira. Se, com a 2A no ar, duas empresas tiverem gerado o mesmo código
-- (ex.: as duas com prefixo VOP), o CREATE UNIQUE INDEX falha e a transação
-- inteira volta sem mudar nada. Confira antes:
--   SELECT codigo, count(*) FROM demandas GROUP BY 1 HAVING count(*) > 1;
--
-- Os contadores (contadores_codigo) somem; os códigos já gravados nas demandas
-- ficam como estão. O prefixo (VOP para todas, GH para a gh-producao) some com
-- a coluna: não há UPDATE a desfazer à parte. Os códigos GH-... que a GH
-- Produção tiver criado continuam nas demandas dela; o código antigo volta a
-- sortear VOP-AA-#### para todas as empresas, inclusive a GH.
--
-- Escrita em produção: roda só com o sim do Giovani, numa transação única
-- (`psql -1`). Não mexe em _prisma_migrations.

DROP FUNCTION IF EXISTS public.org_do_job_midia(TEXT);
DROP FUNCTION IF EXISTS public.empresas_com_midia_pendente(INTEGER);

CREATE UNIQUE INDEX "demandas_codigo_key" ON "demandas"("codigo");
DROP INDEX IF EXISTS "demandas_organizacaoId_codigo_key";

DROP POLICY IF EXISTS "contadores_codigo_org" ON "contadores_codigo";
DROP TABLE IF EXISTS "contadores_codigo";

ALTER TABLE "organizacoes"
  DROP CONSTRAINT IF EXISTS "organizacoes_prefixoCodigo_check",
  DROP COLUMN IF EXISTS "prefixoCodigo",
  DROP COLUMN IF EXISTS "primeirosPassosDispensadosEm",
  DROP COLUMN IF EXISTS "linkPaginaCopiadoEm";
