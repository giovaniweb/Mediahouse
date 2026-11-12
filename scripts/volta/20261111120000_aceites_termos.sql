-- VOLTA da migration 20261111120000_aceites_termos (Onda 3).
--
-- Tira a tabela de aceites dos documentos jurídicos. ATENÇÃO: os aceites
-- registrados até aqui são a prova de que cada pessoa aceitou os Termos e a
-- Política de Privacidade — apagar a tabela apaga essa prova. Antes, faça um
-- dump dela (pg_dump -t aceites_termos) e guarde.
--
-- Só rode depois de o código que grava aceite sair do ar: com a tabela ausente
-- o painel segue abrindo (a falha do aceite é aberta), mas o cadastro público
-- de profissional passa a falhar (perfil e aceite gravam na mesma transação).
--
-- Escrita em produção: roda só com o sim do Giovani, numa transação única
-- (`psql -1`). Não mexe em _prisma_migrations.

DROP POLICY IF EXISTS "aceites_termos_org" ON "aceites_termos";
DROP TABLE IF EXISTS "aceites_termos";
