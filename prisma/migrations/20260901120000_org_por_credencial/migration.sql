-- Descobrir a empresa a partir de um token público, sem abrir a tabela.
--
-- Rota pública por token tem um problema de ordem igual ao do login: ela precisa
-- LER o registro para saber de qual empresa ele é, e sob RLS ler o registro já
-- exigiria saber a empresa. Sem uma saída, `/aprovar`, `/e/[slug]`, `/nf-upload`
-- e `/d` respondem vazio para todo mundo.
--
-- Três caminhos foram considerados:
--
--   a) dar SELECT dessas tabelas ao role de resolução — abre a tabela inteira
--      para conseguir um único campo;
--   b) uma política que compara o token com uma variável de sessão — funciona,
--      mas espalha a credencial por várias políticas e some do olho;
--   c) esta: uma função SECURITY DEFINER que recebe a credencial e devolve
--      SÓ o id da empresa.
--
-- (c) é a mais estreita. Quem tem o token descobre a empresa dele e nada mais:
-- nem título, nem valor, nem a existência de outros registros. E toda a lógica
-- de "qual credencial dá acesso a quê" fica visível num lugar só, em vez de
-- distribuída por dez rotas.
--
-- `search_path` fixo é obrigatório em SECURITY DEFINER: sem ele, quem chama pode
-- criar um schema com uma tabela `demandas` falsa na frente e sequestrar a
-- função. Com ele, os nomes resolvem sempre em `public`.
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

    ELSE NULL
  END
$$;

-- Ninguém por padrão; só o role da aplicação. `PUBLIC` inclui todo role futuro,
-- e uma função SECURITY DEFINER aberta para todos é uma porta que ninguém lembra
-- que existe.
REVOKE ALL ON FUNCTION public.org_por_credencial(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_por_credencial(TEXT, TEXT) TO "app_user";

-- Trava: a função tem que estar amarrada ao search_path. Sem isso ela é um
-- vetor de sequestro, e o erro é silencioso.
DO $$
DECLARE cfg TEXT[];
BEGIN
  SELECT proconfig INTO cfg FROM pg_proc WHERE proname = 'org_por_credencial';
  IF cfg IS NULL OR NOT ('search_path=public' = ANY (cfg)) THEN
    RAISE EXCEPTION 'Abortado: org_por_credencial sem search_path fixo.';
  END IF;
END $$;
