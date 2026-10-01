ALTER TABLE "custos_videomaker" ADD COLUMN "valorConfirmadoEm" TIMESTAMP(3), ADD COLUMN "fatoOrigem" TEXT;
CREATE UNIQUE INDEX "custos_videomaker_organizacaoId_fatoOrigem_key" ON "custos_videomaker"("organizacaoId", "fatoOrigem");
CREATE TABLE "lancamentos_setor" (
 "id" TEXT PRIMARY KEY, "organizacaoId" TEXT NOT NULL, "competencia" TEXT NOT NULL,
 "categoria" TEXT NOT NULL, "descricao" TEXT NOT NULL, "valor" DECIMAL(14,2),
 "moeda" TEXT NOT NULL DEFAULT 'BRL', "fonte" TEXT NOT NULL, "chaveOrigem" TEXT NOT NULL,
 "assinatura" TEXT NOT NULL, "usuarioId" TEXT, "criadoPor" TEXT NOT NULL,
 "canceladoEm" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "lancamentos_setor_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "lancamentos_setor_valor_check" CHECK ("valor" IS NULL OR "valor">=0),
 CONSTRAINT "lancamentos_setor_categoria_check" CHECK ("categoria" IN ('interno','infraestrutura','outros')),
 CONSTRAINT "lancamentos_setor_moeda_check" CHECK ("moeda"='BRL'),
 CONSTRAINT "lancamentos_setor_competencia_check" CHECK ("competencia" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$')
);
CREATE UNIQUE INDEX "lancamentos_setor_organizacaoId_chaveOrigem_key" ON "lancamentos_setor"("organizacaoId","chaveOrigem");
CREATE INDEX "lancamentos_setor_organizacaoId_competencia_idx" ON "lancamentos_setor"("organizacaoId","competencia");
ALTER TABLE "lancamentos_setor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lancamentos_setor" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON "lancamentos_setor" FROM PUBLIC, app_auth, app_user;
GRANT SELECT, INSERT, UPDATE ON "lancamentos_setor" TO app_user;
CREATE POLICY "lancamentos_setor_org" ON "lancamentos_setor" TO app_user
USING ("organizacaoId"=current_setting('app.org_id',true))
WITH CHECK ("organizacaoId"=current_setting('app.org_id',true));
-- O histórico monetário é imutável; correção exige cancelamento auditado e novo fato.
CREATE FUNCTION public.proteger_lancamento_setor() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-'canceladoEm') IS DISTINCT FROM (to_jsonb(OLD)-'canceladoEm')
 OR OLD."canceladoEm" IS NOT NULL OR NEW."canceladoEm" IS NULL THEN
  RAISE EXCEPTION 'Lançamento imutável';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "lancamento_setor_imutavel" BEFORE UPDATE ON "lancamentos_setor" FOR EACH ROW EXECUTE FUNCTION public.proteger_lancamento_setor();
REVOKE ALL ON FUNCTION public.proteger_lancamento_setor() FROM PUBLIC, app_auth, app_user;
