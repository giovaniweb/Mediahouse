ALTER TABLE "convites_videomaker"
 ADD COLUMN "versao" INTEGER NOT NULL DEFAULT 1,
 ADD COLUMN "tarifaDiaria" DECIMAL(14,2),
 ADD COLUMN "condicoes" TEXT;
ALTER TABLE "convites_videomaker" ADD CONSTRAINT "convite_tarifa_check" CHECK ("tarifaDiaria" IS NULL OR "tarifaDiaria">=0);
-- Nunca preencher convites antigos com a tarifa atual.
CREATE FUNCTION public.proteger_condicao_convite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW."demandaId", NEW."videomakerId", NEW.token, NEW."expiresAt", NEW."createdAt", NEW.versao, NEW."tarifaDiaria", NEW.condicoes)
 IS DISTINCT FROM ROW(OLD."demandaId", OLD."videomakerId", OLD.token, OLD."expiresAt", OLD."createdAt", OLD.versao, OLD."tarifaDiaria", OLD.condicoes) THEN
  RAISE EXCEPTION 'Condição do convite imutável; emita outro convite';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "convite_condicao_imutavel" BEFORE UPDATE ON "convites_videomaker" FOR EACH ROW EXECUTE FUNCTION public.proteger_condicao_convite();
REVOKE ALL ON FUNCTION public.proteger_condicao_convite() FROM PUBLIC, app_auth, app_user;
