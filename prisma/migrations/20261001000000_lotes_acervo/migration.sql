CREATE TABLE "lotes_acervo" (
 "id" TEXT PRIMARY KEY, "organizacaoId" TEXT NOT NULL, "operadorId" TEXT NOT NULL,
 "snapshot" JSONB NOT NULL, "resultado" JSONB, "estado" TEXT NOT NULL DEFAULT 'simulado',
 "expiraEm" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "aplicadoEm" TIMESTAMP(3),
 CONSTRAINT "lotes_acervo_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "lotes_acervo_organizacaoId_createdAt_idx" ON "lotes_acervo"("organizacaoId","createdAt");
ALTER TABLE "lotes_acervo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lotes_acervo" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON "lotes_acervo" FROM PUBLIC, app_auth, app_user;
GRANT SELECT, INSERT, UPDATE ON "lotes_acervo" TO app_user;
CREATE POLICY "lotes_acervo_org" ON "lotes_acervo" TO app_user
USING ("organizacaoId"=current_setting('app.org_id',true))
WITH CHECK ("organizacaoId"=current_setting('app.org_id',true));
