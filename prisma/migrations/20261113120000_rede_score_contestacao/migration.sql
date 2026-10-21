-- Rede de profissionais (Onda 2B): score, contestação, sair da rede e convite.
--
-- Segue a Política de Avaliações e os Termos do Profissional (Onda 3):
--   - outras empresas veem só a média das notas e a quantidade de avaliações;
--     nada de comentário, nota a nota ou nome de quem avaliou;
--   - a média é das notas dos últimos 24 meses e aparece a partir de 3 (o "a
--     partir de 3" é da tela; o banco devolve média e quantidade);
--   - nota contestada sai da média enquanto a Plataforma analisa; nota removida
--     sai de vez, e fica guardada;
--   - o profissional pode sair da rede: some da busca, quem já o tem continua;
--   - empresa nova só vê o contato depois que o profissional aceita o convite.
--
-- Aditiva. Vem depois da Onda 3 (20261111120000_aceites_termos, no ar) e da
-- Onda 2A (20261112120000_empresa_nasce_pronta). Nenhuma depende das outras no
-- SQL. Escrita em 21/10 como 20261021180000; renomeada em 12/11 para entrar
-- depois da 2A. Volta em scripts/volta/20261113120000_rede_score_contestacao.sql.
--
-- O que muda nos dados que existem está na seção 6 (vínculos novos e dono para
-- avaliações antigas); as médias guardadas nos perfis (videomakers.avaliacao e
-- editores.avaliacao) NÃO são recalculadas aqui: mudam na próxima avaliação ou
-- contestação de cada profissional. As telas da rede leem score_rede direto.

-- ── 1) Colunas novas ────────────────────────────────────────────────────────
ALTER TABLE "videomakers"
  ADD COLUMN "naRede" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "saiuDaRedeEm" TIMESTAMP(3);

ALTER TABLE "avaliacoes_videomaker" ADD COLUMN "removidaEm" TIMESTAMP(3);
ALTER TABLE "avaliacoes_editor" ADD COLUMN "removidaEm" TIMESTAMP(3);

CREATE INDEX "avaliacoes_videomaker_videomakerId_createdAt_idx" ON "avaliacoes_videomaker"("videomakerId", "createdAt");
CREATE INDEX "avaliacoes_editor_editorId_createdAt_idx" ON "avaliacoes_editor"("editorId", "createdAt");

-- ── 2) Contestação ──────────────────────────────────────────────────────────
--
-- Sem política para app_user, de propósito: quem abre é o profissional, pela
-- função contestar_avaliacao, que confere que a nota é dele; quem decide é a
-- Plataforma, pelo cliente de administração. A aplicação comum não lê nem
-- escreve aqui direto.
CREATE TABLE "contestacoes_avaliacao" (
  "id" TEXT NOT NULL,
  "avaliacaoVideomakerId" TEXT,
  "avaliacaoEditorId" TEXT,
  "motivo" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'em_analise',
  "decisao" TEXT,
  "decididoPorId" TEXT,
  "decididoEm" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contestacoes_avaliacao_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contestacoes_avaliacao_avaliacaoVideomakerId_fkey" FOREIGN KEY ("avaliacaoVideomakerId") REFERENCES "avaliacoes_videomaker"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "contestacoes_avaliacao_avaliacaoEditorId_fkey" FOREIGN KEY ("avaliacaoEditorId") REFERENCES "avaliacoes_editor"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "contestacoes_avaliacao_alvo_check" CHECK (("avaliacaoVideomakerId" IS NULL) <> ("avaliacaoEditorId" IS NULL)),
  CONSTRAINT "contestacoes_avaliacao_status_check" CHECK ("status" IN ('em_analise', 'mantida', 'removida')),
  CONSTRAINT "contestacoes_avaliacao_motivo_check" CHECK (length(btrim("motivo")) BETWEEN 10 AND 2000)
);
CREATE INDEX "contestacoes_avaliacao_avaliacaoVideomakerId_idx" ON "contestacoes_avaliacao"("avaliacaoVideomakerId");
CREATE INDEX "contestacoes_avaliacao_avaliacaoEditorId_idx" ON "contestacoes_avaliacao"("avaliacaoEditorId");
CREATE INDEX "contestacoes_avaliacao_status_createdAt_idx" ON "contestacoes_avaliacao"("status", "createdAt");

