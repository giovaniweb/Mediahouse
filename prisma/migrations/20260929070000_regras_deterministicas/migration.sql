ALTER TABLE organizacoes ADD COLUMN "ambienteTeste" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE alertas_ia ADD COLUMN "chaveRegra" TEXT;
CREATE UNIQUE INDEX "alertas_ia_organizacaoId_chaveRegra_key" ON alertas_ia("organizacaoId","chaveRegra");
ALTER TABLE relatorios_ia ADD COLUMN "chaveRegra" TEXT;
CREATE UNIQUE INDEX "relatorios_ia_organizacaoId_chaveRegra_key" ON relatorios_ia("organizacaoId","chaveRegra");
ALTER TABLE saidas_whatsapp ADD COLUMN "regraContexto" JSONB;
ALTER TABLE eventos ADD COLUMN "notificarEm" TIMESTAMP(3);
CREATE FUNCTION public.evento_notificar_em() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  NEW."notificarEm" := NEW.inicio - make_interval(mins => GREATEST(0, NEW."lembreteMinutos"));
  RETURN NEW;
END $$;
CREATE TRIGGER evento_notificar_em BEFORE INSERT OR UPDATE ON eventos FOR EACH ROW EXECUTE FUNCTION public.evento_notificar_em();
UPDATE eventos SET "notificarEm" = inicio - make_interval(mins => GREATEST(0,"lembreteMinutos"));
CREATE INDEX "eventos_organizacaoId_notificarEm_idx" ON eventos("organizacaoId","notificarEm");
