
ALTER TABLE config_whatsapp ADD COLUMN "connectionEventoEm" TIMESTAMP(3);
ALTER TABLE mensagens_whatsapp ADD COLUMN "inboxId" TEXT;
CREATE UNIQUE INDEX "mensagens_whatsapp_inboxId_key" ON mensagens_whatsapp("inboxId");
CREATE TABLE inbox_whatsapp (
 id TEXT PRIMARY KEY,
 "organizacaoId" TEXT NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "instanceId" VARCHAR(128) NOT NULL, "providerMessageId" VARCHAR(128) NOT NULL,
 contrato VARCHAR(40) NOT NULL DEFAULT 'evolution-envelope-v1',
 "conteudoCifrado" TEXT, estado VARCHAR(32) NOT NULL DEFAULT 'pendente',
 resultado VARCHAR(40), "demandaId" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "processadoEm" TIMESTAMP(3), "conteudoExpiraEm" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "inbox_whatsapp_organizacaoId_instanceId_providerMessageId_key"
 ON inbox_whatsapp("organizacaoId","instanceId","providerMessageId");
CREATE INDEX "inbox_whatsapp_organizacaoId_conteudoExpiraEm_idx" ON inbox_whatsapp("organizacaoId","conteudoExpiraEm");
ALTER TABLE inbox_whatsapp ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON inbox_whatsapp FROM PUBLIC, app_auth, app_user;
GRANT SELECT, INSERT, UPDATE ON inbox_whatsapp TO app_user;
CREATE POLICY inbox_org ON inbox_whatsapp TO app_user
 USING ("organizacaoId"=NULLIF(current_setting('app.org_id',true),''))
 WITH CHECK ("organizacaoId"=NULLIF(current_setting('app.org_id',true),''));

-- Bootstrap estreito antes de haver contexto. Não retorna credenciais.
CREATE FUNCTION public.whatsapp_instancia_org(instancia TEXT)
RETURNS TABLE ("organizacaoId" TEXT, "configId" TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
 WITH candidatos AS (
   SELECT c."organizacaoId",c.id FROM public.config_whatsapp c
   JOIN public.organizacoes o ON o.id=c."organizacaoId" AND o.ativo
   WHERE c."instanceId"=instancia OR c."instanceName"=instancia
 )
 SELECT c."organizacaoId",c.id FROM candidatos c WHERE (SELECT count(*) FROM candidatos)=1
$$;
REVOKE ALL ON FUNCTION public.whatsapp_instancia_org(TEXT) FROM PUBLIC, app_auth;
GRANT EXECUTE ON FUNCTION public.whatsapp_instancia_org(TEXT) TO app_user;
