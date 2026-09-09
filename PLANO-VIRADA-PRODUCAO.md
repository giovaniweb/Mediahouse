# Plano de Virada da Produção Oficial

Como levar o banco de produção de `us-west-1` para `sa-east-1` sem ninguém
digitar SQL, sem perder registro e com um caminho de volta em um comando.

Escrito em **06/09/2026**, depois do preview de São Paulo ter rodado ponta a
ponta (`RLS-PLANO-DE-VOO.md` §7.3 a §7.6). Este documento é o que executa; o
plano de voo é o que decidiu.

---

## 1. O que esta virada faz — e o que ela deliberadamente não faz

**Faz:** o Postgres de produção passa a morar em São Paulo, ao lado da aplicação.
Medido hoje, no ar: `nuflow.space/api/health` responde em **175 ms** (mediana de
oito chamadas, idêntica à de 03/09). O mesmo endpoint no preview de São Paulo
responde em **3 ms**. É o que esta virada compra — e ela não muda uma linha de
código para isso.

**Não faz:** ligar o RLS. São duas viradas, e juntá-las é o erro que este plano
existe para evitar.

| | move dado? | precisa de janela? | como se desfaz |
|---|---|---|---|
| **Virada A — região** (este plano) | sim | sim, ~10 min | variáveis antigas + redeploy, **e o que foi gravado depois fica no banco novo** |
| **Virada B — RLS** (dias depois) | não | não | um comando, sem perder nada |

Por que separadas: se as duas forem juntas e alguma tela vier vazia, não há como
saber se a causa foi a política de RLS ou a mudança de banco. Separadas, cada
sintoma tem um único suspeito. A Virada B também está automatizada aqui
(`ligar-rls`), e ela é barata justamente por não mexer em dado.

**Não faz também:** mover o Storage. `NEXT_PUBLIC_SUPABASE_URL` e
`SUPABASE_SERVICE_ROLE_KEY` continuam apontando para o projeto antigo, de
propósito — 105 URLs absolutas já distribuídas dependem dele existir (§7.1). O
script recusa tocar nessas duas variáveis.

---

## 2. A decisão que falta, e é sua

Para onde restaurar? As duas respostas funcionam; elas custam coisas diferentes.

**(a) Projeto novo em `sa-east-1`, só para produção.** ← recomendo
O preview de São Paulo continua sendo o preview, com o banco de teste separado do
banco real — que é a condição que faltava quando o incidente de 20/08 aconteceu.
As senhas nascem limpas. Custa mais um projeto no Supabase enquanto o preview
existir, e o preview pode ser descartado logo depois.

**(b) Promover o projeto de preview (`rkaihtrajhdhegpkfaat`) a produção.**
Não custa projeto novo e o banco já está restaurado lá. Em troca: as senhas de
`app_user`/`app_auth` de lá passaram por conversa e histórico de shell (§7.4) —
precisam ser rotacionadas de qualquer jeito, o que o script já faz —, e o
ambiente de preview passa a ser o ambiente de produção, o que devolve
exatamente a mistura que causou o incidente de 20/08. O script suporta este
caminho, mas exige `--limpar-destino`, porque restaurar por cima significa
**apagar o schema `public` que está lá** antes.

---

## 3. O único esforço manual que sobra

Uma colagem. Uma só.

O Supabase mostra a senha do `postgres` **no instante em que o projeto é
criado** e nunca mais. Não há API que a devolva depois. Então:

1. Você cria o projeto em `sa-east-1` (ou reusa o de preview).
2. Copia a *connection string* de sessão (porta 5432, host do pooler) e cola em
   `~/nuflow-virada/destino.env`, numa linha:

```
DESTINO_DIRECT_URL=postgresql://postgres.<ref>:<senha>@aws-1-sa-east-1.pooler.supabase.com:5432/postgres
```

O resto — roles, senhas novas, GRANTs, dump, restore, conferência, variáveis da
Vercel, redeploy, medição — é script. **As senhas de `app_user` e `app_auth`
são geradas dentro do processo, gravadas em arquivo `600` fora do repositório e
mandadas direto para a Vercel.** Não passam por terminal, por chat, nem por
histórico de shell. É melhor do que o caminho manual do SQL editor, não pior.

