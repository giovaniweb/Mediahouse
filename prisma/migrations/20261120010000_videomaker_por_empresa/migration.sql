-- Videomaker que trabalha por uma empresa (Gabriel → GH Produção), 12/11/2026.
--
-- SÓ DADOS, SEM EFEITO ATÉ ALGUÉM USAR: duas colunas vazias, uma tabela vazia
-- e gatilhos que só agem quando as colunas novas forem preenchidas. Nenhuma
-- linha existente muda. Volta: scripts/volta/20261120010000_videomaker_por_empresa.sql.
--
--   videomaker_organizacao.organizacaoExecutoraId   a "Empresa dele"
--   demanda_compartilhamento.porVideomakerId        marca o espelho automático
--   executor_espelho                                quem da parceira faz o card
--
-- Depende da 20261120000000 (a revogação com a parceria encerrada não pode dar
-- erro, porque os gatilhos daqui revogam sozinhos).

-- ── 1) Estrutura (gerada pelo Prisma) ───────────────────────────────────────
-- AlterTable
ALTER TABLE "demanda_compartilhamento" ADD COLUMN     "porVideomakerId" TEXT;

-- AlterTable
ALTER TABLE "videomaker_organizacao" ADD COLUMN     "organizacaoExecutoraId" TEXT;

-- CreateTable
CREATE TABLE "executor_espelho" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "demandaId" TEXT NOT NULL,
    "videomakerId" TEXT NOT NULL,
    "escolhidoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "executor_espelho_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "executor_espelho_videomakerId_idx" ON "executor_espelho"("videomakerId");

-- CreateIndex
CREATE INDEX "executor_espelho_demandaId_idx" ON "executor_espelho"("demandaId");

-- CreateIndex
CREATE UNIQUE INDEX "executor_espelho_organizacaoId_demandaId_key" ON "executor_espelho"("organizacaoId", "demandaId");

-- CreateIndex
CREATE INDEX "videomaker_organizacao_organizacaoExecutoraId_idx" ON "videomaker_organizacao"("organizacaoExecutoraId");

-- AddForeignKey
ALTER TABLE "videomaker_organizacao" ADD CONSTRAINT "videomaker_organizacao_organizacaoExecutoraId_fkey" FOREIGN KEY ("organizacaoExecutoraId") REFERENCES "organizacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demanda_compartilhamento" ADD CONSTRAINT "demanda_compartilhamento_porVideomakerId_fkey" FOREIGN KEY ("porVideomakerId") REFERENCES "videomakers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executor_espelho" ADD CONSTRAINT "executor_espelho_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executor_espelho" ADD CONSTRAINT "executor_espelho_demandaId_fkey" FOREIGN KEY ("demandaId") REFERENCES "demandas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executor_espelho" ADD CONSTRAINT "executor_espelho_videomakerId_fkey" FOREIGN KEY ("videomakerId") REFERENCES "videomakers"("id") ON DELETE CASCADE ON UPDATE CASCADE;


GRANT SELECT, INSERT, UPDATE, DELETE ON "executor_espelho" TO "app_user";

-- ── 2) RLS: executor_espelho é dado da PARCEIRA ─────────────────────────────
-- A dona do card nunca lê esta tabela: para ela quem faz é o videomaker dela.
ALTER TABLE "executor_espelho" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "executor_espelho_por_org" ON "executor_espelho"
  FOR ALL TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));

-- ── 3) A "Empresa dele" só aponta para onde ele manda ───────────────────────
-- Gravar "Empresa dele: GH" num videomaker que não é admin nem gestor da GH
-- espelharia os cards para uma empresa onde ele não decide nada — ou para uma
-- empresa qualquer. A rota confere; o gatilho é a parede.
CREATE OR REPLACE FUNCTION nuflow_videomaker_empresa_executora_regras()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  usuario_vm TEXT;
BEGIN
  IF NEW."organizacaoExecutoraId" IS NULL
     OR (TG_OP = 'UPDATE' AND NEW."organizacaoExecutoraId" IS NOT DISTINCT FROM OLD."organizacaoExecutoraId") THEN
    RETURN NEW;
  END IF;
  IF NEW."organizacaoExecutoraId" = NEW."organizacaoId" THEN
    RAISE EXCEPTION 'A empresa dele não pode ser a própria empresa.';
  END IF;
  SELECT v."usuarioId" INTO usuario_vm FROM videomakers v WHERE v.id = NEW."videomakerId";
  IF usuario_vm IS NULL OR NOT EXISTS (
    SELECT 1 FROM usuario_organizacao uo
    WHERE uo."usuarioId" = usuario_vm
      AND uo."organizacaoId" = NEW."organizacaoExecutoraId"
      AND uo.papel IN ('admin', 'gestor')
  ) THEN
    RAISE EXCEPTION 'O videomaker precisa ser admin ou gestor na empresa dele.';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER videomaker_empresa_executora_regras
  BEFORE INSERT OR UPDATE OF "organizacaoExecutoraId" ON "videomaker_organizacao"
  FOR EACH ROW EXECUTE FUNCTION nuflow_videomaker_empresa_executora_regras();

