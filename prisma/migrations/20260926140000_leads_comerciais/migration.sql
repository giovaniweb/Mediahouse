CREATE TABLE "leads_comerciais" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "nome" TEXT NOT NULL,
 "email" TEXT NOT NULL,
 "telefone" TEXT NOT NULL,
 "empresa" TEXT NOT NULL,
 "mensagem" TEXT,
 "origem" TEXT,
 "campanha" TEXT,
 "consentimentoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "leads_comerciais" ENABLE ROW LEVEL SECURITY;
-- A captura pública só insere; leitura da plataforma usa conexão administrativa.
CREATE POLICY "lead_insert" ON "leads_comerciais" FOR INSERT WITH CHECK (true);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_user') THEN
  GRANT INSERT ON "leads_comerciais" TO app_user;
 END IF;
END $$;
