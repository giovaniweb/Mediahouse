# Auditoria da migração para São Paulo

Feita em **29/10/2026**, olhando o estado real: Vercel, GitHub, banco novo,
banco antigo, Storage e os arquivos locais. Nenhum valor secreto aparece aqui;
só para onde cada coisa aponta e onde está guardada.

Projetos:

- **Novo:** `zdvfizjsgsjsunaspzue` (`nuflow-prod-sp`), São Paulo, organização
  Jhowrec, plano Pro.
- **Antigo:** `sddsqdzcfueajsvgocaa` (`nuflow-prod`), us-west-1, na conta que
  vai ser apagada.

---

## 1. Resumo

| parte | onde está hoje | situação |
|---|---|---|
| Banco de produção | **novo** desde 07/09 | feito e conferido |
| Release de migrations (GitHub) | **novo** desde 09/09 | feito; o release de hoje rodou em `aws-0-sa-east-1` |
| Banco antigo | congelado (somente leitura) | ninguém do app conecta; última gravação 06/09 |
| `.env.local` do Mac | banco e Storage **novos** | Storage trocado em 29/10, depois da segunda cópia |
| Storage (arquivos) | **novo** desde 29/10 08:34 | Vercel virada; falta conferir o `SUPABASE_URL` do worker no Railway |
| WhatsApp (Evolution) | Postgres próprio no Railway | não depende de nenhum Supabase |
| RLS em produção | **não ligado**; produção conecta como `postgres` | Virada B pendente desde setembro |

---

## 2. O que foi feito, em ordem

| data | o quê | registro |
|---|---|---|
| 06/09 | Projeto novo criado; ensaio completo (dump, restore, conferência, RLS provado) | `PLANO-VIRADA-PRODUCAO.md` §10 |
| 07/09 | **Virada do banco**: janela de 5 min, 12.738 linhas idênticas, 172 ms → 3 ms; banco antigo congelado | §11; `~/nuflow-virada/estado.json` |
| 07/09 | `.env.local` reapontado para o banco novo (backup em `env-local-antes-da-virada.bak`) | §11 |
| 08–09/09 | Secrets do GitHub (`producao`) reapontados depois do release que bateu no banco antigo | §12 |
| 04–05/10 | Ensaio do RLS no projeto novo, sem ligar em produção | `RLS-PLANO-DE-VOO.md` §8 |
| 06/10 | Schema `public` tirado da API do Supabase (migration `20261005140000`) | PR #100 |
| 28–29/10 | Storage: código do acervo `legado`, links absolutos migrados, cópia completa dos arquivos | PR #111, `PLANO-MUDANCA-STORAGE.md` |

---

## 3. Para onde cada variável aponta hoje

### Vercel — Production

| variável | aponta para | observação |
|---|---|---|
| `DATABASE_URL`, `DIRECT_URL` | banco **novo** | criadas em 07/09; `/api/health` mede 3–26 ms, coerente com São Paulo |
| `NEXT_PUBLIC_SUPABASE_URL` | Storage **novo** | trocada em 29/10 08:34 (Production e Preview) |
| `SUPABASE_SERVICE_ROLE_KEY` | Storage **novo** | trocada em 29/10 08:34 (só Production) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | antigo | o código não usa; pode sair |
| `SUPABASE_URL` | **antigo** | veio do Railway pela integração; o app não usa; muda sozinha quando o Railway mudar |
| `RLS_ATIVO`, `AUTH_DATABASE_URL` | não existem em Production | por isso o RLS não está ligado |

A Vercel não devolve variável marcada como sensível. O destino de
`DATABASE_URL` foi provado pela latência e pelo banco antigo estar congelado:
gravar nele daria erro `25006`.

### GitHub — environment `producao`

| secret | gravado em | aponta para |
|---|---|---|
| `DATABASE_URL_PRODUCAO` | 09/09 | banco **novo** |
| `DIRECT_URL_PRODUCAO` | 09/09 | banco **novo** (provado: o log do release de hoje mostra `aws-0-sa-east-1.pooler.supabase.com:5432`) |

### Railway

O CLI não está logado neste Mac, então a leitura foi pelo que a integração
copia para a Vercel:

- **`nuflow-midia-worker`**: `SUPABASE_URL` aponta para o Storage **antigo**.
  Precisa virar junto com a Vercel, porque o worker recusa URL assinada de
  outro endereço.
- **Evolution (WhatsApp)**: `DATABASE_CONNECTION_URI` aponta para um serviço
  Postgres do próprio Railway (`railway`/`postgres`). Não depende de Supabase.

