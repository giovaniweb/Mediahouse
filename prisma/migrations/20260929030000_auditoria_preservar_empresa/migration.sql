-- DELETE na organização também apaga eventos por cascade. Somente o caminho
-- administrativo (prismaAdmin) pode excluir empresas; o runtime comum não pode
-- usar a exclusão do pai para contornar o append-only da auditoria.
REVOKE DELETE ON "organizacoes" FROM app_user;
