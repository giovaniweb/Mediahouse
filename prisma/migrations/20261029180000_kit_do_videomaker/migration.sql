-- Kit do videomaker das Gravações Externas (29/10/2026).
--
-- O guia de captação (PDF), os vídeos de referência e a colinha do dia, por
-- empresa e, se quiser, por tipo de gravação. O videomaker vê na página do
-- convite; a colinha sai no WhatsApp no dia da gravação.
--
-- Tabela nova, isolada por empresa como as outras (RLS forçado, política só
-- para app_user pela empresa da sessão). Aditiva: o código antigo não a usa.
CREATE TABLE "materiais_videomaker" (
  "id" TEXT NOT NULL,
  "organizacaoId" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "url" TEXT,
  "texto" TEXT,
  "tipoGravacao" "TipoGravacao",
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "materiais_videomaker_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "materiais_videomaker_tipo_check" CHECK ("tipo" IN ('guia', 'referencia', 'colinha'))
);
CREATE INDEX "materiais_videomaker_organizacaoId_idx" ON "materiais_videomaker"("organizacaoId");
ALTER TABLE "materiais_videomaker" ADD CONSTRAINT "materiais_videomaker_organizacaoId_fkey"
  FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "materiais_videomaker" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "materiais_videomaker" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON "materiais_videomaker" FROM PUBLIC, app_auth, app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "materiais_videomaker" TO app_user;
CREATE POLICY "materiais_videomaker_org" ON "materiais_videomaker" TO app_user
USING ("organizacaoId"=current_setting('app.org_id',true))
WITH CHECK ("organizacaoId"=current_setting('app.org_id',true));
