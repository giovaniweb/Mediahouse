-- O link de aprovação de vídeo passa a ser uma credencial reconhecida.
--
-- `/aprovar/[token]` é a página que o cliente abre pelo WhatsApp para aprovar o
-- corte. A rota lê `aprovacoes_video` pelo token, e sob RLS essa leitura já
-- exige a empresa declarada: sem ela, o banco devolve vazio e o cliente recebe
-- "Link de aprovação não encontrado". O ensaio de 04/10/2026 (dump de 07/09 com
-- `app_user`) mostrou exatamente isso: 200 com a conexão de dono, 404 com RLS.
--
-- A saída é a mesma das outras rotas públicas (20260901120000): a função
-- devolve só o id da empresa dona do token. O resto da função é idêntico ao de
-- 20261002000000_cutflow_acesso_fila_org_por_credencial — CREATE OR REPLACE
-- exige o corpo inteiro, e omitir um ramo o apagaria. Esta migration acrescenta
-- UM ramo, `aprovacao_video`.
--
-- Aditiva: o código que está no ar não passa esse tipo, então o deploy pode vir
-- depois sem janela nenhuma.
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