> Se você quiser eliminar até essa colagem, dá: um *personal access token* do
> Supabase (`sbp_…`) permite criar o projeto pela Management API já com a senha
> escolhida por nós. Aí o esforço vira colar o token, uma vez. Diga se quer que
> eu acrescente esse passo.

---

## 4. A sequência

Todos os comandos abaixo rodam da pasta do projeto. **Eu executo; você lê.** Cada
passo se recusa a começar se o anterior não terminou bem — o estado fica em
`~/nuflow-virada/estado.json`, então a sequência não depende de ninguém lembrar
a ordem.

```bash
node scripts/virada/virada.mjs executar
```

Esse comando encadeia os cinco primeiros passos e **para** antes do único que
tem consequência. O que ele faz, um a um:

| # | comando | o que faz | critério de parada | tempo |
|---|---|---|---|---|
| 0 | `preflight` | binários, versões dos dois Postgres, escopo das variáveis da Vercel, saúde da produção, volumes de origem | qualquer item vermelho aborta **antes** da janela | ~20 s |
| 1 | `congelar` | põe os três roles em `default_transaction_read_only` e derruba as conexões presas no pooler | prova, pelo pooler, que um `UPDATE` volta com `25006` | ~5 s |
| 2 | `dump` | dump completo (rede de segurança) + dump do `public` (a carga), com SHA-256 e leitura conferida por `pg_restore -l` | dump ilegível ou truncado aborta | 1–3 min |
| 3 | `restaurar` | cria `app_user`/`app_auth` **antes** do restore, restaura em transação única, aplica senhas novas e o `GRANT … SET TRUE` do §7.4 | `pg_restore --single-transaction` — ou entra tudo, ou não entra nada | 1–2 min |
| 4 | `conferir` | **o gate**: compara os dois bancos e roda o `verificar-rls.mjs` no destino | qualquer divergência aborta | ~30 s |
| 5 | `apontar` | troca `DATABASE_URL` e `DIRECT_URL` de Production e redeploya | exige `--confirmo=<ref>` digitado | ~1 min |
| 6 | `verificar` | mede `/api/health` do lado de fora, oito vezes, e confere os volumes | banco indisponível aborta | ~15 s |

Janela total: **entre 6 e 12 minutos**, e o passo mais lento é o dump, porque
ele ainda atravessa o Pacífico.

### O que o passo 4 confere, e por que ele é o gate

"O restore rodou sem erro" não prova nada: um dump truncado também não dá erro.
O `scripts/conferir-copia.mjs` compara, entre origem e destino:

- o conjunto de **tabelas**, de **políticas** (pelo nome), de **índices** e de
  **chaves estrangeiras**;
- a **contagem de todas as 69 tabelas** — todas, não uma amostra;
- quais tabelas têm **RLS ligada**;
- as **sequências**, que é o item que ninguém lembra: sequência atrasada não
  quebra o restore, quebra a primeira gravação do dia seguinte com um P2002;
- que `app_user` e `app_auth` existem no destino, **sem `BYPASSRLS`**, com
  LOGIN, e que o dono consegue `SET ROLE` neles.

Hoje a origem tem 69 tabelas, 75 políticas, 68 tabelas com RLS, 149 índices,
116 chaves estrangeiras, 644 demandas, 102 usuários e 2.222 históricos.

---

## 5. Como o congelamento funciona — e o que ele não cobre

A trava é **no banco**, não na aplicação:

```sql
ALTER ROLE postgres  SET default_transaction_read_only = on;
ALTER ROLE app_user  SET default_transaction_read_only = on;
ALTER ROLE app_auth  SET default_transaction_read_only = on;
```

Toda sessão nova nasce somente-leitura; as sessões velhas presas no Supavisor são
derrubadas logo depois e reconectam já congeladas. O script então **prova** a
trava pelo mesmo caminho que a aplicação usa: manda um `UPDATE` que não muda
nada e confere que o Postgres devolveu `25006`.

