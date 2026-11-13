-- VOLTA da migration 20261127120000_videomakers_da_rede_por_empresa.
--
-- Apaga as linhas do módulo "rede" de TODAS as empresas — as que a migration
-- criou e as que o super-admin ligou ou desligou depois na tela de empresas.
-- Para guardar as decisões antes:
--   SELECT o."slug", m."ativo", m."updatedAt" FROM "modulo_organizacao" m
--     JOIN "organizacoes" o ON o."id" = m."organizacaoId" WHERE m."modulo" = 'rede';
--
-- ORDEM: só depois de o código desta mudança sair do ar. Com o código novo no
-- ar e sem as linhas, todas as empresas ficam sem a rede (padrão desligado),
-- inclusive a Contourline. Com o código velho, as linhas não fazem nada e
-- apagá-las não muda comportamento nenhum.
--
-- Escrita em produção: roda só com o sim do Giovani, numa transação única
-- (`psql -1`). Não mexe em _prisma_migrations.

DELETE FROM "modulo_organizacao" WHERE "modulo" = 'rede';
