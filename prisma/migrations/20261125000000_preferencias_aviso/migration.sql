-- Avisos por pessoa (12/11/2026).
--
-- A gestão escolhe, pessoa por pessoa, quais categorias de aviso ela recebe e
-- por quais canais (sino, e-mail, WhatsApp), e se quer tudo do departamento ou
-- só os cards em que está. A própria pessoa também ajusta, menos o que a gestão
-- travou.
--
-- Sem linha, a pessoa recebe exatamente o que recebe hoje. A linha só tira.
--
-- Aditiva: o código antigo não lê esta tabela. Voltar = scripts/volta/.
CREATE TABLE "preferencias_aviso" (
  "id" TEXT NOT NULL,
  "organizacaoId" TEXT NOT NULL,
  "usuarioId" TEXT NOT NULL,
  "categoria" TEXT NOT NULL,
  "sino" BOOLEAN NOT NULL DEFAULT true,
  "email" BOOLEAN NOT NULL DEFAULT true,
  "whatsapp" BOOLEAN NOT NULL DEFAULT true,
  "recorte" TEXT NOT NULL DEFAULT 'tudo',
  "travada" BOOLEAN NOT NULL DEFAULT false,
  "atualizadoPorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "preferencias_aviso_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "preferencias_aviso_recorte_check" CHECK ("recorte" IN ('tudo', 'meus'))
);
CREATE UNIQUE INDEX "preferencias_aviso_organizacaoId_usuarioId_categoria_key"
  ON "preferencias_aviso"("organizacaoId", "usuarioId", "categoria");
CREATE INDEX "preferencias_aviso_organizacaoId_idx" ON "preferencias_aviso"("organizacaoId");
ALTER TABLE "preferencias_aviso" ADD CONSTRAINT "preferencias_aviso_organizacaoId_fkey"
  FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "preferencias_aviso" ADD CONSTRAINT "preferencias_aviso_usuarioId_fkey"
  FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Isolada por empresa como as outras. "Voltar ao padrão" apaga a linha, por
-- isso a aplicação tem DELETE aqui.
ALTER TABLE "preferencias_aviso" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "preferencias_aviso" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON "preferencias_aviso" FROM PUBLIC, app_auth, app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "preferencias_aviso" TO app_user;
CREATE POLICY "preferencias_aviso_org" ON "preferencias_aviso" TO app_user
USING ("organizacaoId"=current_setting('app.org_id',true))
WITH CHECK ("organizacaoId"=current_setting('app.org_id',true));

-- Fora da API do Supabase (ver 20261005140000 e 20261030200000).
DO $$
DECLARE papel TEXT;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON "preferencias_aviso" FROM %I', papel);
    END IF;
  END LOOP;
END $$;
