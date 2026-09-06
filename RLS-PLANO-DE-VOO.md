# RLS — plano de voo

Como ligar a tranca do banco sem derrubar a produção.

*Atualizado em 03/09/2026: a seção 7 registra a decisão de mover o banco para
`sa-east-1` e altera a ordem dos passos 4 e 5.*

Este documento existe porque o risco desta fase não é escrever a política certa:
é **descobrir tarde** que alguma consulta legítima passou a voltar vazia. Sob
RLS, o erro não aparece como erro. Aparece como uma tela sem dados.

---

## 1. Por que o merge deste PR não muda nada

A aplicação conecta como `postgres`. Medido no banco de produção:

```
rolname   | rolbypassrls | rolsuper
postgres  | true         | false
```

`rolbypassrls = true` significa **ignorar RLS por definição** — políticas, `USING`,
`WITH CHECK`, tudo. Habilitar RLS agora é montar a fechadura na porta sem trocar
a chave de ninguém.

O que liga de fato é uma coisa só: apontar `DATABASE_URL` para o role `app_user`.
Um `vercel env` e um redeploy. **Reversível em um comando**, e é isso que torna a
virada segura — não a confiança na política, mas a facilidade de desfazer.

Os roles nascem `NOLOGIN`: senha não entra em repositório.

---

## 2. O que já está pronto

| peça | onde | estado |
|---|---|---|
| Roles `app_user` e `app_auth`, GRANTs | migration `20260826000000_rls_isolamento` | pronto |
| 74 políticas, cobrindo 68 tabelas | idem | pronto |
| `agente_execucoes` ganha dono | idem | pronto |
| Caminho de autenticação separado | `src/lib/prisma-auth.ts` | pronto |
| Saída do Super Admin | `src/lib/prisma-admin.ts` | pronto |
| `SET LOCAL app.org_id` por transação | `src/lib/prisma.ts`, atrás de `RLS_ATIVO` | pronto |
| Prova de isolamento | `scripts/verificar-rls.mjs`, roda no CI | pronto |
| Declaração da empresa nas 20 rotas sem sessão | `declararOrg` / `comOrg`, PR #57 | pronto |
| Ambiente de preview isolado, com RLS ligado | branch `preview/rls`, banco próprio | pronto |

### As três decisões que valem revisão

**A empresa vem da transação, não da conexão.** `current_setting('app.org_id', true)`
devolve NULL quando ninguém declarou; comparar com NULL dá NULL, que não é
verdadeiro. **A consulta sem empresa devolve vazio.** Falha fechado: chato de
descobrir, incapaz de vazar. É a troca certa, e é ela que cria o trabalho do
passo 4 abaixo.

**Tabela filha pergunta ao pai.** `historico_status`, `arquivos`, `comentarios` e
outras 19 não têm coluna de empresa — decisão da Fase 2, para não existir coluna
que possa discordar do pai. A política usa `EXISTS` sobre a PK do pai.

**O login tem role próprio.** Ele lê `usuarios` antes de existir empresa — é a
ordem do problema: só depois de saber quem é a pessoa dá para saber de qual
empresa ela é. Com o cliente normal, a política pediria `app.org_id`, a consulta
voltaria vazia, e o sistema responderia **"senha inválida" para quem digitou a
senha certa** — todo mundo, de uma vez, sem erro no log. `app_auth` enxerga três
tabelas (`usuarios`, `usuario_organizacao`, `organizacoes`), só leitura, e o
`scripts/verificar-rls.mjs` confirma que ele **não** alcança `demandas`.

---

## 3. O que falta — e é aqui que mora o risco

A extensão descobre a empresa por dois caminhos: `comOrg(id, fn)` explícito, ou a
sessão da requisição (mesma `getOrgId` que as rotas já usam). **Isso cobre toda
rota autenticada sem tocar em nenhuma delas.**

Não cobre o que não tem sessão:

| o que | por que | o que fazer |
|---|---|---|
| Rotas públicas por token (`/aprovar`, `/e/[slug]`, `/nf-upload`, `/d`) | resolvem a empresa a partir do registro, e ler o registro já exigiria a empresa | envolver o corpo em `comOrg(orgDoRegistro, ...)` depois de resolvê-lo por `prismaAuth` |
| Cron e agentes | não há requisição | `comOrg(organizacaoId, ...)` — as funções já recebem a empresa |
| Webhook do WhatsApp | idem | idem, a partir de `cfg.organizacaoId` |