Por que no banco e não na aplicação: o que precisa parar não é só a tela. É o
cron, o webhook do WhatsApp e o `after()` que ainda está rodando de uma
requisição de dois segundos atrás. Uma trava na aplicação não alcança nada disso
sem middleware novo no caminho quente — e código novo no caminho quente às cinco
da manhã é o contrário de segurança.

**O preço, dito com todas as letras:** durante a janela, quem tentar salvar algo
vê erro, não uma tela educada de manutenção. Escolhi não construir a tela de
manutenção porque ela é código novo em todo request para cobrir dez minutos por
ano. Se você preferir a tela, ela é meia hora de trabalho e um deploy a mais —
diga.

**O que se perde de verdade:** mensagem de WhatsApp que chegar dentro da janela.
A Evolution posta o webhook, a gravação é recusada, e não há segunda tentativa.
Por isso a janela sugerida é **05:00 BRT**: os crons rodam 07:00, 08:00 e 09:00
BRT, e às cinco não há ninguém trabalhando nem mensagem entrando.

**O banco antigo continua congelado depois da virada, de propósito.** Ele deixa
de ser banco e vira servidor de arquivos (§7.1). Congelado, nenhum deploy
esquecido consegue gravar nele e criar dois bancos com verdades diferentes.
Quem descongela é o `reverter`.

---

## 6. O que é irreversível, e exatamente onde

Até o fim do passo 4, **nada**. O banco antigo está intacto e congelado, o novo é
uma cópia, e desistir custa um comando:

```bash
node scripts/virada/virada.mjs descongelar
```

A linha é o passo 5. Depois do redeploy, o que os usuários gravarem existe **só**
em São Paulo. Voltar atrás a partir daí não é impossível — é caro: custa os
registros criados no intervalo. Por isso `apontar` é o único passo que exige
confirmação digitada, e por isso o `reverter` começa comparando os dois bancos e
dizendo, em número, quanto custa voltar.

```bash
node scripts/virada/virada.mjs reverter
```

Ele devolve as variáveis a partir do backup tirado imediatamente antes da troca,
redeploya e descongela o banco antigo.

---

## 7. A Virada B — RLS, dias depois

Sem janela, sem congelamento, sem mover dado:

```bash
node scripts/virada/virada.mjs ligar-rls      # e, se algo vier vazio:
node scripts/virada/virada.mjs desligar-rls
```

Ela troca `DATABASE_URL` para o `app_user` (sem `BYPASSRLS`), `AUTH_DATABASE_URL`
para o `app_auth`, `ADMIN_DATABASE_URL` para a conexão de dono, liga
`RLS_ATIVO=sim` e redeploya. O que nenhuma medição substitui continua sendo
humano: login, Kanban das duas empresas, uma demanda aberta, um comentário
gravado, o WhatsApp recebendo.

Só faz sentido depois de a Virada A estar estável — com o banco em São Paulo, a
consulta com transação de RLS medida no preview custa **27 ms** contra os 810 ms
de US-West (§7.3). É esse número que destravou o Passo 5 do plano de voo.

---

## 8. Três coisas que a preparação de hoje descobriu

**1. A pendência do §7.6 acabou.** `DATABASE_URL` e `DIRECT_URL` estão hoje com
escopo **Production apenas** — conferido pela CLI, nos dois ambientes. Nenhum
preview de branch nova alcança mais o banco de produção, que era a condição do
incidente de 20/08 e estava registrada como pendente. O `preflight` continua
conferindo isso toda vez, porque é o tipo de coisa que volta sozinha: se os dois
ambientes voltarem a dividir o mesmo registro, trocar a variável de Production
mudaria o preview junto, e o script para antes.

**2. A migration `20260906000000_rls_set_role_para_o_verificador` não está
aplicada em produção.** A última aplicada é `20260901130000`. Na produção atual
a concessão existe assim mesmo, porque alguém a fez à mão — e é justamente por
isso que ela não viaja no dump. O passo `restaurar` aplica o `GRANT … SET TRUE`
explicitamente no destino, então o verificador roda lá desde o primeiro minuto;
a migration entra depois, pelo caminho normal de release, e é idempotente.

