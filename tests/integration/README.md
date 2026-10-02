# Integração sintética

Use PostgreSQL descartável em IP loopback e banco `nuflow_test` (ou sufixo `_teste`). Nunca use cópia de produção. O runner recusa outro host, porta ausente, nome de banco incompatível, parâmetros de conexão e ausência de URL explícita. Não herda variáveis de serviços externos.

```sh
DATABASE_URL_TEST=postgresql://postgres@127.0.0.1:55439/nuflow_test npm run test:integration:prepare
DIRECT_URL=postgresql://teste:teste@127.0.0.1:1/teste npx prisma generate
DATABASE_URL_TEST=postgresql://postgres@127.0.0.1:55439/nuflow_test npm run test:integration
DATABASE_URL_TEST=postgresql://postgres@127.0.0.1:55439/nuflow_test node scripts/teste-integracao.mjs rls
```

O PostgreSQL precisa estar iniciado e o banco criado antes desses comandos. Na execução de 26/09 foi usado um cluster exclusivo em `/private/tmp/nuflow-melhorias-pg`, PostgreSQL 17, porta 55439. O preview usa outro ambiente e não deve ser reinicializado por este roteiro.

A suíte cria fixtures identificadas por UUID, chama handlers reais e limpa seus registros no final. A sessão é simulada; Prisma e banco não são mocks. Fetch externo é bloqueado e o módulo de IA é substituído. O ensaio RLS usa SET LOCAL ROLE app_user dentro de transação sintética e rollback. Isso não certifica login de navegador, credencial de produção, entregas WhatsApp, Drive, Storage ou IA real.

CI executa esta suíte após aplicar migrations no PostgreSQL efêmero do job, antes da comparação de schema. O job de CI remoto ainda precisa rodar na futura PR.
