-- Gravações Externas: o tipo da gravação, o brinde e o que mais levar (29/10/2026).
--
-- O pedido que chega no WhatsApp já diz o tipo ("Treinamento presencial
-- Supreme" é entrega de equipamento). A Débora pediu o brinde no pedido e no
-- detalhe: quase toda entrega de equipamento leva (caixa mineira), demonstração,
-- conteúdo e evento não. `temBrinde` diz se leva, `brinde` diz qual (opcional),
-- `levar` é o resto, em texto livre.
--
-- Aditiva: colunas novas e nulas, sem default nem backfill. O código antigo não
-- lê nem grava, então pode rodar antes do deploy.
CREATE TYPE "TipoGravacao" AS ENUM ('entrega_equipamento', 'demonstracao', 'conteudo', 'evento');

ALTER TABLE "demandas"
  ADD COLUMN "tipoGravacao" "TipoGravacao",
  ADD COLUMN "temBrinde" BOOLEAN,
  ADD COLUMN "brinde" TEXT,
  ADD COLUMN "levar" TEXT;