**3. O ferramental está completo.** `pg_dump`/`pg_restore` 18 vivem no libpq do
Homebrew, fora do `PATH` — o script acha sozinho. A CLI da Vercel está
autenticada e tem `env update`, `redeploy` e `env pull`, que é o que torna a
troca de variáveis e o backup delas automáticos.

---

## 9. Depois

- **Não apague o projeto antigo.** Ele é o servidor de arquivos das 105 URLs
  absolutas. O critério de desligar não é data, é tráfego (§7.1).
- **Rotacionar a senha do `postgres` do projeto de preview** quando o preview for
  descartado.
- **Aplicar a migration `20260906000000`** pelo release normal, depois da virada.
- **Passo 6 do plano de voo** (`FORCE ROW LEVEL SECURITY`) continua dependendo de
  o painel de Super Admin sair da conexão de dono. Não é desta virada.

---

## 10. O ensaio, executado em 06/09/2026

Decisão tomada: **projeto novo**, `zdvfizjsgsjsunaspzue`, criado pelo Giovani em
conta pessoal. A produção **não** foi congelada — era quinta-feira de tarde, e
congelar sem janela combinada derrubaria a gravação de todo mundo no expediente.
O que rodou foi o caminho inteiro com a produção **viva e só lida**:

```bash
node scripts/virada/virada.mjs preflight
node scripts/virada/virada.mjs dump --sem-congelar
node scripts/virada/virada.mjs restaurar --limpar-destino
node scripts/virada/virada.mjs conferir
```

O `--sem-congelar` marca a cópia como ensaio no estado, e o `apontar` **recusa**
apontar a produção para uma cópia marcada assim. A janela real refaz os quatro
passos com o congelamento na frente.

### O que a conferência devolveu

| | origem (us-west-1) | destino (sa-east-1) |
|---|---|---|
| tabelas · políticas · com RLS | 69 · 75 · 68 | idênticos |
| índices · chaves estrangeiras | 149 · 116 | idênticos |
| migrations aplicadas | 22 | idênticos |
| **linhas, somando as 69 tabelas** | **12.732** | **12.732** |

E o isolamento, com dado real, pelo pooler em modo transação — que é exatamente
a conexão que a Vercel vai usar:

| empresa | demandas vistas pelo `app_user` |
|---|---|
| contourline | 635 |
| empresa-teste | 6 |
| giovani | 3 |
| **sem `app.org_id` declarado** | **0 — falha fechada** |

Soma 644, igual ao total do banco: nenhuma linha aparece para duas empresas,
nenhuma some. Conferido também que o ajuste **não vaza** para fora da transação
e que o `app_auth` lê os 102 usuários e **não** alcança `demandas`.

### Três defeitos que o ensaio achou, e é para isso que ele existe

**1. O host que o Supabase mostra não serve para a Vercel.** A string colada
apontava para `db.zdvfizjsgsjsunaspzue.supabase.co`, que **só tem registro
AAAA** — IPv6-only. Funciona do laptop e não funciona de `gru1`. É a mesma
armadilha do §7.3, e ela não avisa: o deploy simplesmente sobe com
`banco: indisponivel`. O `destino.env` foi gravado com a URL do **pooler**, e foi
o pooler que confirmou a região: só `aws-0-sa-east-1` aceitou a conexão. A região
está provada pelo host que respondeu, não pela intenção de quem criou o projeto.

**2. O `pg_dump` 18 emite quatro entradas que a plataforma já tem.** Um
`CREATE SCHEMA public` — que existe em todo projeto Supabase — e três
`ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin`, que o `postgres` não tem
permissão de mudar. Qualquer uma derruba o restore inteiro por causa de uma
linha. O `restaurar` agora filtra essas quatro entradas do índice do arquivo e
restaura o resto, mantendo o `--single-transaction`. O filtro é estreito: as
entradas `DEFAULT PRIVILEGES … postgres` **continuam entrando**, porque são o
`ALTER DEFAULT PRIVILEGES` da migration `20260826000000` — o que garante que
tabela criada no futuro já nasça com GRANT para o `app_user`.

