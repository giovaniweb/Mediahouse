-- CreateTable
CREATE TABLE "videomaker_organizacao" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "videomakerId" TEXT NOT NULL,
    "status" "StatusVideomaker" NOT NULL DEFAULT 'ativo',
    "valorDiaria" DOUBLE PRECISION,
    "observacoes" TEXT,
    "emListaNegra" BOOLEAN NOT NULL DEFAULT false,
    "listaNegraMotivo" TEXT,
    "podeEditar" BOOLEAN NOT NULL DEFAULT false,
    "tipoContrato" TEXT NOT NULL DEFAULT 'externo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "videomaker_organizacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "videomaker_dados_fiscais" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "videomakerId" TEXT NOT NULL,
    "cpfCnpj" TEXT,
    "razaoSocial" TEXT,
    "nomeFantasia" TEXT,
    "representante" TEXT,
    "endereco" TEXT,
    "dadosBancarios" TEXT,
    "chavePix" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "videomaker_dados_fiscais_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "videomaker_organizacao_videomakerId_idx" ON "videomaker_organizacao"("videomakerId");

-- CreateIndex
CREATE UNIQUE INDEX "videomaker_organizacao_organizacaoId_videomakerId_key" ON "videomaker_organizacao"("organizacaoId", "videomakerId");

-- CreateIndex
CREATE INDEX "videomaker_dados_fiscais_videomakerId_idx" ON "videomaker_dados_fiscais"("videomakerId");

-- CreateIndex
CREATE UNIQUE INDEX "videomaker_dados_fiscais_organizacaoId_videomakerId_key" ON "videomaker_dados_fiscais"("organizacaoId", "videomakerId");

-- AddForeignKey
ALTER TABLE "videomaker_organizacao" ADD CONSTRAINT "videomaker_organizacao_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videomaker_organizacao" ADD CONSTRAINT "videomaker_organizacao_videomakerId_fkey" FOREIGN KEY ("videomakerId") REFERENCES "videomakers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videomaker_dados_fiscais" ADD CONSTRAINT "videomaker_dados_fiscais_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videomaker_dados_fiscais" ADD CONSTRAINT "videomaker_dados_fiscais_videomakerId_fkey" FOREIGN KEY ("videomakerId") REFERENCES "videomakers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

