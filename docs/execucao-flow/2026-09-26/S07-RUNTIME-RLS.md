# S07 — isolamento comprovado no runtime local

Implementado e ensaiado em PostgreSQL descartável. Não há alteração de credenciais, flag ou deploy em produção. O aceite externo continua condicionado à homologação com as conexões efetivamente usadas pelo provedor.

## O que mudou

- `prisma-rls.ts` contém a extensão usada pelo runtime e pelo ensaio. O cliente fornecido é a fonte de todas as operações; testes não trocam role dentro de uma conexão de administrador.
- Consultas normais, SQL parametrizado/unsafe e transações declaram `app.org_id` com `SET LOCAL` na mesma conexão. Ausência de empresa declara valor vazio, inclusive quando houver resíduo anterior na sessão do pool.
- Transações em lote preservam a ordem dos resultados e rollback. Callback recebe `tx` sem extensão; consultas feitas pelo cliente global continuam passando pela declaração de contexto. A marca de lote não é aplicada ao callback inteiro.
- Para atomicidade dentro de callback, usar **somente `tx`**. Consultar o cliente global inicia operação independente, pode usar outra conexão e não participa do rollback do callback. Não misturar esse padrão em fluxos de negócio; com pool de uma conexão, uma operação global aguardada dentro da transação pode esgotar o tempo de espera.
- Com `RLS_ATIVO=sim`, conexões de app, autenticação e administração precisam estar explícitas. Auth/admin não herdam silenciosamente `DATABASE_URL` ou `DIRECT_URL`. Modo legado sem a flag permanece disponível para a transição controlada.
- `test:runtime` cria logins temporários herdando `app_user`/`app_auth`, sem superuser, bypass, ownership ou permissão de criar roles. Conecta diretamente por esses logins, testa e remove fixtures/logins. A conexão administrativa é usada somente no preparo/limpeza do banco descartável.
- O runner aceita somente IP loopback, porta explícita e banco `nuflow_test`; não herda segredos de provedores. A configuração Vitest recusa conexão runtime fora do mesmo banco ou sem login temporário.
- O CI passa a executar essa prova após as migrações, além do verificador SQL existente.

## Recuperação de senha sob role restrito

O ensaio real revelou que `app_auth` podia ler o token mas não atualizar a senha. A primeira proposta de concessão direta foi rejeitada pela revisão automática por ser ampla demais; não foi aplicada.

A solução final é a migração `20260929010000_auth_reset_por_token`: função `redefinir_senha_por_token`, executável por `app_auth`, com busca fixa em `public`, sem SQL dinâmico e sem execução pública. Exige hash bcrypt bem formado e token existente, não expirado e não consumido. Bloqueia a linha do token, troca a senha e marca o uso atomicamente. Duas tentativas concorrentes produzem um único sucesso.

`app_auth` continua sem UPDATE direto em `usuarios`, inclusive senha e superAdmin. O handler calcula o hash e chama a função. As capacidades existentes de emissão/leitura de tokens permanecem restritas ao caminho confiável de autenticação; isso não substitui autorização/rate limit no HTTP. Não conceder essa função a `app_user`.

## Provas locais

16 cenários com conexões reais restritas: identidade do login e ausência de bypass/ownership; A/B concorrentes em pool de duas conexões; consulta sem empresa; joins de arquivos/histórico; SQL direto; transações em lote/callback; rollback de nested writes e lote; escrita indevida negada; consulta global durante callback; resolução de login/empresa; bootstrap público e handler de acompanhamento; estado OAuth isolado e consumido uma vez; recuperação de senha positiva/negativa/concorrente; resíduo de sessão com pool de uma conexão; parceria revogada.

Não foi necessário mock de banco para essas provas. `fetch` fica bloqueado. OAuth aqui cobre o estado/callback de banco, não uma autorização real do Google. Não há nova tabela de auditoria neste cartão: a tabela central continua prevista em S08; o histórico existente foi incluído no teste de joins.

## Ordem para homologação e publicação

1. Aplicar as migrações pendentes com a conexão exclusiva de migração. A função de senha deve existir antes de subir o handler novo.
2. Preparar credenciais distintas para app (`app_user` ou login que herde somente esse papel), auth (`app_auth`) e administração técnica. Não alterar senhas/roles manualmente a partir de uma conexão de produção sem o lote de implantação autorizado.
3. Configurar `DATABASE_URL`, `AUTH_DATABASE_URL` e `ADMIN_DATABASE_URL` explicitamente. `DIRECT_URL` pertence ao caminho de migração, não ao tráfego normal. As quatro rotas atuais que usam `prismaAdmin` possuem `requireSuperAdmin`; a credencial administrativa segue privilegiada e não deve ser importada em fluxos comuns.
4. Ativar `RLS_ATIVO=sim` na mesma implantação que fornece as conexões corretas. A flag com conexão de dono **não comprova isolamento**. Também não trocar apenas a conexão, deixando a flag desligada: consultas legítimas perderiam contexto.
5. Executar `npm run verificar:runtime` no ambiente de homologação, fornecendo explicitamente as conexões de app/auth e `RLS_ATIVO=sim`. O script é somente leitura, não lê `.env`, não troca role e não imprime URLs, senhas ou nomes dos logins. Falha se detectar propriedade de tabelas, associação a papel privilegiado, grants inadequados ou RLS ausente nas tabelas verificadas. É um diagnóstico dirigido, não uma auditoria exaustiva de grants/funções do banco.
6. Repetir os fluxos de login, recuperação de senha, troca de empresa, OAuth, acompanhamento, mídia e parceiros via HTTP e pelo pool real do provedor. Validar também administração técnica e tarefas de fundo. Confirmar transações e latência com o pool configurado na hospedagem; o ensaio local usa pg direto, não substitui Supavisor/PgBouncer.
7. Registrar resultados sem exportar segredos. Só então considerar L02. Se faltar uma credencial real, manter a evidência externa pendente.

## Operação e limites

- A extensão gera transação por consulta fora de um callback: não se afirma redução de latência/custo sem medição do pool real.
- `prismaBase` não é um bypass de privilégios: usa a mesma credencial restrita do runtime, mas não declara empresa automaticamente. Reservá-lo para bootstrap estreito por função de credencial. Contextos de sessão devem usar `prisma`/`comOrg`.
- RLS protege fronteiras de empresa; não substitui as capacidades e o escopo individual da S01/S03/S06.
- A flag e as conexões reais continuam inalteradas. Este lote não certifica que o site publicado já usa esses roles.
- Rollback: manter a migração aditiva e a função. Reverter handler para escrita direta quebra recuperação de senha sob `app_auth`. Corrigir em frente; não resolver incidente concedendo UPDATE irrestrito ou reintroduzindo conexão de dono no tráfego normal.
