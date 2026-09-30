-- Aditiva: legado continua nulo; nenhuma URL ou objeto existente é alterado.
-- RLS/grants de arquivos permanecem em vigor; organização vem da demanda.
ALTER TABLE "arquivos"
  ADD COLUMN "fonteProvedor" TEXT,
  ADD COLUMN "fonteBucket" TEXT,
  ADD COLUMN "fonteObjectKey" TEXT,
  ADD COLUMN "fonteReferencia" TEXT,
  ADD COLUMN "fonteVersao" INTEGER,
  ADD COLUMN "fonteMimeDeclarado" TEXT,
  ADD COLUMN "fonteSha256" TEXT;
ALTER TABLE "arquivos" ADD CONSTRAINT "arquivos_fonte_versao_positiva"
  CHECK ("fonteVersao" IS NULL OR "fonteVersao" > 0);
