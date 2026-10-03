CREATE TABLE "copias_drive" (
 "id" TEXT PRIMARY KEY, "organizacaoId" TEXT NOT NULL, "arquivoId" TEXT NOT NULL,
 "fonteVersao" INTEGER NOT NULL CHECK ("fonteVersao">0), "fonteBucket" TEXT NOT NULL,
 "fonteObjectKey" TEXT NOT NULL, "fonteSha256" TEXT, "pastaId" TEXT NOT NULL, "conexao" TEXT NOT NULL,
 "chave" TEXT NOT NULL, "driveFileId" TEXT, "driveVersion" TEXT,
 "sha256" TEXT, "md5" TEXT, "tamanho" INTEGER, "estado" TEXT NOT NULL DEFAULT 'pendente',
 "erro" TEXT, "concluidoEm" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 FOREIGN KEY ("arquivoId") REFERENCES "arquivos"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "copias_drive_chave_key" ON "copias_drive"("chave");
CREATE UNIQUE INDEX "copias_drive_identidade_key" ON "copias_drive"("organizacaoId","arquivoId","fonteVersao","pastaId","conexao");
CREATE INDEX "copias_drive_organizacaoId_estado_createdAt_idx" ON "copias_drive"("organizacaoId","estado","createdAt");
ALTER TABLE "copias_drive" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "copias_drive" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON "copias_drive" FROM PUBLIC, app_auth, app_user;
GRANT SELECT,INSERT,UPDATE ON "copias_drive" TO "app_user";
CREATE POLICY "copias_drive_por_org" ON "copias_drive" TO "app_user"
USING ("organizacaoId"=current_setting('app.org_id',true))
WITH CHECK ("organizacaoId"=current_setting('app.org_id',true) AND EXISTS (
 SELECT 1 FROM arquivos a JOIN demandas d ON d.id=a."demandaId"
 WHERE a.id="copias_drive"."arquivoId" AND d."organizacaoId"="copias_drive"."organizacaoId"
));
