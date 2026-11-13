-- Videomakers da rede por empresa (13/11/2026, pedido do Giovani).
--
-- Até aqui toda empresa via, buscava e escalava os videomakers da rede (os que
-- não são dela). Agora isso é um módulo, "rede" (src/lib/modulos.ts), ligado por
-- empresa pelo super-admin, e o padrão do catálogo é DESLIGADO: empresa nova
-- nasce só com os próprios videomakers.
--
-- Só dados, nenhuma tabela ou coluna nova. Para ninguém perder o que já tinha:
--   - toda empresa que existe hoje ganha a linha "rede" LIGADA (como antes);
--   - menos a GH Produção (slug gh-producao), que fica DESLIGADA: o Gabriel não
--     quer ver os videomakers da rede, só os dele.
-- Empresa que já tiver uma linha "rede" (decidida à mão) não é tocada.
--
-- ORDEM: aplicar ANTES do código subir. Com o código novo e sem estas linhas,
-- todas as empresas ficariam sem a rede (padrão desligado), inclusive a
-- Contourline. Com as linhas e o código velho, nada muda (o código velho não lê
-- o módulo "rede").
--
-- Volta: scripts/volta/20261127120000_videomakers_da_rede_por_empresa.sql

INSERT INTO "modulo_organizacao" ("id", "organizacaoId", "modulo", "ativo", "createdAt", "updatedAt")
SELECT 'rede_' || md5(o."id"), o."id", 'rede', (o."slug" <> 'gh-producao'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "organizacoes" o
ON CONFLICT ("organizacaoId", "modulo") DO NOTHING;

-- Trava de saída: toda empresa tem a linha "rede"; a GH (se existir) desligada.
DO $$
DECLARE
  sem_linha INTEGER;
  gh_ligada INTEGER;
BEGIN
  SELECT count(*) INTO sem_linha FROM "organizacoes" o
   WHERE NOT EXISTS (SELECT 1 FROM "modulo_organizacao" m WHERE m."organizacaoId" = o."id" AND m."modulo" = 'rede');
  IF sem_linha > 0 THEN
    RAISE EXCEPTION 'videomakers da rede: % empresa(s) sem a linha "rede"', sem_linha;
  END IF;
  SELECT count(*) INTO gh_ligada FROM "modulo_organizacao" m JOIN "organizacoes" o ON o."id" = m."organizacaoId"
   WHERE o."slug" = 'gh-producao' AND m."modulo" = 'rede' AND m."ativo" AND m."id" = 'rede_' || md5(o."id");
  IF gh_ligada > 0 THEN
    RAISE EXCEPTION 'videomakers da rede: a GH Produção ficou com a rede ligada';
  END IF;
END $$;