**3. Um bug meu: `new URL().host` carrega a porta.** As URLs do pooler saíram com
`:5432:6543`. Apareceu porque a prova de isolamento foi feita **pelas URLs
geradas**, não por uma conexão montada à mão para o teste. Se a prova tivesse
sido feita com uma string escrita na hora, o defeito só apareceria no deploy.

### Uma verificação que aqui não verifica nada

A conferência de sequências passou com "0 sequências". É verdade e é inútil neste
schema: os identificadores são `cuid` em coluna de texto, não `serial`. O teste
fica, porque o dia em que alguém acrescentar uma coluna `serial` ele passa a
valer — mas não conte com ele como prova de nada hoje.

### O estado em que as coisas ficaram

- O banco de São Paulo está **carregado, conferido e com RLS provado**. Ele não
  recebe tráfego: a produção continua lendo e gravando em `us-west-1`.
- `app_user` e `app_auth` já têm senha nova, gerada localmente, gravada em
  `~/nuflow-virada/urls-destino.env` (600). Elas nunca passaram por terminal nem
  por conversa.
- **A senha do `postgres` do projeto novo passou pelo chat.** Ela é a que a
  Virada A vai usar. Trocar no painel do Supabase antes da janela é um clique;
  em seguida basta atualizar `destino.env`, e o script cuida do resto.
- `SUPABASE_SERVICE_ROLE_KEY` do projeto novo **não foi aplicada em lugar
  nenhum**, de propósito: trocá-la moveria o Storage junto, e o Storage fica no
  projeto antigo (§7.1). Se ela for para a Vercel, as 293 URLs de `/api/midia/…`
  passam a apontar para um bucket que não existe.

### O que falta para a virada de verdade

Uma janela combinada. Sugestão: **05:00 BRT** — os crons rodam 07:00, 08:00 e
09:00 BRT, e às cinco não há ninguém trabalhando nem mensagem de WhatsApp
entrando. Dentro dela:

```bash
node scripts/virada/virada.mjs congelar
node scripts/virada/virada.mjs dump
node scripts/virada/virada.mjs restaurar --limpar-destino
node scripts/virada/virada.mjs conferir
node scripts/virada/virada.mjs apontar --confirmo=zdvfizjsgsjsunaspzue
node scripts/virada/virada.mjs verificar
```

Os quatro primeiros já rodaram hoje contra este destino, nesta ordem, com estes
argumentos. O único que a janela estreia é o `apontar` — e ele é o único
irreversível.

---

## 11. A virada, executada em 07/09/2026

Janela combinada com a equipe avisada. **Aberta às 07:52:20, fechada às
07:57:29 — 5 minutos e 9 segundos**, contra os 6 a 12 estimados.

| horário | passo | resultado |
|---|---|---|
| 07:52:20 | `congelar` | três roles somente-leitura, 1 conexão derrubada, `25006` provado pelo pooler |
| 07:54:24 | `dump` | 3,9 MB (completo) + 3,6 MB (`public`), SHA-256 `e78fc172…`, 667 entradas |
| 07:54:50 | `restaurar --limpar-destino` + `conferir` | 667 entradas em transação única; **12.738 linhas idênticas nas 69 tabelas** |
| 07:57:29 | `apontar` | `DATABASE_URL` e `DIRECT_URL` trocadas, redeploy concluído |

**O resultado, medido de dentro da função em `gru1`, oito chamadas:**

| | mediana |
|---|---|
| antes (`us-west-1`), medido às 07:45 de hoje | **172 ms** |
| depois (`sa-east-1`) | **3 ms** |

**57x.** O `verificar` anunciou "187x" na hora, e o número estava errado: a linha
de base dele vinha de **uma única** chamada do preflight, que pagou o cold start
da função e marcou 1.119 ms. O ganho real é contra a mediana de 172 ms. O
`preflight` passou a tirar cinco amostras — uma amostra só não é uma medição, e
esse erro estava a caminho de virar número em documento.

**As seis linhas que a noite gravou.** O ensaio de ontem copiou 12.732 linhas; o
dump de hoje levou 12.738. A diferença é dado real criado entre as duas
execuções, e é exatamente o motivo de o `apontar` recusar cópia de ensaio.

