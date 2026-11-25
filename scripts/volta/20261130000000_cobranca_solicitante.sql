-- VOLTA da migration 20261130000000_cobranca_solicitante.
--
-- Só rode depois de o código da cobrança a quem pediu sair do ar: a rotina
-- "cobranca", a ficha do card e a página /postado passam a falhar sem as
-- colunas.
--
-- O que se perde: a contagem das cobranças e os links "foi postado" ainda não
-- usados (quem tiver um recebe "link não encontrado"). Para guardar antes:
--   SELECT id, codigo, "cobrancasSolicitante", "solicitanteCobradoEm", "cobrancaSolicitanteEtapa"
--     FROM demandas WHERE "cobrancasSolicitante" > 0;
--
-- A função org_por_credencial volta ao corpo da 20261004000000 (sem o ramo
-- 'postagem').
--
-- Escrita em produção: roda só com o sim do Giovani, numa transação única
-- (`psql -1`). Não mexe em _prisma_migrations.

CREATE OR REPLACE FUNCTION public.org_por_credencial(p_tipo TEXT, p_valor TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE p_tipo
    -- Demanda por id: o token assinado de anexo já provou a posse antes de
    -- chegar aqui (ver src/lib/anexo-token.ts).
    WHEN 'demanda' THEN
      (SELECT d."organizacaoId" FROM demandas d WHERE d.id = p_valor)

    -- Acompanhamento público da demanda, token opt-in.
    WHEN 'demanda_publica' THEN
      (SELECT d."organizacaoId" FROM demandas d WHERE d."publicToken" = p_valor)

    -- Upload de nota fiscal pelo videomaker.
    WHEN 'nota_fiscal' THEN
      (SELECT d."organizacaoId" FROM notas_fiscais n
         JOIN demandas d ON d.id = n."demandaId" WHERE n.token = p_valor)

    -- Convite de videomaker para uma demanda.
    WHEN 'convite' THEN
      (SELECT d."organizacaoId" FROM convites_videomaker cv
         JOIN demandas d ON d.id = cv."demandaId" WHERE cv.token = p_valor)

    -- Galeria pública do evento: a credencial é o slug.
    WHEN 'cobertura' THEN
      (SELECT c."organizacaoId" FROM coberturas c WHERE c.slug = p_valor)

    -- Portal do fornecedor.
    WHEN 'fornecedor' THEN
      (SELECT f."organizacaoId" FROM fornecedores f WHERE f."portalToken" = p_valor)

    -- Arquivo por id — o worker de transcodificação, autenticado por segredo.
    WHEN 'arquivo' THEN
      (SELECT d."organizacaoId" FROM arquivos a
         JOIN demandas d ON d.id = a."demandaId" WHERE a.id = p_valor)

    -- Thumbnail do Drive: a credencial é o id do arquivo no Drive, que está
    -- dentro da URL guardada.
    WHEN 'arquivo_por_url' THEN
      (SELECT d."organizacaoId" FROM arquivos a
         JOIN demandas d ON d.id = a."demandaId"
        WHERE a.url LIKE '%' || p_valor || '%' LIMIT 1)

    -- Cutflow: o plugin esperando a autorização (só antes da entrega) e o
    -- plugin já logado (revogada ou vencida não casa). Ver 20261002000000.
    WHEN 'cutflow_dispositivo' THEN
      (SELECT s."organizacaoId" FROM cutflow_sessoes s
        WHERE s."dispositivoHash" = p_valor AND s."tokenHash" IS NULL
          AND s."revogadaEm" IS NULL AND s."expiraEm" > now())

    WHEN 'cutflow_sessao' THEN
      (SELECT s."organizacaoId" FROM cutflow_sessoes s
        WHERE s."tokenHash" = p_valor
          AND s."revogadaEm" IS NULL AND s."expiraEm" > now())

    -- Aprovação de vídeo pelo cliente (/aprovar/[token]). Novo em 04/10/2026.
    WHEN 'aprovacao_video' THEN
      (SELECT d."organizacaoId" FROM aprovacoes_video av
         JOIN demandas d ON d.id = av."demandaId" WHERE av.token = p_valor)

    ELSE NULL
  END
$$;

-- CREATE OR REPLACE preserva o dono e os GRANTs, mas repetir custa nada e
-- deixa a migration correta sozinha num banco onde alguém os tenha mexido.
REVOKE ALL ON FUNCTION public.org_por_credencial(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_por_credencial(TEXT, TEXT) TO "app_user";

-- Trava: mesma da 20260901120000 — sem search_path fixo a função SECURITY
-- DEFINER pode ser sequestrada, e o erro é silencioso.
DO $$
DECLARE cfg TEXT[];
BEGIN
  SELECT proconfig INTO cfg FROM pg_proc WHERE proname = 'org_por_credencial';
  IF cfg IS NULL OR NOT ('search_path=public' = ANY (cfg)) THEN
    RAISE EXCEPTION 'Abortado: org_por_credencial sem search_path fixo.';
  END IF;
END $$;

DROP INDEX IF EXISTS "demandas_postagemToken_key";
ALTER TABLE "demandas" DROP COLUMN IF EXISTS "postagemTokenExpiraEm";
ALTER TABLE "demandas" DROP COLUMN IF EXISTS "postagemToken";
ALTER TABLE "demandas" DROP COLUMN IF EXISTS "cobrancaSolicitanteEtapa";
ALTER TABLE "demandas" DROP COLUMN IF EXISTS "solicitanteCobradoEm";
ALTER TABLE "demandas" DROP COLUMN IF EXISTS "cobrancasSolicitante";
