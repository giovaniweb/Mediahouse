# NuFlow — teste real local

26/09/2026. Nenhum commit, push ou deploy nesta rodada.

## Acesso

- Aplicação: http://127.0.0.1:3108/login
- Visual novo depois do login: http://127.0.0.1:3108/demandas?visual=novo
- Conta principal: `admin-a@nuflow.test`
- Outra empresa: `admin-b@nuflow.test`
- Contas solicitantes: `solicitante-a@nuflow.test` e `solicitante-b@nuflow.test`
- Senha exclusiva de demonstração: `NuFlow-Local-2026!`

Essas contas existem apenas neste banco local. Não usar esta senha em produção.

## Ambiente

PostgreSQL 17 instalado pelo Homebrew. Cluster exclusivo em `/Users/giovanigomes/MediaHouse/.nuflow-local/pgdata`, escutando somente 127.0.0.1:55437, banco `nuflow_local`. Nenhum serviço de inicialização automática foi habilitado. Todas as migrations do repositório foram aplicadas com sucesso nesse banco vazio.

Credenciais aleatórias do banco e autenticação em `.env.local`, ignorado pelo Git, permissões 0600. Empresas e usuários sintéticos, sem cópia de dados de clientes. Não foram configurados WhatsApp, e-mail, Drive ou Supabase externos.

O servidor Next usa o build existente, porta 3108. O servidor antigo da porta 3107 é o preview com APIs simuladas; para teste real usar 3108.

## Testes realizados sem mocks de API

Roteiro: `scripts/qa/local-real.cjs`.

- Login pela tela e senha bcrypt real, sem injetar cookie/JWT.
- Login separado em duas organizações e leitura de demandas isoladas.
- PATCH de posição no Kanban e nova leitura confirmando persistência.
- Tentativa de alterar card da outra organização recusada.
- Agenda: criação, leitura, atualização e exclusão com HTTP e PostgreSQL reais.
- Evento de A ausente na lista de B; exclusão por B recusada.
- Navegação em Demandas, Growth, dashboard, Agenda, Aprovações, Pessoas e Configurações com backend real. Sem exceções JavaScript detectadas.
- Capturas em `/tmp/nuflow-real-qa`; log `/tmp/nuflow-real-qa.log`.

## Limites

RLS_ATIVO=nao neste primeiro ambiente: foi verificado o isolamento das APIs nos cenários descritos, não a proteção de RLS usando roles restritos. Integrações externas, uploads, pagamentos, recuperação de senha por e-mail e cobertura exaustiva de todos os papéis ainda não foram testados. As filas sem registros não provam operações de aprovação. O resultado não equivale a homologação completa de produção.

## Reiniciar

Banco (se estiver parado):

```sh
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D /Users/giovanigomes/MediaHouse/.nuflow-local/pgdata -l /Users/giovanigomes/MediaHouse/.nuflow-local/postgres.log -o '-h 127.0.0.1 -p 55437 -k /Users/giovanigomes/MediaHouse/.nuflow-local' start
```

Aplicação, a partir da pasta `nuflow-kanban-preview`:

```sh
./node_modules/.bin/next start --hostname 127.0.0.1 --port 3108
```

Não rodar novamente `scripts/local/setup.cjs`: ele é o provisionamento inicial e recusa sobrescrever `.env.local`. O seed possui trava para o banco local de teste, é reutilizável e restaura as senhas de demonstração.
