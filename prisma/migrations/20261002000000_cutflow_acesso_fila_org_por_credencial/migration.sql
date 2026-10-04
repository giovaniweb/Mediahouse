-- Cutflow (plugin do Premiere), 30/09/2026: acesso pelo login do NuFlow e fila.
--
-- Três peças:
--   1. `usarCutflow` em permissoes_usuario — quem pode entrar no plugin. Além
--      disto a empresa precisa do módulo `cutflow` (ModuloOrganizacao).
--   2. cutflow_sessoes — login do plugin sem senha no Premiere (fluxo de
--      dispositivo). O banco guarda só HASHES: o segredo do computador e a
--      sessão entregue ao plugin nunca ficam em texto.
--   3. cutflow_puxadas — trava contra edição dupla: um card da fila é puxado
--      por um computador só (`demandaId` único).
--
-- As duas tabelas nascem sob RLS por empresa, como politicas_ia/consumos_ia.

ALTER TABLE permissoes_usuario ADD COLUMN "usarCutflow" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE cutflow_sessoes (
  id                TEXT PRIMARY KEY,
  "organizacaoId"   TEXT NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "usuarioId"       TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "dispositivoHash" TEXT NOT NULL CHECK ("dispositivoHash" ~ '^[0-9a-f]{64}$'),
  "tokenHash"       TEXT CHECK ("tokenHash" IS NULL OR "tokenHash" ~ '^[0-9a-f]{64}$'),
  "nomeComputador"  VARCHAR(80),
  "entregueEm"      TIMESTAMP(3),
  "ultimoUsoEm"     TIMESTAMP(3),
  "expiraEm"        TIMESTAMP(3) NOT NULL,
  "revogadaEm"      TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Sessão entregue tem hora de entrega; pendente não tem sessão.
  CHECK (("tokenHash" IS NULL) = ("entregueEm" IS NULL))
);
CREATE UNIQUE INDEX "cutflow_sessoes_dispositivoHash_key" ON cutflow_sessoes("dispositivoHash");
CREATE UNIQUE INDEX "cutflow_sessoes_tokenHash_key" ON cutflow_sessoes("tokenHash");
CREATE INDEX "cutflow_sessoes_organizacaoId_idx" ON cutflow_sessoes("organizacaoId");

CREATE TABLE cutflow_puxadas (
  id              TEXT PRIMARY KEY,
  "organizacaoId" TEXT NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "demandaId"     TEXT NOT NULL REFERENCES demandas(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "usuarioId"     TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "sessaoId"      TEXT NOT NULL REFERENCES cutflow_sessoes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "puxadaEm"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "cutflow_puxadas_demandaId_key" ON cutflow_puxadas("demandaId");
CREATE INDEX "cutflow_puxadas_organizacaoId_idx" ON cutflow_puxadas("organizacaoId");

ALTER TABLE cutflow_sessoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cutflow_puxadas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cutflow_sessoes, cutflow_puxadas FROM PUBLIC, app_auth, app_user;
GRANT SELECT, INSERT, UPDATE ON cutflow_sessoes TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON cutflow_puxadas TO app_user;
CREATE POLICY cutflow_sessao_org ON cutflow_sessoes TO app_user
  USING ("organizacaoId" = NULLIF(current_setting('app.org_id', true), ''))
  WITH CHECK ("organizacaoId" = NULLIF(current_setting('app.org_id', true), ''));
CREATE POLICY cutflow_puxada_org ON cutflow_puxadas TO app_user
  USING ("organizacaoId" = NULLIF(current_setting('app.org_id', true), ''))
  WITH CHECK ("organizacaoId" = NULLIF(current_setting('app.org_id', true), ''));

-- org_por_credencial ganha as duas credenciais do plugin. O resto da função é
-- idêntico ao de 20260901120000_org_por_credencial; CREATE OR REPLACE exige o
-- corpo inteiro.
--
--   cutflow_dispositivo  o plugin, esperando a autorização, prova que tem o
--                        segredo do computador. Só casa enquanto a sessão ainda
--                        não foi entregue: depois disso o segredo não vale nada.
--   cutflow_sessao       o plugin já logado. Revogada ou vencida não casa, então
--                        a rota responde como se o token não existisse.
CREATE OR REPLACE FUNCTION public.org_por_credencial(p_tipo TEXT, p_valor TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE p_tipo
    WHEN 'demanda' THEN
      (SELECT d."organizacaoId" FROM demandas d WHERE d.id = p_valor)

    WHEN 'demanda_publica' THEN
      (SELECT d."organizacaoId" FROM demandas d WHERE d."publicToken" = p_valor)

    WHEN 'nota_fiscal' THEN
      (SELECT d."organizacaoId" FROM notas_fiscais n
         JOIN demandas d ON d.id = n."demandaId" WHERE n.token = p_valor)

    WHEN 'convite' THEN
      (SELECT d."organizacaoId" FROM convites_videomaker cv
         JOIN demandas d ON d.id = cv."demandaId" WHERE cv.token = p_valor)

    WHEN 'cobertura' THEN
      (SELECT c."organizacaoId" FROM coberturas c WHERE c.slug = p_valor)

    WHEN 'fornecedor' THEN
      (SELECT f."organizacaoId" FROM fornecedores f WHERE f."portalToken" = p_valor)

    WHEN 'arquivo' THEN
      (SELECT d."organizacaoId" FROM arquivos a
         JOIN demandas d ON d.id = a."demandaId" WHERE a.id = p_valor)

    WHEN 'arquivo_por_url' THEN
      (SELECT d."organizacaoId" FROM arquivos a
         JOIN demandas d ON d.id = a."demandaId"
        WHERE a.url LIKE '%' || p_valor || '%' LIMIT 1)

    WHEN 'cutflow_dispositivo' THEN
      (SELECT s."organizacaoId" FROM cutflow_sessoes s
        WHERE s."dispositivoHash" = p_valor AND s."tokenHash" IS NULL
          AND s."revogadaEm" IS NULL AND s."expiraEm" > now())

    WHEN 'cutflow_sessao' THEN
      (SELECT s."organizacaoId" FROM cutflow_sessoes s
        WHERE s."tokenHash" = p_valor
          AND s."revogadaEm" IS NULL AND s."expiraEm" > now())

    ELSE NULL
  END
$$;

REVOKE ALL ON FUNCTION public.org_por_credencial(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_por_credencial(TEXT, TEXT) TO "app_user";

DO $$
DECLARE cfg TEXT[];
BEGIN
  SELECT proconfig INTO cfg FROM pg_proc WHERE proname = 'org_por_credencial';
  IF cfg IS NULL OR NOT ('search_path=public' = ANY (cfg)) THEN
    RAISE EXCEPTION 'Abortado: org_por_credencial sem search_path fixo.';
  END IF;
END $$;
