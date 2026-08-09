-- DropIndex
DROP INDEX "permissoes_usuario_usuarioId_key";

-- AlterTable
ALTER TABLE "permissoes_usuario" ADD COLUMN     "organizacaoId" TEXT;

-- CreateIndex
CREATE INDEX "permissoes_usuario_organizacaoId_idx" ON "permissoes_usuario"("organizacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "permissoes_usuario_usuarioId_organizacaoId_key" ON "permissoes_usuario"("usuarioId", "organizacaoId");

-- AddForeignKey
ALTER TABLE "permissoes_usuario" ADD CONSTRAINT "permissoes_usuario_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: cada linha de permissão passa a pertencer à empresa do usuário.
-- Hoje todos os usuários têm exatamente uma membership, então o mapeamento é
-- 1:1 e sem ambiguidade. A ordenação por createdAt define a empresa "principal"
-- caso um usuário venha a ter mais de uma antes desta migration rodar em algum
-- ambiente — nesse caso as demais precisam de uma linha própria, criada pela
-- aplicação quando as permissões forem editadas naquela empresa.
UPDATE "permissoes_usuario" pu
   SET "organizacaoId" = (
     SELECT m."organizacaoId"
       FROM "usuario_organizacao" m
      WHERE m."usuarioId" = pu."usuarioId"
      ORDER BY m."createdAt" ASC
      LIMIT 1
   )
 WHERE pu."organizacaoId" IS NULL;
