-- Privado por padrão; nenhuma publicação retroativa automática.
ALTER TABLE "arquivos"
  ADD COLUMN "publicadoEm" TIMESTAMP(3),
  ADD COLUMN "publicadoPor" TEXT,
  ADD COLUMN "revogadoEm" TIMESTAMP(3),
  ADD COLUMN "revogadoPor" TEXT,
  ADD COLUMN "publicacaoUrl" TEXT,
  ADD COLUMN "publicacaoThumbnailUrl" TEXT;
-- RLS/grants existentes de arquivos continuam em vigor (sem tabela nova).
