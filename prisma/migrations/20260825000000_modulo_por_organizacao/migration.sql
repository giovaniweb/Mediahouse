-- Módulo ligado/desligado por empresa — a base dos planos.
-- Aditiva: a ausência de linha significa "use o padrão do catálogo",
-- então nenhuma empresa muda de comportamento ao aplicar esta migration.


-- CreateTable
CREATE TABLE "modulo_organizacao" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modulo_organizacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "modulo_organizacao_organizacaoId_idx" ON "modulo_organizacao"("organizacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "modulo_organizacao_organizacaoId_modulo_key" ON "modulo_organizacao"("organizacaoId", "modulo");

-- AddForeignKey
ALTER TABLE "modulo_organizacao" ADD CONSTRAINT "modulo_organizacao_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