-- ── 4) Quem faz: só com espelho ativo e com o X na empresa ──────────────────
CREATE OR REPLACE FUNCTION nuflow_executor_espelho_regras()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW."organizacaoId" IS DISTINCT FROM OLD."organizacaoId"
                           OR NEW."demandaId" IS DISTINCT FROM OLD."demandaId") THEN
    RAISE EXCEPTION 'O executor não muda de card nem de empresa. Apague e escolha de novo.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM demanda_compartilhamento c
    WHERE c."demandaId" = NEW."demandaId"
      AND c."organizacaoDestinoId" = NEW."organizacaoId"
      AND c."revogadoEm" IS NULL
      AND c.escopo = 'executar'
  ) THEN
    RAISE EXCEPTION 'Este card não está com esta empresa.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM videomaker_organizacao vo
    WHERE vo."videomakerId" = NEW."videomakerId" AND vo."organizacaoId" = NEW."organizacaoId"
  ) THEN
    RAISE EXCEPTION 'Quem vai fazer precisa ser videomaker desta empresa.';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER executor_espelho_regras
  BEFORE INSERT OR UPDATE ON "executor_espelho"
  FOR EACH ROW EXECUTE FUNCTION nuflow_executor_espelho_regras();

-- ── 5) Revogar: histórico na dona, sino na parceira, executor apagado ───────
-- Vale para qualquer revogação (manual ou automática) apagar o executor: sem
-- espelho, a parceira não tem mais o card. Histórico e sino só na automática:
-- a manual já grava o histórico pela rota /espelhar, com quem revogou.
-- O sino vai SEM demandaId: o card não abre mais para a parceira.
CREATE OR REPLACE FUNCTION nuflow_espelho_ao_revogar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cod TEXT;
  tit TEXT;
BEGIN
  IF OLD."revogadoEm" IS NOT NULL OR NEW."revogadoEm" IS NULL THEN
    RETURN NEW;
  END IF;

  DELETE FROM executor_espelho e
  WHERE e."demandaId" = NEW."demandaId" AND e."organizacaoId" = NEW."organizacaoDestinoId";

  IF NEW."porVideomakerId" IS NOT NULL THEN
    SELECT d.codigo, d.titulo INTO cod, tit FROM demandas d WHERE d.id = NEW."demandaId";
    INSERT INTO historico_status (id, "demandaId", "statusNovo", "usuarioId", origem, observacao, "createdAt")
    VALUES (gen_random_uuid()::text, NEW."demandaId", 'espelho_revogado', NULL, 'automacao',
            'Saiu de ' || NEW."nomeDestino" || ': o videomaker do card mudou.', CURRENT_TIMESTAMP);
    INSERT INTO alertas_ia (id, "organizacaoId", "demandaId", "tipoAlerta", mensagem, severidade, status, lida, "createdAt")
    VALUES (gen_random_uuid()::text, NEW."organizacaoDestinoId", NULL, 'espelho_revogado',
            'A gravação ' || cod || ' — ' || tit || ' não está mais com ' || NEW."nomeDestino"
              || ': ' || NEW."nomeOrigem" || ' mudou quem faz.',
            'aviso', 'ativo', false, CURRENT_TIMESTAMP);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER espelho_ao_revogar
  AFTER UPDATE OF "revogadoEm" ON "demanda_compartilhamento"
  FOR EACH ROW EXECUTE FUNCTION nuflow_espelho_ao_revogar();

