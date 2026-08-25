-- Fabricante deixa de ser global e passa a ser de UMA empresa.
--
-- A tabela nasceu quando havia um cliente só: os 7 fabricantes cadastrados pela
-- Contourline apareciam para qualquer outra empresa da plataforma. Mesmo padrão
-- que videomaker, editor e designer tinham.
--
-- O backfill vem JUNTO e no meio: sem ele, a coluna nasceria nula e o filtro por
-- empresa esconderia os 7 de todo mundo — inclusive de quem os cadastrou.
-- Conferido antes: nenhum fabricante é usado por mais de uma empresa, então a
-- origem é inequívoca.

-- 1) coluna, ainda sem dono
ALTER TABLE "fabricantes" ADD COLUMN "organizacaoId" TEXT;

-- 2) dono vem dos produtos que o referenciam
UPDATE "fabricantes" f
SET "organizacaoId" = sub."organizacaoId"
FROM (
  SELECT p."fabricanteId" AS id, MIN(p."organizacaoId") AS "organizacaoId"
  FROM "produtos" p
  WHERE p."fabricanteId" IS NOT NULL AND p."organizacaoId" IS NOT NULL
  GROUP BY p."fabricanteId"
) sub
WHERE f.id = sub.id;

-- 3) fabricante sem produto nenhum não tem origem para inferir. Fica sem dono e
--    invisível para todos — é o mesmo efeito de estar inativo, e não apaga nada.
--    Reportado no PR; se aparecer algum, resolver à mão.

-- 4) o nome era único GLOBALMENTE, o que impediria duas empresas de terem um
--    fabricante homônimo — exatamente o que a multiempresa precisa permitir
DROP INDEX "fabricantes_nome_key";

CREATE INDEX "fabricantes_organizacaoId_idx" ON "fabricantes"("organizacaoId");
CREATE UNIQUE INDEX "fabricantes_organizacaoId_nome_key" ON "fabricantes"("organizacaoId", "nome");

ALTER TABLE "fabricantes" ADD CONSTRAINT "fabricantes_organizacaoId_fkey"
  FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5) trava: se sobrou fabricante COM produto e SEM dono, algo deu errado no
--    passo 2 e o DROP do índice já aconteceu. Aborta a transação inteira.
DO $$
DECLARE orfaos INT;
BEGIN
  SELECT COUNT(*) INTO orfaos
  FROM "fabricantes" f
  WHERE f."organizacaoId" IS NULL
    AND EXISTS (SELECT 1 FROM "produtos" p WHERE p."fabricanteId" = f.id);
  IF orfaos > 0 THEN
    RAISE EXCEPTION 'Abortado: % fabricante(s) com produto e sem organização — o backfill não os alcançou.', orfaos;
  END IF;
END $$;

-- ── O campo "Fabricante" vira opcional por empresa ───────────────────────────
--
-- Ele só faz sentido para quem vende produto físico. Empresa de serviço cadastra
-- "Captação de Vídeo" e "Edição de Reels" — fabricante ali é campo vazio pedindo
-- para ser preenchido com nada.
--
-- Padrão FALSE: cliente novo nunca vê o campo. Empresa sem linha de
-- config_empresa também conta como false, e é o caso da empresa-teste e do
-- Nuflow do Giovani — nenhuma das duas tem um único produto com fabricante.
ALTER TABLE "config_empresa"
  ADD COLUMN "catalogoMostrarFabricante" BOOLEAN NOT NULL DEFAULT false;

-- Quem JÁ usa continua vendo. Só a Contourline se encaixa (31 produtos).
UPDATE "config_empresa" ce
SET "catalogoMostrarFabricante" = true
WHERE EXISTS (
  SELECT 1 FROM "produtos" p
  WHERE p."organizacaoId" = ce."organizacaoId" AND p."fabricanteId" IS NOT NULL
);
