-- Aditiva; nenhuma substituição de mídia/URL existente. RLS de arquivos preservada.
ALTER TABLE arquivos
  ADD COLUMN "previewObjectKey" TEXT,
  ADD COLUMN "previewSha256" TEXT,
  ADD COLUMN "previewTamanho" INTEGER,
  ADD COLUMN "previewFonteVersao" INTEGER,
  ADD COLUMN "previewJobId" TEXT;