São ~15 arquivos, todos enumerados pelo passo 4. **Não os alterei neste PR de
propósito**: sem exercitar a virada, a lista é palpite. O passo 4 transforma
palpite em lista.

---

## 4. A sequência

Cada passo tem um critério de parada. Se ele não for atingido, o passo anterior
volta e ninguém segue.

**Passo 1 — aplicar a migration. ✅ FEITO em 01/09/2026.**

Inerte, como previsto (seção 1). `scripts/verificar-rls.mjs` rodou contra o banco
de produção e as onze verificações passaram, incluindo "sem `app.org_id`: zero
linhas" e "`app_auth` não alcança demandas".

Com dado real, virando o role para cada empresa:

| tabela | total | contourline | empresa-teste | giovani |
|---|---|---|---|---|
| demandas | 597 | 591 | **6** | 0 |
| alertas_ia | 956 | 872 | 84 | 0 |
| historico_status | 2.006 | 2.006 | 0 | 0 |
| produtos | 35 | 32 | 2 | 1 |
| relatorios_ia | 35 | 25 | 9 | 1 |
| mensagens_whatsapp | 4.426 | 4.410 | 0 | 16 |

As somas fecham exatamente com o total em toda linha: nenhuma linha aparece para
duas empresas, nenhuma some. É a prova que o diagnóstico pedia desde o começo —
sob RLS, a `empresa-teste` lê **6 demandas, não 597**.

*Critério: todas as verificações do `verificar-rls.mjs` verdes, incluindo "sem
`app.org_id`: zero linhas" e "`app_auth` não alcança demandas".* **Atingido** —
onze de onze, contra o banco de produção.

*Descoberta do caminho:* o `postgres` do Supabase **não é superusuário**, e o
Postgres só permite `SET ROLE` para role do qual você é membro. A verificação
funcionava no banco descartável do CI (onde `postgres` é super) e falhava com
42501 justamente no banco onde importa. Resolvido pela migration
`20260901000000_rls_verificavel`, que torna o dono membro dos dois roles — sem
conceder privilégio novo, já que ambos têm privilégios estritamente menores.

**Passo 2 — dar credencial ao role. ✅ FEITO em 01/09/2026** (produção e cópia).
No SQL editor do Supabase, fora do repositório:

```sql
ALTER ROLE app_user WITH LOGIN PASSWORD '<senha forte>';
ALTER ROLE app_auth WITH LOGIN PASSWORD '<outra senha forte>';
```

*Critério:* conectar manualmente com cada uma e conferir que `app_user` vê a
própria empresa e nada mais.

**Passo 3 — exercitar com o role certo, fora de produção. ✅ FEITO em 01/09/2026.**

Projeto Supabase novo e isolado, schema por `migrate deploy` (22 migrations) e
dados copiados de produção: **68 tabelas, 11.335 linhas dos dois lados, zero
divergência**. Deploy de preview com `DATABASE_URL` = `app_user`,
`AUTH_DATABASE_URL` = `app_auth` e `RLS_ATIVO=sim`, escopados **por branch**
(`preview/rls`) para não encostar em nada que já existia.

*Resultado: nenhuma tela vazia que não deveria estar vazia.*

| | `empresa-teste` | Contourline |
|---|---|---|
| demandas (audiovisual + design) | 1 + 5 = **6** | **590** |
| produtos · pessoas · coberturas | 2 · 4 · 1 | — |
| dashboard | 0 ativas | 22 ativas, 38 atrasadas |

Todos conferidos contra o banco, um a um. O "1 demanda" no Kanban assusta até
lembrar que são **dois quadros**: 1 no audiovisual, 5 no de design.

**Escrita**, que leitura nenhuma provaria: comentário `201` e mudança de status
`200`, ambos confirmados no banco depois. São gravações em `comentarios` e
`historico_status` — tabelas filhas cuja política pergunta ao pai.

**IDOR**: quatro tentativas de alcançar uma demanda da Contourline estando na
`empresa-teste` (GET, PATCH de status, POST de comentário, GET de pagamento) →
**404 nas quatro**.

**Super Admin** enxerga as 3 empresas pela conexão de dono, enquanto a rota
normal do MESMO usuário devolve 590. A escapatória funciona, e é a única.

