-- Cobrança diária a quem pediu (25/11/2026): quem pediu a demanda é cobrado
-- uma vez por dia pelo WhatsApp até aprovar (coluna Aprovação) ou marcar como
-- postado (coluna Para Postar). Ver src/lib/cobranca-solicitante.ts.
--
-- 1) Cinco colunas em "demandas", todas anuláveis ou com DEFAULT:
--      cobrancasSolicitante      quantas vezes foi cobrado nesta etapa
--      solicitanteCobradoEm      a última cobrança (trava de uma por dia)
--      cobrancaSolicitanteEtapa  a etapa da contagem (mudou de coluna, zera)
--      postagemToken             o link "foi postado" (/postado/<token>)
--      postagemTokenExpiraEm     a validade dele
-- 2) A função org_por_credencial ganha UM ramo, 'postagem': a página pública
--    descobre a empresa pelo token, como /aprovar faz desde 20261004000000. O
--    resto do corpo é idêntico ao daquela migration (CREATE OR REPLACE exige o
--    corpo inteiro; omitir um ramo o apagaria).
--
-- Aditiva: o código no ar não lê as colunas nem passa o tipo novo, então a
-- ordem entre esta migration e o deploy não abre janela. A cobrança nasce
-- desligada (módulo "cobranca" por empresa, src/lib/modulos.ts).
--
-- Volta: scripts/volta/20261130000000_cobranca_solicitante.sql.

ALTER TABLE "demandas" ADD COLUMN "cobrancasSolicitante" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "demandas" ADD COLUMN "solicitanteCobradoEm" TIMESTAMP(3);
ALTER TABLE "demandas" ADD COLUMN "cobrancaSolicitanteEtapa" TEXT;
ALTER TABLE "demandas" ADD COLUMN "postagemToken" TEXT;
ALTER TABLE "demandas" ADD COLUMN "postagemTokenExpiraEm" TIMESTAMP(3);
CREATE UNIQUE INDEX "demandas_postagemToken_key" ON "demandas"("postagemToken");

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

    -- Link "foi postado" da cobrança a quem pediu (/postado/[token]). Novo em
    -- 25/11/2026. Vencido não casa: a rota responde o mesmo 404 de inválido.
    WHEN 'postagem' THEN
      (SELECT d."organizacaoId" FROM demandas d
        WHERE d."postagemToken" = p_valor AND d."postagemTokenExpiraEm" > now())

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
