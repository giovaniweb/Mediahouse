-- Editor e Designer ganham as mesmas 3 camadas do Videomaker.
--
-- Perfil (`editores`, `designers`) é da REDE: nome, habilidades, portfólio,
-- avaliação, fazCaptacao — o que qualquer empresa vê sob RLS.
-- Vínculo é da EMPRESA: salário, diária, carga alocada, bloqueio.
-- Fiscais é da EMPRESA, com PIX e dados bancários cifrados na aplicação.
--
-- ADITIVA DE PROPÓSITO. Nada é apagado aqui: `editores.organizacaoId` e as
-- colunas privadas continuam existindo e são a ORIGEM do backfill
-- (prisma/migrar-editor-designer.ts). O DROP é o último passo da Fase B, com
-- trava própria, depois que o auditor marcar zero.
--
-- Ordem que vale como regra desde 20/08: deploy primeiro, migration depois.
-- Esta é compatível com o código que já está rodando — ele nem sabe que as
-- tabelas existem.


-- CreateTable
CREATE TABLE "editor_organizacao" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "editorId" TEXT NOT NULL,
    "status" "StatusUsuario" NOT NULL DEFAULT 'ativo',
    "salario" DOUBLE PRECISION,
    "valorDiaria" DOUBLE PRECISION,
    "cargaLimite" INTEGER NOT NULL DEFAULT 5,
    "observacoes" TEXT,
    "emListaNegra" BOOLEAN NOT NULL DEFAULT false,
    "listaNegraMotivo" TEXT,
    "tipoContrato" TEXT NOT NULL DEFAULT 'interno',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "editor_organizacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "editor_dados_fiscais" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "editorId" TEXT NOT NULL,
    "cpfCnpj" TEXT,
    "razaoSocial" TEXT,
    "nomeFantasia" TEXT,
    "representante" TEXT,
    "endereco" TEXT,
    "dadosBancarios" TEXT,
    "chavePix" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "editor_dados_fiscais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "designer_organizacao" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "designerId" TEXT NOT NULL,
    "status" "StatusUsuario" NOT NULL DEFAULT 'ativo',
    "salario" DOUBLE PRECISION,
    "valorDiaria" DOUBLE PRECISION,
    "observacoes" TEXT,
    "emListaNegra" BOOLEAN NOT NULL DEFAULT false,
    "listaNegraMotivo" TEXT,
    "tipoContrato" TEXT NOT NULL DEFAULT 'externo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "designer_organizacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "designer_dados_fiscais" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "designerId" TEXT NOT NULL,
    "cpfCnpj" TEXT,
    "razaoSocial" TEXT,
    "nomeFantasia" TEXT,
    "representante" TEXT,
    "endereco" TEXT,
    "dadosBancarios" TEXT,
    "chavePix" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "designer_dados_fiscais_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "editor_organizacao_editorId_idx" ON "editor_organizacao"("editorId");

-- CreateIndex
CREATE UNIQUE INDEX "editor_organizacao_organizacaoId_editorId_key" ON "editor_organizacao"("organizacaoId", "editorId");

-- CreateIndex
CREATE INDEX "editor_dados_fiscais_editorId_idx" ON "editor_dados_fiscais"("editorId");

-- CreateIndex
CREATE UNIQUE INDEX "editor_dados_fiscais_organizacaoId_editorId_key" ON "editor_dados_fiscais"("organizacaoId", "editorId");

-- CreateIndex
CREATE INDEX "designer_organizacao_designerId_idx" ON "designer_organizacao"("designerId");

-- CreateIndex
CREATE UNIQUE INDEX "designer_organizacao_organizacaoId_designerId_key" ON "designer_organizacao"("organizacaoId", "designerId");

-- CreateIndex
CREATE INDEX "designer_dados_fiscais_designerId_idx" ON "designer_dados_fiscais"("designerId");

-- CreateIndex
CREATE UNIQUE INDEX "designer_dados_fiscais_organizacaoId_designerId_key" ON "designer_dados_fiscais"("organizacaoId", "designerId");

-- AddForeignKey
ALTER TABLE "editor_organizacao" ADD CONSTRAINT "editor_organizacao_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editor_organizacao" ADD CONSTRAINT "editor_organizacao_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "editores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editor_dados_fiscais" ADD CONSTRAINT "editor_dados_fiscais_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editor_dados_fiscais" ADD CONSTRAINT "editor_dados_fiscais_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "editores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designer_organizacao" ADD CONSTRAINT "designer_organizacao_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designer_organizacao" ADD CONSTRAINT "designer_organizacao_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES "designers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designer_dados_fiscais" ADD CONSTRAINT "designer_dados_fiscais_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designer_dados_fiscais" ADD CONSTRAINT "designer_dados_fiscais_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES "designers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