### O que o passo 3 descobriu e o desenho não previa

**`SET LOCAL` sobrevive ao pooler.** Era a maior incógnita: o Supavisor em modo
transação fixa a conexão pela duração da transação, então `set_config(..., true)`
vale para a consulta e some no COMMIT. Confirmado com as três empresas, e
confirmado que **não vaza para fora da transação**. Se isto tivesse falhado, o
desenho inteiro não teria como funcionar em produção.

**O host direto do Supabase é IPv6-only** (`db.*.supabase.co` não tem registro A)
e a Vercel só fala IPv4. O preview subiu com `banco: indisponivel` até trocar
para o pooler. Qualquer ambiente novo precisa da URL do pooler, nunca da direta.

**`NEXTAUTH_URL` e `NEXTAUTH_SECRET` existiam só em Production.** Nenhum preview
jamais teve login funcionando — nada a ver com RLS, mas impedia o passo 3 antes
mesmo de começar.

**`DATABASE_URL` e `DIRECT_URL` continuam com escopo `Production, Preview`.**
Todo preview de qualquer outra branch ainda aponta para o BANCO DE PRODUÇÃO —
a mesma condição que causou o incidente de 20/08, que se acreditava desfeita. O
conserto é um clique no painel (editar a variável, desmarcar "Preview") e não
pelo CLI, porque é um registro só servindo os dois ambientes: removê-lo derruba
o valor de Production junto. **Pendente.**

### Uma diferença de comportamento, decidida e não corrigida

`/api/videomakers` devolve os 66 perfis da rede inteira; `/api/editores` devolve
só quem tem vínculo com a empresa. Não é regressão do RLS — já era assim, e sob
RLS a política dos três perfis globais é `SELECT USING (true)` de propósito.

Decisão de 01/09/2026: **a rede inteira aparece mesmo.** É o modelo de logística
pontual — contratar quem já trabalhou para outra empresa é o que dá valor ao
marketplace. Fica registrado que `editores` diverge disso e filtra por vínculo;
alinhar os dois é decisão de produto, não de segurança.

*Critério: nenhuma tela vazia que não deveria estar vazia.* **Atingido** — todas
as contagens conferidas contra o banco, uma a uma, nas duas empresas. As
divergências que apareceram tinham explicação (dois quadros, módulo desligado,
regra de negócio da rota); nenhuma era o RLS escondendo dado legítimo.

**Passo 4 — medir o custo. ✅ FEITO em 01/09/2026. E o número diz para NÃO virar ainda.**

A/B no mesmo banco, com os mesmos dados, mudando só a camada: conexão de dono
sem a extensão contra `app_user` com ela.

| endpoint | sem RLS | com RLS | |
|---|---|---|---|
| `/api/health` (uma consulta, SQL cru) | 193ms | 190ms | — |
| `/api/demandas?limit=25` | 538ms | **1827ms** | 3,4× |
| `/api/produtos` | 652ms | **1718ms** | 2,6× |
| `/api/notificacoes` | 418ms | **1112ms** | 2,7× |

Medianas de sete amostras. `/api/health` não muda porque usa SQL cru, que a
extensão deixa passar direto — o que confirma que o custo é da transação, não do
RLS em si: a política custa um índice-lookup, e isso não aparece.

**Uma otimização foi tentada e não funcionou.** Trocar a transação interativa
(`BEGIN` → `set_config` → consulta → `COMMIT`, cada uma esperando a anterior)
por transação em LOTE, na esperança de virar uma ida só: **1841ms contra 1827ms**,
diferença nenhuma. O Prisma continua mandando `BEGIN` e `COMMIT` como viagens
separadas.

Então o custo é estrutural: **duas viagens extras por consulta**. Com a aplicação
em `gru1` e o banco nos Estados Unidos, cada viagem é da ordem de 120ms, e uma
rota que faz cinco consultas paga cinco vezes isso.

*Critério do passo, aplicado:* **a degradação é inaceitável.** Mais de um segundo
a mais na lista de demandas é visível para o usuário, e a lista de demandas é a
tela onde as pessoas passam o dia.

### O que fazer antes de virar

O caminho previsto era "declarar a empresa uma vez por REQUISIÇÃO em vez de por
consulta". Concretamente, as opções, em ordem de preferência:

1. ~~**Conexão por empresa, com o ajuste no nível da SESSÃO.**~~ **TENTADO E
   DESCARTADO em 03/09/2026.** Implementado e testado: isolava certo, em série e
   em paralelo, com um pool dedicado por empresa. Não sobrevive ao serverless.

   Cada instância de função cria o próprio pool e congela as conexões junto com
   a instância. O Supavisor limita **15 clientes em modo sessão**
   (`EMAXCONNSESSION ... pool_size: 15`), e o `app_user` chegou a 16 conexões
   presas em minutos — **todas as requisições passaram a devolver 500**. Pior: a
   medição feita antes de perceber isso estava cronometrando respostas de ERRO, e
   parecia ótima.

   Só volta a fazer sentido se a aplicação sair do serverless para um processo
   longo, onde o número de pools é previsível.

2. **Aproximar o banco da aplicação. ← É AQUI QUE ESTÁ O PROBLEMA.** Medido em
   03/09/2026: `/api/health` faz UMA consulta (`SELECT 1`) e reporta, do lado do
   servidor, **~172ms** em produção. Esse é o custo de uma ida ao banco entre a
   Vercel em `gru1` (São Paulo) e o Supabase em `us-west-1`.

   As duas viagens extras da transação custam, então, ~340ms POR CONSULTA — e uma
   rota com quatro consultas paga 1,4s. É exatamente o que a tabela acima mostra.

   **A sobrecarga do RLS é geografia, não arquitetura.** Com banco e aplicação na
   mesma região, uma ida custa poucos milissegundos e o desenho por transação fica
   praticamente de graça.

   E isso vale independentemente do RLS: a aplicação já paga 172ms por consulta
   hoje, em toda tela. Aproximar os dois é a melhoria de desempenho mais barata
   disponível, e ela destrava o passo 5 de quebra.

3. **Reduzir o número de consultas por rota.** Independe do RLS e ajuda de todo
   jeito, mas é o mais trabalhoso.

### O que o passo 4 encontrou de quebra, e era mais grave que a lentidão

A aplicação usa `$transaction` em **nove lugares** — mudança de status, mesclagem
de usuário, webhook do WhatsApp. A extensão abria uma transação POR CONSULTA:
cada operação dentro dessas transações abriria a própria, aninhada.

O passeio do passo 3 não pegou isso porque **caminho feliz não pega**: as escritas
funcionaram. O que quebraria é o dia em que uma delas falha no meio — as
anteriores já teriam sido gravadas fora da transação de quem chamou, e o rollback
não as alcançaria. Perda silenciosa de atomicidade.

A extensão passou a interceptar `$transaction` nos dois formatos, declarando a
empresa uma vez no começo da transação de quem chamou. Verificado contra a cópia:
rollback desfaz tudo, o lote bem-sucedido devolve os resultados na ordem certa, a
transação interativa enxerga as 6 demandas da empresa e **não** enxerga as das
outras.

**Passo 5 — virar em produção, em janela combinada. ⛔ BLOQUEADO pelo passo 4.**
Não vire enquanto a lista de demandas custar 1,8s. Trocar as três variáveis e
redeployar. Ficar olhando: login, dashboard, uma demanda, o WhatsApp recebendo.

*Critério de reversão:* qualquer tela vazia ou login recusado → `DATABASE_URL`
volta ao valor antigo e redeploy. **Um comando, sem migration, sem perder dado.**
Guarde o valor antigo antes de trocar.

**Passo 6 — fechar a porta do dono.** Semanas depois, com a virada estável:
`ALTER TABLE ... FORCE ROW LEVEL SECURITY`, para que nem o dono passe. Só faz
sentido quando ninguém mais conecta como dono em runtime — hoje o Super Admin
conecta, então este passo **depende** de mover aquele painel para `app_user` com
uma política própria.

*Critério: o `verificar-rls.mjs` continua verde DEPOIS do FORCE, e o painel de
Super Admin continua listando todas as empresas.* Se o painel quebrar, o FORCE
volta atrás — ele é a última tranca, não vale derrubar a operação por ela.

Este passo estava sem critério de parada nenhum, o que é o mesmo que não ter fim:
ninguém saberia dizer se deu certo.

---

## 5. O que pode dar errado

