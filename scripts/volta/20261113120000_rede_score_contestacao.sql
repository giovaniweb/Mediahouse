-- VOLTA da migration 20261113120000_rede_score_contestacao (Onda 2B).
--
-- Só rode depois de o código da Onda 2B sair do ar: o código novo chama
-- score_rede e as funções do profissional, e lê naRede/removidaEm; sem elas,
-- a lista de videomakers, a escala e /minhas-avaliacoes passam a falhar.
--
-- O que se perde: contestações e convites da rede (as tabelas somem), a marca
-- de quem saiu da rede e a de avaliação removida. ATENÇÃO: avaliação removida
-- pela contestação VOLTA a contar na média, porque a coluna que a marcava some.
-- Para guardar antes:
--   SELECT id, "videomakerId", "removidaEm" FROM avaliacoes_videomaker WHERE "removidaEm" IS NOT NULL;
--   SELECT id, "editorId", "removidaEm" FROM avaliacoes_editor WHERE "removidaEm" IS NOT NULL;
--
-- O que NÃO volta (de propósito): os vínculos criados pela seção 6 da migration
-- e o dono dado às avaliações antigas. São dados corretos também no código
-- antigo, e não há como separá-los dos vínculos criados depois pelo uso.
--
-- recalcular_media_videomaker/editor voltam à conta antiga (média de todas as
-- notas, sem recorte de tempo), como na 20260901130000.
--
-- Escrita em produção: roda só com o sim do Giovani, numa transação única
-- (`psql -1`). Não mexe em _prisma_migrations.

DROP FUNCTION IF EXISTS public.responder_convite_rede(TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.convites_rede_do_profissional(TEXT);
DROP FUNCTION IF EXISTS public.definir_participacao_rede(TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.contestar_avaliacao(TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.avaliacoes_do_profissional(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.recalcular_media_videomaker(p_id TEXT)
RETURNS DOUBLE PRECISION
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE videomakers v
     SET avaliacao = COALESCE(
       (SELECT round(avg(a.nota)::numeric, 1) FROM avaliacoes_videomaker a WHERE a."videomakerId" = p_id),
       0
     )
   WHERE v.id = p_id
  RETURNING v.avaliacao
$$;

CREATE OR REPLACE FUNCTION public.recalcular_media_editor(p_id TEXT)
RETURNS DOUBLE PRECISION
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE editores e
     SET avaliacao = COALESCE(
       (SELECT round(avg(a.nota)::numeric, 1) FROM avaliacoes_editor a WHERE a."editorId" = p_id),
       0
     )
   WHERE e.id = p_id
  RETURNING e.avaliacao
$$;

-- Depois das recalcular_media, que dependiam dela.
DROP FUNCTION IF EXISTS public.score_rede(TEXT, TEXT[]);

DROP TABLE IF EXISTS "convites_rede";
DROP TABLE IF EXISTS "contestacoes_avaliacao";

DROP INDEX IF EXISTS "avaliacoes_videomaker_videomakerId_createdAt_idx";
DROP INDEX IF EXISTS "avaliacoes_editor_editorId_createdAt_idx";
ALTER TABLE "avaliacoes_videomaker" DROP COLUMN IF EXISTS "removidaEm";
ALTER TABLE "avaliacoes_editor" DROP COLUMN IF EXISTS "removidaEm";

ALTER TABLE "videomakers"
  DROP COLUMN IF EXISTS "naRede",
  DROP COLUMN IF EXISTS "saiuDaRedeEm";
