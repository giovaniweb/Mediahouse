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

**Passo 2 — dar credencial ao role.** No SQL editor do Supabase, fora do
repositório:

```sql
ALTER ROLE app_user WITH LOGIN PASSWORD '<senha forte>';
ALTER ROLE app_auth WITH LOGIN PASSWORD '<outra senha forte>';
```

*Critério:* conectar manualmente com cada uma e conferir que `app_user` vê a
própria empresa e nada mais.

**Passo 3 — exercitar com o role certo, fora de produção.** Um deploy de preview
com `DATABASE_URL` = `app_user`, `AUTH_DATABASE_URL` = `app_auth`, `RLS_ATIVO=sim`,
apontando para um **banco de cópia**, não o de produção.

Percorrer, logado como `empresa-teste`: login · dashboard · lista de demandas ·
abrir uma demanda · criar demanda · Kanban · agenda · `/campo` · aprovação
pública por link · upload de NF por link · página `/e/[slug]` · relatórios ·
configurações · WhatsApp · Super Admin.

*Critério:* **nenhuma tela vazia que não deveria estar vazia.** Cada tela vazia é
um item do passo 3 da seção anterior — anote, corrija com `comOrg`, repita. É
esta lista que eu não quis adivinhar.

**Passo 4 — medir o custo.** Cada consulta vira `BEGIN` + `set_config` + consulta
+ `COMMIT`. Comparar o tempo do dashboard e da lista de demandas com e sem
`RLS_ATIVO`.

*Critério:* se a degradação for inaceitável, o caminho é declarar a empresa uma
vez por requisição em vez de por consulta — mais invasivo, e a decisão deve ser
tomada com o número na mão, não antes.

**Passo 5 — virar em produção, em janela combinada.** Trocar as três variáveis e
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
