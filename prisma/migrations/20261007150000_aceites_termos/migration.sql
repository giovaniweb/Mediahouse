-- Onda 3: registro de aceite dos documentos jurídicos (Termos de Uso, Política
-- de Privacidade, Acordo de Tratamento de Dados, Termos do Profissional).
--
-- Aditiva: tabela nova, nada existente muda. O código que grava aqui só passa
-- a existir com esta migration aplicada; sem ela, o cadastro de profissional
-- e o painel quebrariam ao gravar o aceite. Por isso a migration sobe ANTES do
-- merge do código (ver o plano da Onda 3).
--
-- O aceite é prova: quem (titular), o quê (documentos com versão), quando
-- (createdAt) e de onde (ip_hash, o HMAC do IP com segredo do servidor, como
-- os formulários públicos já fazem). Por isso a aplicação só INSERE e LÊ.
-- Corrigir um aceite é registrar outro, nunca editar o anterior.

CREATE TABLE "aceites_termos" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizacaoId" TEXT NOT NULL,
  "titularTipo" VARCHAR(16) NOT NULL,
  "titularId" VARCHAR(128) NOT NULL,
  "documentos" TEXT[] NOT NULL,
  "origem" VARCHAR(32) NOT NULL,
  "ip_hash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "aceites_termos_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "aceites_termos_titularTipo_check" CHECK ("titularTipo" IN ('usuario', 'videomaker', 'designer')),
  CONSTRAINT "aceites_termos_origem_check" CHECK ("origem" IN ('cadastro_videomaker', 'cadastro_designer', 'primeiro_acesso', 'nova_versao')),
  CONSTRAINT "aceites_termos_documentos_check" CHECK (cardinality("documentos") BETWEEN 1 AND 10)
);
CREATE INDEX "aceites_termos_organizacaoId_titularTipo_titularId_createdAt_idx"
  ON "aceites_termos" ("organizacaoId", "titularTipo", "titularId", "createdAt");

-- Por empresa, como as demais tabelas de negócio. FORCE para valer até para o
-- dono da tabela quando ele não tem BYPASSRLS.
ALTER TABLE "aceites_termos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "aceites_termos" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON "aceites_termos" FROM PUBLIC, app_auth, app_user;
-- Sem UPDATE e sem DELETE: a prova não se reescreve.
GRANT SELECT, INSERT ON "aceites_termos" TO app_user;
CREATE POLICY "aceites_termos_org" ON "aceites_termos" TO app_user
USING ("organizacaoId" = current_setting('app.org_id', true))
WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