ALTER TABLE "contestacoes_avaliacao" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contestacoes_avaliacao" FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    REVOKE ALL ON "contestacoes_avaliacao" FROM "app_user";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_auth') THEN
    REVOKE ALL ON "contestacoes_avaliacao" FROM "app_auth";
  END IF;
END $$;
REVOKE ALL ON "contestacoes_avaliacao" FROM PUBLIC;

-- ── 3) Convite da rede ──────────────────────────────────────────────────────
--
-- É da empresa que convida: ela vê e cancela só os dela. O profissional lê e
-- responde pelas funções da seção 5, porque os convites dele vêm de várias.
CREATE TABLE "convites_rede" (
  "id" TEXT NOT NULL,
  "organizacaoId" TEXT NOT NULL,
  "videomakerId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pendente',
  "convidadoPorId" TEXT,
  "mensagem" TEXT,
  "respondidoEm" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "convites_rede_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "convites_rede_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "convites_rede_videomakerId_fkey" FOREIGN KEY ("videomakerId") REFERENCES "videomakers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "convites_rede_status_check" CHECK ("status" IN ('pendente', 'aceito', 'recusado', 'cancelado')),
  CONSTRAINT "convites_rede_mensagem_check" CHECK ("mensagem" IS NULL OR length("mensagem") <= 500)
);
CREATE INDEX "convites_rede_organizacaoId_status_idx" ON "convites_rede"("organizacaoId", "status");
CREATE INDEX "convites_rede_videomakerId_status_idx" ON "convites_rede"("videomakerId", "status");
-- Um convite em aberto por empresa e profissional: clicar duas vezes não manda dois.
CREATE UNIQUE INDEX "convites_rede_pendente_unico" ON "convites_rede"("organizacaoId", "videomakerId") WHERE "status" = 'pendente';

ALTER TABLE "convites_rede" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    REVOKE ALL ON "convites_rede" FROM "app_user";
    GRANT SELECT, INSERT, UPDATE ON "convites_rede" TO "app_user";
    EXECUTE $p$CREATE POLICY "convites_rede_por_org" ON "convites_rede" TO "app_user"
      USING ("organizacaoId" = current_setting('app.org_id', true))
      WITH CHECK ("organizacaoId" = current_setting('app.org_id', true))$p$;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_auth') THEN
    REVOKE ALL ON "convites_rede" FROM "app_auth";
  END IF;
END $$;
REVOKE ALL ON "convites_rede" FROM PUBLIC;

-- ── 4) A média da rede, numa regra só ───────────────────────────────────────
--
-- Entra na média: nota dos últimos 24 meses, não removida e sem contestação em
-- análise. As funções devolvem só número (média e quantidade): nada de
-- comentário, de nota a nota ou de empresa. Por isso podem atravessar o RLS.
CREATE OR REPLACE FUNCTION public.score_rede(p_tipo TEXT, p_ids TEXT[])
RETURNS TABLE (id TEXT, media DOUBLE PRECISION, avaliacoes INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a."videomakerId", round(avg(a.nota)::numeric, 1)::double precision, count(*)::integer
    FROM avaliacoes_videomaker a
   WHERE p_tipo = 'videomaker'
     AND a."videomakerId" = ANY (p_ids)
     AND a."removidaEm" IS NULL
     AND a."createdAt" >= now() - interval '24 months'
     AND NOT EXISTS (SELECT 1 FROM contestacoes_avaliacao c
                      WHERE c."avaliacaoVideomakerId" = a.id AND c.status = 'em_analise')
   GROUP BY a."videomakerId"
  UNION ALL
  SELECT a."editorId", round(avg(a.nota)::numeric, 1)::double precision, count(*)::integer
    FROM avaliacoes_editor a
   WHERE p_tipo = 'editor'
     AND a."editorId" = ANY (p_ids)
     AND a."removidaEm" IS NULL
     AND a."createdAt" >= now() - interval '24 months'
     AND NOT EXISTS (SELECT 1 FROM contestacoes_avaliacao c
                      WHERE c."avaliacaoEditorId" = a.id AND c.status = 'em_analise')
   GROUP BY a."editorId"
$$;

-- O número guardado no perfil segue a mesma regra, para nenhuma tela antiga
-- mostrar uma média que a rede já não usa.
CREATE OR REPLACE FUNCTION public.recalcular_media_videomaker(p_id TEXT)
RETURNS DOUBLE PRECISION
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE videomakers v
     SET avaliacao = COALESCE((SELECT s.media FROM public.score_rede('videomaker', ARRAY[p_id]) s), 0)
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
     SET avaliacao = COALESCE((SELECT s.media FROM public.score_rede('editor', ARRAY[p_id]) s), 0)
   WHERE e.id = p_id
  RETURNING e.avaliacao
$$;

-- ── 5) O que o profissional faz por conta própria ───────────────────────────
--
-- Ele atravessa empresas (as avaliações e os convites dele vêm de várias), e o
-- RLS só conhece uma empresa por vez. Cada função recebe o id do profissional,
-- que a rota tira da SESSÃO (Videomaker/Editor ligado ao usuário logado), e
-- confere que o alvo é dele.