**Confirmado depois da virada, pelos dois lados:**

- São Paulo **aceita** escrita pelo pooler que a aplicação usa;
- `us-west-1` **recusa** com `25006`. O banco antigo continua congelado de
  propósito: nenhum deploy esquecido consegue gravar nele e criar dois bancos com
  verdades diferentes. Ele segue servindo os arquivos (§7.1).

**Um risco que sobrou e foi fechado no mesmo dia:** o `.env.local` continuava
apontando para o banco antigo. Como o `prisma.config.ts` carrega esse arquivo
primeiro, **todo comando local de Prisma passaria a ler o banco abandonado** — e
a responder com verdade velha, sem erro nenhum. Reapontado para São Paulo, com
backup em `~/nuflow-virada/env-local-antes-da-virada.bak`.

### O que ainda não foi feito

1. **A passada humana pelas telas.** Nenhuma medição substitui: login, Kanban das
   duas empresas, uma demanda aberta, uma mudança de status, o WhatsApp
   recebendo.
2. **A senha do `postgres` do projeto novo passou pelo chat** — de novo, agora a
   rotacionada. Ela é a credencial de produção hoje. Rotacionar outra vez custa
   um clique no painel e um `apontar` de trinta segundos, sem janela e sem
   congelar nada, porque não move dado.
3. **Migration `20260906000000`**, pelo caminho normal de release.
4. **Virada B — ligar o RLS.** Agora ela é barata: a consulta com transação, que
   custava 810 ms em US-West, custa ~27 ms aqui. `ligar-rls`, e `desligar-rls` se
   qualquer tela vier vazia.

---

## 12. O que a virada esqueceu — 08/09/2026, 24 horas depois

A Virada A trocou as variáveis **na Vercel**. Ninguém trocou os secrets **no
GitHub**, e nada no processo pedia isso.

Vinte e quatro horas depois, o primeiro release desde a mudança de região tentou
aplicar uma migration e devolveu:

```
Error: ERROR: cannot execute INSERT in a read-only transaction
  at migration_name="20260906000000_rls_set_role_para_o_verificador"
  ... aws-1-us-west-1.pooler.supabase.com:5432
```

`us-west-1`. O release estava aplicando no banco **abandonado** — os secrets
`DIRECT_URL_PRODUCAO` e `DATABASE_URL_PRODUCAO` do environment `producao` eram
de **20/08**, dezoito dias antes da virada, e nunca foram reapontados.

**O congelamento do §5 salvou a operação.** Ele existia para impedir "dois bancos
com verdades diferentes", e foi exatamente isso que ele fez. Sem ele, o release
teria aplicado a migration em `us-west-1` com sucesso, o Actions ficaria verde, e
a produção continuaria sem as tabelas — uma falha silenciosa, do tipo que se
descobre dias depois e não se explica.

O custo real foi uma hora de Kanban vazio em produção, procurando defeito numa
migration que não tinha defeito nenhum.

### O que mudou

`preflight` ganhou a seção **GitHub — os secrets do release**. Secret é
write-only: não há como ler o valor e comparar com a URL do destino. O que dá
para comparar é a **data** — um secret gravado antes do último `apontar` é, por
construção, anterior à última troca de banco. Não prova que o valor está certo;
prova que está velho, que é o caso que aconteceu.

Verificado nos dois sentidos: com os secrets regravados em 09/09 o item fica
verde; com a data real de 20/08, ele reprova e nomeia o secret.

`apontar` passa a **avisar, no momento em que troca a Vercel**, que o GitHub
continua apontando para o banco antigo, com os dois comandos de regravação
prontos — que leem de `urls-destino.env` e não imprimem o valor na tela.

### O que continua sem trava

A senha do `postgres` de São Paulo agora vive em **três lugares**: Vercel,
`.env.local` e os secrets do GitHub. O §11 já registrava que ela precisa ser
rotacionada. Quando for, os três precisam mudar juntos — e o `preflight` só
consegue reclamar da data, nunca do valor.
