
CREATE TABLE saidas_whatsapp (
 id TEXT PRIMARY KEY, "organizacaoId" TEXT NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE ON UPDATE CASCADE,
 revisao INTEGER NOT NULL DEFAULT 0, chave VARCHAR(128) NOT NULL, origem VARCHAR(16) NOT NULL, referencia VARCHAR(128) NOT NULL,
 "destinatarioTipo" VARCHAR(24) NOT NULL, "destinatarioId" VARCHAR(128) NOT NULL, "telefoneHash" VARCHAR(64) NOT NULL,
 "telefoneCifrado" TEXT, "conteudoCifrado" TEXT, "instanceId" VARCHAR(128), "providerMessageId" VARCHAR(128),
 estado VARCHAR(24) NOT NULL DEFAULT 'aguardando' CHECK (estado IN ('aguardando','aceito','entregue','lido','falhou','expirado','cancelado','desconhecido')),
 motivo VARCHAR(40), tentativas INTEGER NOT NULL DEFAULT 0 CHECK (tentativas BETWEEN 0 AND 5),
 "proximaTentativa" TIMESTAMP(3), "expiraEm" TIMESTAMP(3) NOT NULL, "conteudoExpiraEm" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "saidas_whatsapp_organizacaoId_chave_key" ON saidas_whatsapp("organizacaoId",chave);
CREATE UNIQUE INDEX "saidas_whatsapp_organizacaoId_instanceId_providerMessageId_key" ON saidas_whatsapp("organizacaoId","instanceId","providerMessageId");
CREATE INDEX "saidas_whatsapp_organizacaoId_estado_createdAt_idx" ON saidas_whatsapp("organizacaoId",estado,"createdAt");
CREATE TABLE tentativas_whatsapp (
 id TEXT PRIMARY KEY, "organizacaoId" TEXT NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "saidaId" TEXT NOT NULL REFERENCES saidas_whatsapp(id) ON DELETE CASCADE ON UPDATE CASCADE,
 numero INTEGER NOT NULL, "leaseToken" TEXT NOT NULL, resultado VARCHAR(24) NOT NULL,
 "httpStatus" INTEGER, "providerMessageId" VARCHAR(128), motivo VARCHAR(40),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "finishedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "tentativas_whatsapp_saidaId_numero_key" ON tentativas_whatsapp("saidaId",numero);
CREATE INDEX "tentativas_whatsapp_organizacaoId_saidaId_idx" ON tentativas_whatsapp("organizacaoId","saidaId");
CREATE TABLE recibos_whatsapp (
 id TEXT PRIMARY KEY, "organizacaoId" TEXT NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "instanceId" VARCHAR(128) NOT NULL, "providerMessageId" VARCHAR(128) NOT NULL, "telefoneHash" VARCHAR(64) NOT NULL,
 chave VARCHAR(64) NOT NULL, estado VARCHAR(24) NOT NULL, "ocorridoEm" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "recibos_whatsapp_organizacaoId_chave_key" ON recibos_whatsapp("organizacaoId",chave);
CREATE INDEX "recibos_whatsapp_organizacaoId_instanceId_providerMessageId_idx" ON recibos_whatsapp("organizacaoId","instanceId","providerMessageId");
ALTER TABLE saidas_whatsapp ENABLE ROW LEVEL SECURITY;
ALTER TABLE tentativas_whatsapp ENABLE ROW LEVEL SECURITY;
ALTER TABLE recibos_whatsapp ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON saidas_whatsapp,tentativas_whatsapp,recibos_whatsapp FROM PUBLIC,app_auth,app_user;
GRANT SELECT,INSERT,UPDATE ON saidas_whatsapp,tentativas_whatsapp TO app_user;
GRANT SELECT,INSERT ON recibos_whatsapp TO app_user;
CREATE POLICY saidas_org ON saidas_whatsapp TO app_user USING ("organizacaoId"=NULLIF(current_setting('app.org_id',true),''))
 WITH CHECK ("organizacaoId"=NULLIF(current_setting('app.org_id',true),''));
CREATE POLICY tentativas_org ON tentativas_whatsapp TO app_user USING ("organizacaoId"=NULLIF(current_setting('app.org_id',true),''))
 WITH CHECK ("organizacaoId"=NULLIF(current_setting('app.org_id',true),'') AND EXISTS
 (SELECT 1 FROM saidas_whatsapp s WHERE s.id="saidaId" AND s."organizacaoId"=tentativas_whatsapp."organizacaoId"));
CREATE POLICY recibos_leitura ON recibos_whatsapp FOR SELECT TO app_user USING ("organizacaoId"=NULLIF(current_setting('app.org_id',true),''));
CREATE POLICY recibos_escrita ON recibos_whatsapp FOR INSERT TO app_user WITH CHECK ("organizacaoId"=NULLIF(current_setting('app.org_id',true),''));