-- As avaliações dele, com o comentário e o nome da empresa: a Política diz que o
-- comentário fica com a empresa que contratou e com o profissional avaliado.
CREATE OR REPLACE FUNCTION public.avaliacoes_do_profissional(p_tipo TEXT, p_id TEXT)
RETURNS TABLE (
  id TEXT, nota INTEGER, comentario TEXT, "createdAt" TIMESTAMP(3), empresa TEXT,
  "removidaEm" TIMESTAMP(3), "contestacaoStatus" TEXT, "contestacaoDecisao" TEXT,
  contestacoes INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.nota, a.comentario, a."createdAt",
         COALESCE(o.nome, od.nome),
         a."removidaEm",
         ult.status, ult.decisao,
         (SELECT count(*)::integer FROM contestacoes_avaliacao c WHERE c."avaliacaoVideomakerId" = a.id)
    FROM avaliacoes_videomaker a
    LEFT JOIN organizacoes o ON o.id = a."organizacaoId"
    LEFT JOIN demandas d ON d.id = a."demandaId"
    LEFT JOIN organizacoes od ON od.id = d."organizacaoId"
    LEFT JOIN LATERAL (SELECT c.status, c.decisao FROM contestacoes_avaliacao c
                        WHERE c."avaliacaoVideomakerId" = a.id
                        ORDER BY c."createdAt" DESC LIMIT 1) ult ON true
   WHERE p_tipo = 'videomaker' AND a."videomakerId" = p_id
  UNION ALL
  SELECT a.id, a.nota, a.comentario, a."createdAt",
         COALESCE(o.nome, od.nome),
         a."removidaEm",
         ult.status, ult.decisao,
         (SELECT count(*)::integer FROM contestacoes_avaliacao c WHERE c."avaliacaoEditorId" = a.id)
    FROM avaliacoes_editor a
    LEFT JOIN organizacoes o ON o.id = a."organizacaoId"
    LEFT JOIN demandas d ON d.id = a."demandaId"
    LEFT JOIN organizacoes od ON od.id = d."organizacaoId"
    LEFT JOIN LATERAL (SELECT c.status, c.decisao FROM contestacoes_avaliacao c
                        WHERE c."avaliacaoEditorId" = a.id
                        ORDER BY c."createdAt" DESC LIMIT 1) ult ON true
   WHERE p_tipo = 'editor' AND a."editorId" = p_id
   ORDER BY 4 DESC
$$;

-- Abre a contestação. Recusa: nota de outro profissional, nota já removida,
-- contestação já em análise, ou já houve as duas análises que a Política prevê.
CREATE OR REPLACE FUNCTION public.contestar_avaliacao(p_tipo TEXT, p_avaliacao_id TEXT, p_profissional_id TEXT, p_motivo TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_removida TIMESTAMP(3);
  v_dono TEXT;
  v_aberta BOOLEAN;
  v_total INTEGER;
  v_id TEXT := gen_random_uuid()::text;
BEGIN
  IF p_tipo = 'videomaker' THEN
    SELECT a."videomakerId", a."removidaEm" INTO v_dono, v_removida FROM avaliacoes_videomaker a WHERE a.id = p_avaliacao_id;
    SELECT bool_or(c.status = 'em_analise'), count(*) INTO v_aberta, v_total FROM contestacoes_avaliacao c WHERE c."avaliacaoVideomakerId" = p_avaliacao_id;
  ELSIF p_tipo = 'editor' THEN
    SELECT a."editorId", a."removidaEm" INTO v_dono, v_removida FROM avaliacoes_editor a WHERE a.id = p_avaliacao_id;
    SELECT bool_or(c.status = 'em_analise'), count(*) INTO v_aberta, v_total FROM contestacoes_avaliacao c WHERE c."avaliacaoEditorId" = p_avaliacao_id;
  ELSE
    RAISE EXCEPTION 'contestacao:tipo';
  END IF;

  IF v_dono IS NULL OR v_dono <> p_profissional_id THEN RAISE EXCEPTION 'contestacao:nao_encontrada'; END IF;
  IF v_removida IS NOT NULL THEN RAISE EXCEPTION 'contestacao:removida'; END IF;
  IF COALESCE(v_aberta, false) THEN RAISE EXCEPTION 'contestacao:em_analise'; END IF;
  IF v_total >= 2 THEN RAISE EXCEPTION 'contestacao:limite'; END IF;

  INSERT INTO contestacoes_avaliacao (id, "avaliacaoVideomakerId", "avaliacaoEditorId", motivo)
  VALUES (v_id,
          CASE WHEN p_tipo = 'videomaker' THEN p_avaliacao_id END,
          CASE WHEN p_tipo = 'editor' THEN p_avaliacao_id END,
          btrim(p_motivo));

  IF p_tipo = 'videomaker' THEN
    PERFORM public.recalcular_media_videomaker(p_profissional_id);
  ELSE
    PERFORM public.recalcular_media_editor(p_profissional_id);
  END IF;
  RETURN v_id;
END $$;

-- Sair da rede (ou voltar). Escreve só as duas colunas da participação.
CREATE OR REPLACE FUNCTION public.definir_participacao_rede(p_videomaker_id TEXT, p_na_rede BOOLEAN)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE videomakers
     SET "naRede" = p_na_rede,
         "saiuDaRedeEm" = CASE WHEN p_na_rede THEN NULL ELSE now() END
   WHERE id = p_videomaker_id
  RETURNING "naRede"
$$;

-- Os convites em aberto, com o nome da empresa que convida.
CREATE OR REPLACE FUNCTION public.convites_rede_do_profissional(p_videomaker_id TEXT)
RETURNS TABLE (id TEXT, empresa TEXT, mensagem TEXT, "createdAt" TIMESTAMP(3))
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, o.nome, c.mensagem, c."createdAt"
    FROM convites_rede c JOIN organizacoes o ON o.id = c."organizacaoId"
   WHERE c."videomakerId" = p_videomaker_id AND c.status = 'pendente'
   ORDER BY c."createdAt" DESC
$$;

-- Aceitar cria o vínculo com a empresa (é ele que libera o contato); recusar só
-- fecha o convite. Devolve o status final, ou NULL se o convite não é dele ou
-- já foi respondido.
CREATE OR REPLACE FUNCTION public.responder_convite_rede(p_convite_id TEXT, p_videomaker_id TEXT, p_aceitar BOOLEAN)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org TEXT;
  v_status TEXT := CASE WHEN p_aceitar THEN 'aceito' ELSE 'recusado' END;
BEGIN
  UPDATE convites_rede
     SET status = v_status, "respondidoEm" = now(), "updatedAt" = now()
   WHERE id = p_convite_id AND "videomakerId" = p_videomaker_id AND status = 'pendente'
  RETURNING "organizacaoId" INTO v_org;
  IF v_org IS NULL THEN RETURN NULL; END IF;

  IF p_aceitar THEN
    INSERT INTO videomaker_organizacao (id, "organizacaoId", "videomakerId", status, "updatedAt")
    VALUES (gen_random_uuid()::text, v_org, p_videomaker_id, 'ativo', now())
    ON CONFLICT ("organizacaoId", "videomakerId") DO NOTHING;
  END IF;
  RETURN v_status;
END $$;

DO $$
DECLARE f TEXT; cfg TEXT[];
BEGIN
  FOREACH f IN ARRAY ARRAY['score_rede', 'recalcular_media_videomaker', 'recalcular_media_editor',
                           'avaliacoes_do_profissional', 'contestar_avaliacao', 'definir_participacao_rede',
                           'convites_rede_do_profissional', 'responder_convite_rede'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I FROM PUBLIC', f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I TO "app_user"', f);
    END IF;
    -- Mesma trava das outras SECURITY DEFINER: sem search_path fixo, um schema
    -- plantado na frente sequestraria a função.
    SELECT proconfig INTO cfg FROM pg_proc WHERE proname = f AND pronamespace = 'public'::regnamespace;
    IF cfg IS NULL OR NOT ('search_path=public' = ANY (cfg)) THEN
      RAISE EXCEPTION 'Abortado: % sem search_path fixo.', f;
    END IF;
  END LOOP;
END $$;

-- A API do Supabase (anon, authenticated, service_role) fica fora, como na
-- 20261005140000: o privilégio padrão já nasce fechado, isto é só a garantia.
DO $$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON "contestacoes_avaliacao", "convites_rede" FROM %I', r);
      EXECUTE format('REVOKE ALL ON FUNCTION public.score_rede, public.avaliacoes_do_profissional, public.contestar_avaliacao, public.definir_participacao_rede, public.convites_rede_do_profissional, public.responder_convite_rede FROM %I', r);
    END IF;
  END LOOP;
END $$;

-- ── 6) Dados que já existem ─────────────────────────────────────────────────
--
-- a) Avaliação antiga por QR nasceu sem empresa, e o comentário dela aparecia
--    para TODAS as empresas. Pela Política, comentário é de quem contratou.
--    Quando o profissional tem vínculo com uma empresa só, é ela; o resto fica
--    sem dono, e o comentário passa a aparecer só para o profissional (a nota
--    continua na média). As avaliações por convite (com demandaId) não mudam:
--    a empresa delas é a do serviço, e a aplicação resolve por ali.
UPDATE avaliacoes_videomaker a
   SET "organizacaoId" = v.org
  FROM (SELECT "videomakerId", min("organizacaoId") AS org
          FROM videomaker_organizacao GROUP BY "videomakerId" HAVING count(*) = 1) v
 WHERE a."organizacaoId" IS NULL AND a."demandaId" IS NULL AND a."videomakerId" = v."videomakerId";

