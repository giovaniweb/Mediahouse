
CREATE TABLE jobs_automacao (
 id TEXT PRIMARY KEY,
 "organizacaoId" TEXT NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE ON UPDATE CASCADE,
 tipo VARCHAR(80) NOT NULL, versao INTEGER NOT NULL DEFAULT 1 CHECK (versao > 0),
 referencia VARCHAR(128) NOT NULL, chave VARCHAR(128) NOT NULL,
 payload JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(payload)='object' AND octet_length(payload::text)<=4096),
 estado VARCHAR(16) NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente','executando','concluido','falhou','cancelado','expirado')),
 "agendadoPara" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expiraEm" TIMESTAMP(3) NOT NULL,
 tentativas INTEGER NOT NULL DEFAULT 0 CHECK (tentativas>=0),
 "maxTentativas" INTEGER NOT NULL DEFAULT 5 CHECK ("maxTentativas" BETWEEN 1 AND 5),
 "leaseAte" TIMESTAMP(3), "leaseToken" TEXT, erro VARCHAR(40),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL, "finishedAt" TIMESTAMP(3),
 CHECK ((estado='executando') = ("leaseAte" IS NOT NULL AND "leaseToken" IS NOT NULL))
);
CREATE UNIQUE INDEX "jobs_automacao_organizacaoId_tipo_chave_key" ON jobs_automacao("organizacaoId",tipo,chave);
CREATE INDEX "jobs_automacao_organizacaoId_estado_agendadoPara_id_idx" ON jobs_automacao("organizacaoId",estado,"agendadoPara",id);
CREATE TABLE eventos_job (
 id TEXT PRIMARY KEY,
 "organizacaoId" TEXT NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "jobId" TEXT NOT NULL REFERENCES jobs_automacao(id) ON DELETE CASCADE ON UPDATE CASCADE,
 tentativa INTEGER NOT NULL, evento VARCHAR(24) NOT NULL, motivo VARCHAR(40),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "eventos_job_organizacaoId_jobId_createdAt_idx" ON eventos_job("organizacaoId","jobId","createdAt");
ALTER TABLE jobs_automacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos_job ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON jobs_automacao, eventos_job FROM PUBLIC, app_auth, app_user;
GRANT SELECT, INSERT, UPDATE ON jobs_automacao TO app_user;
GRANT SELECT, INSERT ON eventos_job TO app_user;
CREATE POLICY fila_org ON jobs_automacao TO app_user
 USING ("organizacaoId"=NULLIF(current_setting('app.org_id',true),''))
 WITH CHECK ("organizacaoId"=NULLIF(current_setting('app.org_id',true),''));
CREATE POLICY eventos_job_leitura ON eventos_job FOR SELECT TO app_user
 USING ("organizacaoId"=NULLIF(current_setting('app.org_id',true),''));
CREATE POLICY eventos_job_escrita ON eventos_job FOR INSERT TO app_user
 WITH CHECK ("organizacaoId"=NULLIF(current_setting('app.org_id',true),'')
 AND EXISTS (SELECT 1 FROM jobs_automacao j WHERE j.id="jobId" AND j."organizacaoId"=eventos_job."organizacaoId"));