---

## 4. Credenciais do projeto novo: onde já estão

Antes de pedir qualquer uma destas de novo, procurar aqui.

| credencial | arquivo (todos `600`, fora do Git) |
|---|---|
| `postgres` (dono), pooler 6543 e 5432 | `~/MediaHouse/videoops/.env.local`, `~/nuflow-virada/urls-destino.env`, `~/nuflow-virada/destino.env` |
| `app_user` (com RLS) | `~/nuflow-virada/urls-destino.env` (`DATABASE_URL_APP_USER`) |
| `app_auth` (login) | `~/nuflow-virada/urls-destino.env` (`AUTH_DATABASE_URL`) |
| `service_role` do Storage | `~/nuflow-virada/storage-destino.env` (desde 29/10; antes só existia no chat de outra sessão) |
| `anon` do projeto novo | em lugar nenhum; o código não usa |

Do projeto antigo (para a volta do Storage): `~/nuflow-virada/storage-volta.env`
e o `.env.local`.

---

## 5. Banco novo, por dentro

- Postgres 17.6; **49 migrations** aplicadas, a última `20261028120000`.
- `app_user` e `app_auth`: login, sem `BYPASSRLS`, sem superusuário.
- 89 tabelas no `public`; 88 com RLS; 4 com `FORCE`; 110 políticas.
- **Conexões ativas: todas como `postgres`**, pelo Supavisor. O `app_user` não
  é usado: o RLS existe no banco, mas a produção passa por cima dele.
- Supabase Auth sem uso (`auth.users` = 0). Nenhuma função do banco cita
  endereço do Supabase.
- Storage: `midia` e `uploads`, ambos privados, criados em 29/10. Limite
  global de 5000 MB.

## 6. Banco antigo

- `default_transaction_read_only = on`: congelado desde 07/09, como o plano
  previa.
- Última gravação em `demandas`: 06/09 18:32. 644 demandas, o número da virada.
- Nenhuma conexão do app; só os processos internos do Supabase.

---

## 7. O que ainda depende do projeto antigo

A conta antiga só pode ser apagada quando esta lista estiver vazia.

1. **Storage**: a Vercel virou em 29/10. Falta confirmar a `SUPABASE_URL` do
   worker no Railway; a cópia dela na Vercel ainda mostrava o endereço antigo
   às 08:40.
2. **`.env.local`**: Storage trocado em 29/10. Sobra a
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` antiga, que o código não usa.
3. **Prévia `preview/rls` da Vercel**: tem banco próprio, criado em 01/09,
   provavelmente o `nuflow-preview-sp` da conta antiga. Apagar a conta derruba
   essa prévia, o que não afeta a produção.
4. **Outros projetos na mesma organização** (Contourline, Partnerzone, Prestador
   de Contas, SDR, `nuflow-preview`): apagar a organização leva todos. Se só o
   NuFlow sai, apagar **só o projeto `nuflow-prod`**.
5. **20 mensagens de WhatsApp** com link absoluto: quebram, como decidido em
   28/10.

---

## 8. Pendências herdadas da virada de setembro

1. **Senha do `postgres` do projeto novo.** Ela passou pelo chat em 07/09
   (§11) e não há sinal de troca desde então: as cópias na Vercel, no GitHub e
   no `.env.local` são de 07 a 09/09. Trocar exige mudar os três lugares juntos
   (e os arquivos de `~/nuflow-virada`).
2. **Virada B, ligar o RLS.** Ensaiada em 04–05/10, nunca ligada. Falta o
   `provar-rls`, um dump e a janela (`RLS-PLANO-DE-VOO.md` §8).
3. **`service_role` do projeto novo** também passou pelo chat (28–29/10). Trocar
   depois da virada do Storage.

## 9. Achados novos desta auditoria

1. **A integração Railway → Vercel copiou cerca de 70 variáveis** dos serviços
   do Railway (Evolution, o Postgres dela, o worker) para Production e Preview
   da Vercel, entre elas senhas do Postgres da Evolution e a chave da API dela.
   O app não usa quase nenhuma. Vale limitar a integração às variáveis do
   worker.
2. Uma dessas cópias é um **`DATABASE_URL` de Preview** com um modelo do Railway
   que não resolve (`${{RAILWAY_PRIVATE_DOMAIN}}`). Prévias de branch comum
   ficam sem banco. Isso não toca a produção, mas explica uma prévia que não
   abre.
3. `NEXT_PUBLIC_SUPABASE_ANON_KEY` aponta para o projeto antigo e não é usada.