UPDATE avaliacoes_editor a
   SET "organizacaoId" = v.org
  FROM (SELECT "editorId", min("organizacaoId") AS org
          FROM editor_organizacao GROUP BY "editorId" HAVING count(*) = 1) v
 WHERE a."organizacaoId" IS NULL AND a."demandaId" IS NULL AND a."editorId" = v."editorId";

-- b) A lista da empresa e a escala passam a mostrar só quem tem vínculo com ela.
--    Quem trabalhou com a empresa (demanda ou custo) e ainda não tinha a linha
--    de vínculo ganha agora, para ninguém sumir da escala de quem já o usa.
INSERT INTO videomaker_organizacao (id, "organizacaoId", "videomakerId", status, "updatedAt")
SELECT gen_random_uuid()::text, x.org, x.vm, 'ativo', now()
  FROM (SELECT DISTINCT "organizacaoId" AS org, "videomakerId" AS vm FROM demandas
         WHERE "videomakerId" IS NOT NULL AND "organizacaoId" IS NOT NULL
        UNION
        SELECT DISTINCT "organizacaoId", "videomakerId" FROM custos_videomaker
         WHERE "videomakerId" IS NOT NULL AND "organizacaoId" IS NOT NULL) x
ON CONFLICT ("organizacaoId", "videomakerId") DO NOTHING;

-- c) Perfil sem vínculo nenhum é do tempo em que só existia a Contourline: a
--    rede era a equipe dela. Fica na lista dela, como estava.
INSERT INTO videomaker_organizacao (id, "organizacaoId", "videomakerId", status, "updatedAt")
SELECT gen_random_uuid()::text, o.id, v.id, 'ativo', now()
  FROM videomakers v
  JOIN organizacoes o ON o.slug = 'contourline'
 WHERE NOT EXISTS (SELECT 1 FROM videomaker_organizacao x WHERE x."videomakerId" = v.id)
ON CONFLICT ("organizacaoId", "videomakerId") DO NOTHING;
