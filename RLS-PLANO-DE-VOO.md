# RLS — plano de voo

Como ligar a tranca do banco sem derrubar a produção.

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

1. **Conexão por empresa, com o ajuste no nível da SESSÃO.** Um pool por
   organização, cada um abrindo a conexão com `app.org_id` já definido. Elimina a
   transação por consulta inteira — volta ao custo de hoje. Exige o pooler em modo
   SESSÃO (5432), o que limita o número de conexões, e funciona bem com dezenas de
   inquilinos, não com milhares. É o desenho certo para o tamanho atual.

2. **Aproximar o banco da aplicação.** Parte dos 120ms é geografia, não RLS.
   Vale medir com banco e aplicação na mesma região antes de culpar a arquitetura.

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

---

## 5. O que pode dar errado

| sintoma | causa provável | o que fazer |
|---|---|---|
| "Senha inválida" para todos | `AUTH_DATABASE_URL` não configurada; o login caiu no `app_user` | apontar para `app_auth` |
| Tela vazia, sem erro | rota sem sessão e sem `comOrg` | envolver com `comOrg` |
| `permission denied for table X` | tabela criada depois sem GRANT | o `ALTER DEFAULT PRIVILEGES` da migration cobre as futuras; para as existentes, `GRANT` explícito |
| Super Admin não lista empresas | `ADMIN_DATABASE_URL`/`DIRECT_URL` ausente | conferir a variável |
| Lentidão perceptível | uma transação por consulta | passo 4 |

---

## 6. O que este PR **não** faz

- Não liga RLS para a aplicação. `RLS_ATIVO` nasce desligado e a conexão segue
  sendo a de dono.
- Não cria senha para role nenhum.
- Não usa `FORCE ROW LEVEL SECURITY`.
- Não altera as rotas públicas por token — passo 3.

Nada aqui é irreversível sem um `vercel env set`.