-- ── 6) Trocar o videomaker do card revoga o espelho automático ──────────────
-- "Se o Gabriel sair do card, o card some da GH." Voltar a ele reativa — isso
-- é da aplicação (garantirEspelhoDoVideomaker), que confere a parceria.
CREATE OR REPLACE FUNCTION nuflow_demandas_videomaker_revoga_espelho()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW."videomakerId" IS NOT DISTINCT FROM OLD."videomakerId" THEN
    RETURN NEW;
  END IF;
  UPDATE demanda_compartilhamento c
     SET "revogadoEm" = CURRENT_TIMESTAMP, "revogadoPorId" = 'sistema:troca-de-videomaker'
   WHERE c."demandaId" = NEW.id
     AND c."porVideomakerId" IS NOT NULL
     AND c."porVideomakerId" IS DISTINCT FROM NEW."videomakerId"
     AND c."revogadoEm" IS NULL;
  RETURN NEW;
END $$;

CREATE TRIGGER demandas_videomaker_revoga_espelho
  AFTER UPDATE OF "videomakerId" ON "demandas"
  FOR EACH ROW EXECUTE FUNCTION nuflow_demandas_videomaker_revoga_espelho();

-- ── 7) Mudar (ou tirar) a "Empresa dele" revoga o espelho dos cards abertos ─
-- Também quando o vínculo é apagado (o videomaker sai da empresa dona).
-- Concluídos ficam: são o histórico do que a parceira fez.
CREATE OR REPLACE FUNCTION nuflow_empresa_executora_revoga_espelho()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD."organizacaoExecutoraId" IS NULL THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW."organizacaoExecutoraId" IS NOT DISTINCT FROM OLD."organizacaoExecutoraId" THEN
    RETURN NULL;
  END IF;
  UPDATE demanda_compartilhamento c
     SET "revogadoEm" = CURRENT_TIMESTAMP, "revogadoPorId" = 'sistema:empresa-dele-mudou'
    FROM demandas d
   WHERE d.id = c."demandaId"
     AND d."statusVisivel" <> 'finalizado'
     AND c."porVideomakerId" = OLD."videomakerId"
     AND c."organizacaoOrigemId" = OLD."organizacaoId"
     AND c."organizacaoDestinoId" = OLD."organizacaoExecutoraId"
     AND c."revogadoEm" IS NULL;
  RETURN NULL;
END $$;

CREATE TRIGGER empresa_executora_revoga_espelho
  AFTER UPDATE OF "organizacaoExecutoraId" OR DELETE ON "videomaker_organizacao"
  FOR EACH ROW EXECUTE FUNCTION nuflow_empresa_executora_revoga_espelho();

-- As funções novas não ficam abertas para PUBLIC (mesma regra da 20261005140000).
REVOKE EXECUTE ON FUNCTION
  nuflow_videomaker_empresa_executora_regras(),
  nuflow_executor_espelho_regras(),
  nuflow_espelho_ao_revogar(),
  nuflow_demandas_videomaker_revoga_espelho(),
  nuflow_empresa_executora_revoga_espelho()
FROM PUBLIC;

-- ── 8) Trava de saída ───────────────────────────────────────────────────────
DO $$
DECLARE
  n INT;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'executor_espelho') THEN
    RAISE EXCEPTION 'Abortado: executor_espelho sem RLS.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'executor_espelho_por_org') THEN
    RAISE EXCEPTION 'Abortado: política executor_espelho_por_org não foi criada.';
  END IF;
  SELECT count(*) INTO n FROM pg_trigger
  WHERE NOT tgisinternal AND tgname IN (
    'videomaker_empresa_executora_regras', 'executor_espelho_regras', 'espelho_ao_revogar',
    'demandas_videomaker_revoga_espelho', 'empresa_executora_revoga_espelho');
  IF n <> 5 THEN
    RAISE EXCEPTION 'Abortado: esperava 5 gatilhos novos, encontrei %.', n;
  END IF;
  -- Sem efeito em dado existente: tudo nasce vazio.
  IF EXISTS (SELECT 1 FROM videomaker_organizacao WHERE "organizacaoExecutoraId" IS NOT NULL)
     OR EXISTS (SELECT 1 FROM demanda_compartilhamento WHERE "porVideomakerId" IS NOT NULL) THEN
    RAISE EXCEPTION 'Abortado: coluna nova nasceu preenchida.';
  END IF;
END $$;