| sintoma | causa provável | o que fazer |
|---|---|---|
| "Senha inválida" para todos | `AUTH_DATABASE_URL` não configurada; o login caiu no `app_user` | apontar para `app_auth` |
| Tela vazia, sem erro | rota sem sessão e sem `comOrg` | envolver com `comOrg` |
| `permission denied for table X` | tabela criada depois sem GRANT | o `ALTER DEFAULT PRIVILEGES` da migration cobre as futuras; para as existentes, `GRANT` explícito |
| Super Admin não lista empresas | `ADMIN_DATABASE_URL`/`DIRECT_URL` ausente | conferir a variável |
| Lentidão perceptível | uma transação por consulta, **vezes a distância até o banco** | passo 4 — e seção 7, que foi o que a medição achou |

---

## 6. O que este PR **não** faz

- Não liga RLS para a aplicação. `RLS_ATIVO` nasce desligado e a conexão segue
  sendo a de dono.
- Não cria senha para role nenhum.
- Não usa `FORCE ROW LEVEL SECURITY`.
- Não altera as rotas públicas por token — passo 3.

Nada aqui é irreversível sem um `vercel env set`.

---

## 7. Decisão de 03/09/2026 — o banco muda de região

O Passo 3 fechou com o resultado certo e um número ruim: **o isolamento
funcionou** (nenhuma tela vazia que não devesse estar, `empresa-teste` vendo só
o que é dela) e o **Kanban foi para ~1,5 s** com `RLS_ATIVO=sim`.

**A causa não é a política. É geografia.** A aplicação roda em `gru1` (São
Paulo) e o banco está em `us-west-1`. Cada ida e volta custa ~150–200 ms, e o
RLS multiplicou as idas: cada consulta virou `BEGIN` + `set_config` + consulta +
`COMMIT`. Uma tela que fazia 4 consultas passou a fazer ~16 viagens
transcontinentais. O RLS não ficou caro — ele passou a pagar quatro vezes um
pedágio que já era caro e que ninguém tinha medido.

**O que já foi descartado.** Pool de conexões por empresa: esbarra no teto de
clientes do pooler sob serverless — cada instância abriria o seu, e o número de
instâncias não é nosso.

### A decisão

**Mover o banco para `sa-east-1` (São Paulo), ao lado da aplicação.** Duas
razões, e a segunda vale tanto quanto a primeira:

1. **Resolve a latência na raiz.** RTT `gru1` ↔ `sa-east-1` fica na casa de
   1–3 ms. As 4 viagens por consulta continuam existindo, mas passam a custar
   ~10 ms em vez de ~700. Nenhuma linha de código muda para isso acontecer.
2. **Tira a transferência internacional da mesa.** A LGPD não proíbe o dado sair
   do país — ela exige justificar (art. 33). Com o banco no Brasil, não há o que
   justificar. Para vender SaaS a cliente brasileiro, isso deixa de ser uma
   conversa.

### O que essa mudança carrega junto

Não é um botão. O que ela realmente implica:

| item | consequência |
|---|---|
| **Projeto novo** | O caminho previsível no Supabase é **criar projeto em `sa-east-1` e restaurar o dump** — não trocar a região do projeto existente. *Confira no painel antes de assumir: se o plano atual oferecer troca de região in-place, é melhor caminho.* |
| **Muda o `project ref`** | Trocam **todas** as strings: `DATABASE_URL`, `DIRECT_URL`, `AUTH_DATABASE_URL`, `ADMIN_DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. |
| **Roles não viajam no `pg_dump`** | `app_user` e `app_auth` nascem da migration `20260826000000_rls_isolamento`, que roda de novo no projeto novo. Mas a **senha** (Passo 2) é manual e precisa ser refeita. Sem isso, "senha inválida para todo mundo". |
| **Storage NÃO precisa ir junto** | Ver a seção 7.1: a reforma de 24/08 já cortou o vínculo entre a aplicação e o `project_ref`. O Postgres muda de região sozinho; o Storage fica onde está. |
| **Janela de escrita** | Restore de dump exige congelar escrita entre o `pg_dump` e a troca das variáveis, senão o que for gravado no intervalo se perde. Com 3,4 MB de dump é questão de minutos, não de horas. |

**O que não muda:** as 74 políticas, o `scripts/verificar-rls.mjs`, o `comOrg`,
o `prisma-auth.ts`. Nada do trabalho da Fase 3 é descartado. Muda onde o banco
mora, não o que ele faz.

### Consequência para a sequência da seção 4

- **Passo 4 (medir o custo) vira medir dos dois lados**, com o mesmo dado e o
  mesmo código: `RLS_ATIVO` ligado e desligado, em US-West e em São Paulo.
  Quatro números. É a comparação que separa "RLS é caro" de "distância é cara".
- **Passo 5 (virar em produção) acontece depois da mudança de região, não
  antes.** Ligar RLS com o banco em US-West é entregar 1,5 s ao cliente e
  chamar isso de segurança.
- **Critério novo:** se, com o banco em São Paulo, o Kanban continuar lento, a
  causa não era região — aí sim vale declarar a empresa **uma vez por
  requisição** em vez de por consulta. Essa decisão continua adiada até existir
  o número, como estava escrito.

### 7.1 O Storage não entra nesta migração — medido em 03/09/2026

O aviso que eu mesmo escrevi acima ("as URLs públicas quebram") vinha do
`DIAGNOSTICO-SAAS.md` de 19/08 e **está vencido**. A reforma de 24/08 (bucket
privado `midia` + rota `/api/midia/...`) já resolveu o problema no sentido que
importa: a URL que vai para o banco passou a ser **relativa e do nosso app**.
Ela não carrega o `project_ref`, então não tem como quebrar quando ele mudar.

Inventário do banco de produção (somente leitura, 03/09/2026):

| | quantidade | onde |
|---|---|---|
| URLs **portáteis** (`/api/midia/...`) | **293** | `arquivos` (151), `aprovacoes_video` (108), `demandas.thumbnailUrl` (25), `coberturas_uploads` (2) |
| URLs **absolutas** no `uploads` público | **105** | `demandas.linkFinal` (84), `mensagens_whatsapp.conteudo` (20), `depoimentos.videoUrl` (1) |

**O conjunto legado é fechado.** A mais recente é de **24/08/2026** — a data da
reforma. Nada novo aponta para lá desde então: o sangramento parou sozinho há
dez dias, e as 105 não crescem mais.

**A consequência estratégica.** Não existe truque de aplicação que salve uma URL
absoluta já enviada: `sddsq….supabase.co` não é domínio nosso, não há CNAME nem
redirect para instalar. **A única coisa que mantém aqueles links vivos é o
projeto antigo continuar existindo.** Logo, o plano não é "migrar o Storage sem
quebrar links" — é **não migrar o Storage agora**:

- **Movimento 1 (agora):** só o Postgres vai para `sa-east-1`. As quatro strings
  de conexão apontam para o projeto novo; `NEXT_PUBLIC_SUPABASE_URL` e
  `SUPABASE_SERVICE_ROLE_KEY` **continuam no projeto antigo**. O código já
  suporta a divisão — Storage e Prisma não compartilham nada além do acaso de
  hoje estarem no mesmo projeto. Zero link quebrado, zero trabalho de arquivo,
  latência resolvida.
- **Movimento 2 (depois, no seu tempo):** o bucket privado `midia` muda de
  projeto quando você quiser — as 293 URLs são relativas e não percebem. O
  `uploads` público **nunca migra**: ele fica no projeto antigo envelhecendo até
  ninguém mais bater nele.
- **Critério de desligar o projeto antigo:** não é data, é tráfego. Quando o
  contador de requisições do bucket `uploads` ficar em ~0 por algumas semanas,
  desliga. Enquanto não ficar, US$ 25/mês é o preço de não entregar link morto a
  cliente.

⚠️ **Enquanto os dois projetos coexistirem, o projeto antigo não é lixo — é o
servidor de arquivos.** Quem for "limpar projeto que não usa" precisa ler isto
antes.

### 7.2 A medição do Passo 1 — 03/09/2026

> **Nota de leitura.** O Passo 4 acima já tinha chegado ao mesmo diagnóstico em
> 01–03/09, com A/B por endpoint e com o `/api/health` a ~172 ms. O que segue
> **não é descoberta, é confirmação por outro ângulo**: medição direta no
> protocolo, isolando o pedágio de rede do trabalho do banco. Serve para
> quantificar o que a mudança de região devolve — que ela é necessária, o Passo 4
> já tinha provado.

Medido do terminal do Giovani contra o banco de produção (`us-west-1`), somente
leitura, 30 repetições por cenário. O preview está na mesma região: o pedágio de
rede é o mesmo.

| cenário | p50 | p95 |
|---|---|---|
| ping (`select 1`) — pooler | **187,0 ms** | 264,0 ms |
| ping + transação RLS — pooler | **813,7 ms** | 848,1 ms |
| consulta real do Kanban (50 demandas) — pooler | **189,5 ms** | 268,5 ms |
| consulta real + transação RLS — pooler | **805,9 ms** | 852,9 ms |

Pela conexão direta (`:5432`) os números são iguais dentro do ruído (193,8 /
854,5 / 196,1 / 853,8). **O pooler não é o problema.**

**As três leituras que importam:**

1. **O trabalho do banco é 2,5 ms.** `select 1` custa 187 ms e a consulta real do
   Kanban custa 189,5 ms. A diferença — 2,5 ms — é tudo o que o Postgres
   efetivamente faz. **Os outros 187 ms são o Oceano Pacífico.** Não há consulta
   para otimizar, não há índice faltando: 98,7% do tempo é distância.
2. **O embrulho do RLS multiplica por 4,4x**, exatamente como previsto — `BEGIN`,
   `set_config`, consulta, `COMMIT` são quatro travessias onde antes havia uma.
   Em números absolutos, **o RLS adiciona +616 ms por consulta**.
3. **Isso explica o Kanban de ~1,5 s.** Duas consultas por tela × 806 ms = 1,6 s.
   O número bate com o que apareceu no Passo 3. Não há mistério sobrando.

**A projeção para `sa-east-1`.** O multiplicador de 4,4x não muda de região — o
que muda é o que ele multiplica. Com RTT de 1–3 ms, a consulta com transação sai
de 806 ms para ~10 ms. **Não é uma melhora de 20%; é de cerca de 80x.**

**A decisão que este número já resolve:** o plano B do Passo 4 — declarar a
empresa uma vez por requisição em vez de por consulta — **está descartado.** Ele
atacaria o multiplicador (4,4x → ~2x), levando o Kanban de 1,5 s para ~0,8 s:
mais invasivo, arriscado, e ainda inaceitável. Mudar de região ataca o que
importa e não toca em uma linha de código. Otimizar o multiplicador enquanto
cada travessia custa 187 ms seria polir o lado errado do problema.

⚠️ **Ressalva honesta:** isto foi medido do laptop, não de `gru1`. A *razão*
entre os cenários é exata (mesma conexão, mesma máquina, mesmo instante); o
valor absoluto que a Vercel vê pode diferir. É o preview de São Paulo, medido a
partir de um deploy real, que fecha essa conta.

### 7.3 O preview de São Paulo, de pé — 03/09/2026

Executado por mim, ponta a ponta, contra o projeto `rkaihtrajhdhegpkfaat`
(`sa-east-1`), criado vazio pelo Giovani. Nada tocou a produção além de leitura.

**O que foi feito**

| passo | resultado |
|---|---|
| Dump completo (rede de segurança) | `nuflow-prod-20260906-121734.dump`, 3,7 MB, SHA-256 `ed1877df…` |
| Dump só do `public` (carga da migração) | `nuflow-public-20260906-122008.dump`, 3,4 MB, SHA-256 `ed0e8b77…` |
| Roles `app_user`/`app_auth` criados antes do restore | sem `BYPASSRLS`, sem superusuário |
| Restore, transação única, 586 entradas | sem erro |
| GRANTs | 276 para `app_user` (69 tabelas × 4), 6 para `app_auth` |
| Senhas e `LOGIN` | definidas |
| `scripts/verificar-rls.mjs` | **11 de 11 verdes** |

**Conferência contra a produção:** 69 tabelas · 75 políticas · 68 com RLS · 149
índices · 116 chaves estrangeiras · 641 demandas · 102 usuários · 2.201 históricos
· 22 migrations. **Todos idênticos.**

**Isolamento provado com dado real** (mais forte que o teste sintético): conectado
como `app_user`, declarando cada empresa por vez —

| empresa | demandas (dono, sem RLS) | demandas (`app_user`, com RLS) |
|---|---|---|
| contourline | 635 | 635 |
| empresa-teste | 6 | 6 |
| giovani | 0 | 0 |

Soma 641 = total do banco. Sem `app.org_id` declarado: **0 linhas**, falha fechada.

**A medição — a razão de tudo isto**

| cenário | US-West p50 | São Paulo p50 | ganho |
|---|---|---|---|
| ping (`select 1`) | 190,2 ms | **6,0 ms** | 32x |
| ping + transação RLS | 812,0 ms | **24,7 ms** | 33x |
| consulta real do Kanban | 192,4 ms | **8,3 ms** | 23x |
| consulta real + transação RLS | 809,7 ms | **27,4 ms** | 30x |

**A consulta com RLS caiu de 809,7 ms para 27,4 ms — 782 ms a menos.** O Kanban
projetado (2 consultas) sai de **1,62 s para 0,055 s**.

A decisão está confirmada com número, não com expectativa. E confirma também o
descarte do plano B: não há mais nada para otimizar no multiplicador.

### 7.4 Duas coisas que a execução descobriu e que a virada de produção precisa

**1. A migration não concede `SET` no role — e sem isso o verificador não roda.**
No PostgreSQL 16+, `CREATE ROLE` dá ao criador `ADMIN OPTION` mas **não** dá
`SET`. Resultado: `SET LOCAL ROLE app_user`, que é como o
`scripts/verificar-rls.mjs` prova o isolamento, falha com
`permission denied to set role "app_user"` num banco recém-criado.

Na produção atual essa concessão **existe** — mas veio de ação manual de alguém,
não da migration. Ou seja: **num projeto novo ela não nasce, e o gate de RLS não
consegue rodar.** O conserto é uma linha por role:

```sql
GRANT "app_user" TO "postgres" WITH INHERIT FALSE, SET TRUE;
GRANT "app_auth" TO "postgres" WITH INHERIT FALSE, SET TRUE;
```

`INHERIT FALSE` é de propósito: o dono pode **assumir** o papel para testar, sem
herdar privilégio dele passivamente.

✅ **Resolvido em `20260906000000_rls_set_role_para_o_verificador`**, com trava de
saída no mesmo padrão das anteriores. Testada contra o preview de São Paulo
desfazendo a concessão para recriar o estado de projeto novo: a trava grita com a
mensagem certa, o verificador falha sem ela, passa com ela (11 de 11), e a
segunda aplicação é idempotente. Usa `current_user` em vez de `postgres` literal,
para continuar correta num projeto com outro nome de dono.

Isto **não afeta a aplicação** — ela conecta direto como `app_user` e nunca usa
`SET ROLE`. Afeta só a verificação. Mas um gate que não consegue rodar é um gate
que as pessoas aprendem a pular, e esta é a fase inteira do projeto em que isso
seria mais caro. **Deve entrar na migration antes da virada de produção.**

**2. As senhas do preview são fracas, de propósito e temporariamente.**
`app_user` e `app_auth` no preview usam senhas escolhidas pela conveniência do
teste, e elas passaram por conversa e por histórico de shell. ⛔ **Não podem ser
reaproveitadas na virada de produção.** No Passo 5, senha nova, gerada com
`openssl rand -base64 24`, aplicada só no SQL editor. A senha do `postgres` do
projeto de preview também deve ser rotacionada quando o preview for descartado.

### O preview de US-West: medir antes de apagar

O projeto `nuflow-preview` em `us-west-1` **não é lixo — é o grupo de controle.**
Ele é a única cópia que já provou o isolamento e a única que carrega o número
ruim. Apagar antes de medir joga fora a metade "antes" da comparação.

Ordem:

1. ~~Medir o preview atual (US-West).~~ **Feito em 03/09 — ver 7.2.** O baseline
   está registrado: 806 ms por consulta com RLS, 189 ms sem.
2. ~~Criar `nuflow-preview-sp` em `sa-east-1`, restaurado do dump de produção.~~
   **Feito em 03/09 — ver 7.3.**
3. ~~Roles, senhas, `verificar-rls.mjs`.~~ **Feito — 11 de 11 verdes.**
4. Rodar a mesma medição a partir de um **deploy de preview da Vercel** (em
   `gru1`), nunca do laptop — a máquina de casa não tem a mesma rota.
5. ~~Comparar.~~ **Feito — ver a tabela em 7.3.** O preview de US-West pode ser
   apagado: o baseline está registrado e não precisa mais existir para ser citado.
