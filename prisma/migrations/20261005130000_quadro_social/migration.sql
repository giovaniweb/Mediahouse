-- Área Social Media do NuFlow: quadro da social, aprovações e equipe.
--
-- ALTER TYPE ... ADD VALUE com IF NOT EXISTS, sozinho na migration, como em
-- 20260813000000_ideia_rascunho e 20261005120000_designer_pendente. O valor
-- novo é a origem da ideia mandada sem login pela área da empresa; o código
-- antigo nunca grava nem filtra por ele. O resto vem em 20261005130100.
ALTER TYPE "OrigemIdeia" ADD VALUE IF NOT EXISTS 'publico';
