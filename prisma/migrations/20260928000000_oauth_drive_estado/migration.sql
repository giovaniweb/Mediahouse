-- Aditiva: aplicar antes do código OAuth. Nenhum token existente é alterado.
CREATE TABLE "oauth_drive_estados" (
  "hash" TEXT NOT NULL,
  "organizacaoId" TEXT NOT NULL,
  "usuarioId" TEXT NOT NULL,
  "expiraEm" TIMESTAMP(3) NOT NULL,
  "consumidoEm" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "oauth_drive_estados_pkey" PRIMARY KEY ("hash"),
  CONSTRAINT "oauth_drive_estados_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "oauth_drive_estados_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "oauth_drive_estados_organizacaoId_expiraEm_idx" ON "oauth_drive_estados"("organizacaoId", "expiraEm");
ALTER TABLE "oauth_drive_estados" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "oauth_drive_empresa" ON "oauth_drive_estados"
  FOR ALL TO app_user
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "oauth_drive_estados" TO app_user;
