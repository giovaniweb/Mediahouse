CREATE TABLE "eventos_auditoria" (
  "id" TEXT PRIMARY KEY,
  "organizacaoId" TEXT NOT NULL REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "atorTipo" VARCHAR(16) NOT NULL CHECK ("atorTipo" IN ('humano','tecnico')),
  "atorId" VARCHAR(128) NOT NULL,
  "acao" VARCHAR(80) NOT NULL,
  "recurso" VARCHAR(40) NOT NULL,
  "recursoId" VARCHAR(128) NOT NULL,
  "resultado" VARCHAR(16) NOT NULL CHECK ("resultado" IN ('intencao','sucesso','falha','negado')),
  "correlationId" VARCHAR(64) NOT NULL,
  "chave" VARCHAR(64) NOT NULL,
  "antes" JSONB,
  "depois" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payloadExpiraEm" TIMESTAMP(3) NOT NULL,
  CHECK (octet_length(COALESCE("antes"::text,'')) <= 4096 AND octet_length(COALESCE("depois"::text,'')) <= 4096)
);
CREATE UNIQUE INDEX "eventos_auditoria_organizacaoId_chave_key" ON "eventos_auditoria"("organizacaoId","chave");
CREATE INDEX "eventos_auditoria_organizacaoId_createdAt_id_idx" ON "eventos_auditoria"("organizacaoId","createdAt","id");
CREATE INDEX "eventos_auditoria_payloadExpiraEm_idx" ON "eventos_auditoria"("payloadExpiraEm");
ALTER TABLE "eventos_auditoria" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "eventos_auditoria" FROM PUBLIC, app_auth, app_user;
GRANT SELECT, INSERT ON "eventos_auditoria" TO app_user;
CREATE POLICY "auditoria_leitura_org" ON "eventos_auditoria" FOR SELECT TO app_user
  USING ("organizacaoId" = NULLIF(current_setting('app.org_id', true), ''));
CREATE POLICY "auditoria_escrita_org" ON "eventos_auditoria" FOR INSERT TO app_user
  WITH CHECK ("organizacaoId" = NULLIF(current_setting('app.org_id', true), ''));
-- Retenção técnica de payload usa conexão administrativa. Nenhum UPDATE/DELETE
-- é concedido ao app comum. Excluir a organização por administração apaga sua trilha.
