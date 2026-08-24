# Diagnóstico de Maturidade SaaS — NuFlow

Auditoria de código, schema e produção. **19/08/2026.**
Base medida: Supabase de produção (leitura), 64 tabelas, 2 organizações, 539 demandas.

---

## Veredito em uma frase

**O NuFlow já é multi-tenant na aplicação e não é multi-tenant no banco.** A separação
entre empresas existe, funciona hoje e foi construída com cuidado — mas ela é feita
inteiramente por disciplina de programador, validada por um auditor de texto. Não há
uma única linha de defesa abaixo do código. Para uso interno isso é aceitável. Para
vender, não é: o dia em que uma consulta nova esquecer o `organizacaoId`, o banco
entrega os dados sem reclamar.

O que **falta** não é o `company_id` — ele existe, se chama `organizacaoId` e está em
27 das 64 tabelas. Falta: **enforcement no banco (RLS), cobrança (zero), onboarding
(zero) e teto de escala nos crons.**

---

## Pilar 1 — Multi-tenancy

### O que já existe (e está certo)

- Modelo `Organizacao` com `slug` único, já preparado para subdomínio.
- `UsuarioOrganizacao` como tabela de vínculo — papel, categoria, áreas e permissão
  moram por empresa, não no usuário. É a modelagem correta.
- `organizacaoId` em 27 tabelas, com índice (`20260812000000_indices_organizacao`).
- `src/lib/org.ts`: `getOrgId`, `pertenceAOrg`, `requireDemandaOrg`, `requireCoberturaOrg`,
  `requireEventoGestaoOrg` — o padrão de ownership está desenhado e é usado.
- `scripts/auditar-tenancy.mjs` no CI, com allowlist que só encolhe.
- **Zero linhas órfãs.** Medido: nenhuma tabela tem `organizacaoId NULL`. A migração
  para `NOT NULL` é segura e barata — este é o achado que destrava tudo.

### Os furos — em ordem de gravidade

**1. RLS: 0 de 64 tabelas. 0 policies. (CRÍTICO)**
Medido no banco. Nenhuma migration cria política. E não basta ligar: o Prisma conecta
com o role dono via `DATABASE_URL`, que **ignora RLS por definição**. Ligar RLS sem
criar um role de aplicação não-superusuário é teatro — as policies existem e não
valem nada. A solução técnica está na seção "Plano de migração".

**2. Bucket de storage público e sem separação por empresa. (CRÍTICO)**
`src/app/api/demandas/[id]/upload-url/route.ts:76` e os outros três upload-url criam o
bucket `uploads` com `public: true`. O `storage.ts` faz o mesmo com `whatsapp-media`.
Os caminhos são `docs/{demandaId}/{timestamp}.pdf` — sem prefixo de empresa. Consequência:
**todo briefing, vídeo, nota fiscal e documento é legível por qualquer pessoa com a URL,
para sempre, sem login.** Hoje é um risco aceito internamente. No dia que houver dois
clientes pagantes, é o pior item deste documento. Bônus: cada upload chama `createBucket`
antes de subir — uma ida ao Supabase desperdiçada em toda requisição.

**3. `organizacaoId` é nullable em 20 das 27 tabelas.**
Uma linha com `NULL` é invisível para todo `where: { organizacaoId }` — não pertence a
ninguém e ninguém vê. Pior: **RLS sobre coluna nullable é impossível de escrever
corretamente.** Como não existe nenhuma linha órfã hoje, isso é um `ALTER COLUMN SET NOT NULL`
de baixo risco. Mas precisa ser feito antes do RLS, não depois.

**4. 12 tabelas com dado de cliente e nenhuma coluna de empresa.**
`historico_status` (1.644 linhas), `checklist_itens` (845), `coberturas_checklist` (362),
`agente_execucoes` (352), `demanda_produto` (220), `demanda_responsavel` (186),
`aprovacoes_video` (100), `arquivos` (100), `comentarios`, `convites_videomaker`,
`depoimentos`, `password_reset_tokens`. Elas se protegem hoje pelo FK do pai — o que
funciona na aplicação e **não funciona em RLS** sem um JOIN em toda policy (caro e frágil).
Precisam de `organizacaoId` denormalizado.

**5. `ProducaoManual` tem constraint que colide entre empresas. — BUG REAL, EM PRODUÇÃO**
`prisma/schema.prisma:1904`: `@@unique([competencia, area, grupo, categoria])`, sem
`organizacaoId`. Se a Contourline lançar "202608 / audiovisual / producao / Linha Med",
a empresa-teste **não consegue** lançar o mesmo — `src/app/api/producao-manual/route.ts:79`
estoura P2002. Não é vazamento, é negação de serviço cruzada. Já está no ar.

**6. `Demanda.codigo` é único global e gerado por sorteio de 4 dígitos.**
`src/app/api/publico/demanda/route.ts:44` → `VOP-EXT-{ano}-{rand}` com 9.000 valores
possíveis, **compartilhados entre todas as empresas e todos os anos**. Pelo paradoxo do
aniversário, com ~110 demandas por ano a chance de colisão passa de 50%. Com 533 demandas
já existentes, é sorte que ainda não estourou. Deve virar `@@unique([organizacaoId, codigo])`
com sequência por empresa.

**7. `orgPublica()` cai na Contourline quando não há `?org=`.**
`src/lib/org.ts:39`. Toda rota pública sem o parâmetro escreve dentro da **sua** empresa.
No modelo SaaS, o cliente que compartilhar o formulário público sem o slug manda a demanda
dele para o seu quadro. Precisa virar erro explícito, não fallback.

**8. Não existe troca de organização.**
`src/lib/auth.ts:71` carimba no JWT a **primeira** membership por `createdAt`. Usuário em
duas empresas fica preso na mais antiga para sempre. Falta um endpoint de troca que
revalide a membership no servidor e reemita o token — nunca aceitar `organizacaoId` vindo
do cliente.

**9. O auditor é um lint, não uma garantia.**
`scripts/auditar-tenancy.mjs` decide **por arquivo**: se o arquivo cita `organizacaoId`
em qualquer linha, todas as consultas dele passam. Foi exatamente por essa fresta que o
vazamento do `buscarVideomakers` escapou (registrado na R4). A allowlist tem 33 arquivos,
incluindo `/api/relatorios/route.ts` — relatório sem escopo de empresa. O auditor é bom
para impedir a próxima violação grosseira; ele não substitui enforcement.

**10. Decisão de produto pendente: `videomakers` é global (65 linhas, sem coluna de empresa).**
Foi escolha consciente de LGPD — o perfil é da pessoa, o vínculo comercial é da empresa
(`VideomakerOrganizacao`). Correto para hoje. Em SaaS, significa que o cliente A descobre
que o cliente B contrata o mesmo freelancer. **Isso precisa de decisão sua, não minha:**
a rede compartilhada é um ativo do produto ou um vazamento competitivo?

---

## Pilar 2 — Cobrança e gestão de planos

**Status: 0%.** Nenhuma ocorrência de Stripe, plano, assinatura ou limite no código.

O que falta, em ordem:

1. **Modelos**: `Plano` (limites), `Assinatura` (org → status, período, `stripeCustomerId`,
   `stripeSubscriptionId`), `UsoMensal` (org, competência, contadores).
2. **Stripe**: Checkout para conversão, Customer Portal para upgrade/cancelamento/cartão
   (evita construir tela de billing), webhook com verificação de assinatura **e
   idempotência por `event.id`** — webhook duplicado é o bug clássico aqui.
3. **Um único ponto de enforcement**: `src/lib/limites.ts`, consultado onde se cria
   recurso — usuário, demanda, upload. Espalhar a checagem é como o `organizacaoId`
   virou dívida; não repetir o padrão.
4. **Estado de inadimplência**: o que acontece no dia 31 sem pagamento? Bloqueio de
   escrita com leitura preservada é o mais civilizado — e precisa ser decidido antes
   de codar, não depois.

**O item que ninguém lembra e que dói:** os 7 agentes de IA rodam **para cada organização**
com a **sua** chave da Anthropic/OpenAI. Hoje, com 2 orgs, é ruído. Com 30 clientes, o
custo de IA cresce linear com a base e **você não tem nenhuma atribuição de custo por
cliente** — vai receber uma fatura e não saber quem gastou. A tabela `agente_execucoes`
(352 linhas) já existe e é o lugar certo: precisa de `tokensEntrada`, `tokensSaida` e
`custoEstimado` **antes** da primeira venda, não depois.

---

## Pilar 3 — Onboarding

**Status: manual.** Existe `/api/admin/organizacoes` protegida por `requireSuperAdmin`.
Não existe auto-cadastro.

O que falta:

1. **Signup transacional**: criar `Organizacao` + `UsuarioOrganizacao` (papel admin) +
   assinatura trial, em **uma transação**. Falha parcial aqui deixa órfão — e são
   justamente os órfãos que o RLS não protege.
2. **Seed da nova empresa.** Hoje `departamento` é validado contra `ConfigParametro`
   (grupo `departamentos`) **por organização**. Empresa nova nasce com a lista vazia:
   o usuário abre o sistema e não consegue criar demanda. É o furo silencioso mais
   provável do onboarding. Precisa de um `seedOrganizacao()` com departamentos, tipos
   de demanda e templates de checklist padrão.
3. **`/api/checklist-templates/seed` e `/api/fabricantes/seed` são globais** (estão na
   allowlist). `checklist_templates` e `fabricantes` não têm coluna de empresa. Ou viram
   por-empresa, ou viram catálogo global explícito e read-only.
4. **Convite de membro.** Existe `ConviteVideomaker`; não existe convite genérico de
   usuário para uma organização. Sem isso, o cliente novo não consegue montar o time
   sozinho — e você vira o suporte manual de todo onboarding.
5. **Subdomínio.** O `slug` já está preparado. Decidir se `cliente.nuflow.space` entra
   agora (muda middleware e resolução de org) ou fica para depois. **Recomendo depois** —
   não bloqueia venda.

---

## Pilar 4 — Estabilidade: o que derruba todos os clientes de uma vez

Em ordem de probabilidade × dano.

**1. ~~`prisma migrate deploy` dentro do `buildCommand`~~ — RESOLVIDO em 20/08/2026,
depois de cobrar o preço.** (era `vercel.json:2`)
Uma migration que falha derruba o **build**, ou seja, o deploy inteiro. Pior: builds
concorrentes (preview + produção) podem correr migration ao mesmo tempo, e o resultado é
indefinido. Migration é passo de release, não de build. Já teve incidente relacionado
("Redeploy após destravar a migration", commit `08ab5bf`).

**2. Cron serial sobre todas as organizações, com teto de 300s.** (`src/app/api/cron/agentes/route.ts:16`)
7 agentes × N organizações × chamadas de IA, **em série, numa função só**. Com N=2
funciona. Em torno de N=10–15 a função morre no timeout e as **últimas organizações do
laço simplesmente não recebem nada** — e o erro de cada org é capturado num array que
ninguém lê. É uma falha silenciosa, do tipo que o cliente descobre antes de você.
Solução: uma invocação por organização (fan-out) ou fila.

**3. Um Postgres para todos, sem `statement_timeout`.**
Um cliente rodando `/api/relatorios` (que está na allowlist, sem escopo) satura o pooler
para todo mundo. Sem timeout de statement, uma consulta ruim segura conexão indefinidamente.

**4. `next-auth` em `5.0.0-beta.30`.** Um beta no caminho de autenticação de um produto
pago. Já registrado no `ESTADO-ATUAL.md`; em SaaS deixa de ser dívida e vira risco.

**5. Sem monitoramento de erro.** Não há Sentry nem equivalente. Com um cliente, você
descobre pelo WhatsApp. Com vinte, você descobre pelo cancelamento.

**6. Rate limit em memória** (`src/lib/rate-limit.ts`). Por instância serverless, então o
limite real é `10 × instâncias`. Suficiente contra força bruta; **inútil como cota por
cliente**. Quando houver plano, precisa de contador compartilhado.

**7. Evolution API única no Railway.** `ConfigWhatsapp.organizacaoId` é `@unique` (1 por
empresa — correto), mas a instância é infra compartilhada, sem isolamento. Uma queda
cala o WhatsApp de todos os clientes ao mesmo tempo.

---

## Roadmap de adaptação

Quatro fases. **A Fase 1 é pré-requisito de venda — as outras não.**

### Fase 1 — Isolamento real (bloqueia a primeira venda)

| # | Entrega | Risco |
|---|---|---|
| 1.1 | `organizacaoId` nas 12 tabelas filhas, backfill pelo pai | baixo (0 órfãos) |
| 1.2 | `NOT NULL` nas 20 colunas nullable | baixo (0 órfãos) |
| 1.3 | Constraints por empresa: `ProducaoManual`, `Demanda.codigo`, `EventoGestao.codigo`, `EventoCobertura.slug` | baixo |
| 1.4 | Código de demanda sequencial por empresa (fim do sorteio) | baixo |
| 1.5 | **Prisma Client Extension** que injeta `organizacaoId` em toda consulta | médio — toca tudo |
| 1.6 | Role `app_user` + RLS em todas as tabelas de cliente | médio |
| 1.7 | Storage privado, caminho `org/{id}/...`, URL assinada com expiração | médio — quebra URLs antigas |
| 1.8 | `orgPublica()` sem fallback: sem slug, 404 | baixo |
| 1.9 | Endpoint de troca de organização + revalidação no servidor | baixo |

### Fase 2 — Escala e estabilidade

~~`migrate deploy` fora do build~~ (feito) · cron com fan-out por organização · `statement_timeout` ·
Sentry · métricas de token/custo de IA por organização em `agente_execucoes`.

### Fase 3 — Comercialização

`Plano`/`Assinatura`/`UsoMensal` · Stripe Checkout + Portal + webhook idempotente ·
`lib/limites.ts` · política de inadimplência.

### Fase 4 — Autonomia do cliente

Signup transacional · `seedOrganizacao()` · convite de membro · tela de billing ·
(opcional) subdomínio por slug.

---

## Plano de migração — Fase 1, passo a passo

O que eu executo quando você aprovar. Nenhum passo apaga dado.

**Passo 0 — Backup.** `pg_dump` do banco de produção via `DIRECT_URL`, arquivo fora do
repo, hash conferido. Só depois disso qualquer DDL roda. *(Você confirma que o dump
existe antes de eu seguir.)*

**Passo 1 — Colunas (aditivo, invisível para a aplicação).**
`ALTER TABLE ... ADD COLUMN "organizacaoId" TEXT` nas 12 tabelas filhas, nullable.
`UPDATE` de backfill pelo FK do pai (`historico_status` → `demandas`, `arquivos` →
`demandas`, etc.). Verificação: `count(*) where organizacaoId is null` = 0 em cada uma.
Aplicação continua rodando sem saber que a coluna existe. **Reversível.**

**Passo 2 — `NOT NULL` + FK + índice.** Só nas tabelas cujo passo 1 verificou zero nulos.
Aplicação continua indiferente. **Reversível.**

**Passo 3 — Constraints por empresa.** Trocar os `@@unique` globais por compostos com
`organizacaoId`. Antes de cada troca, consulta de colisão para garantir que o índice
composto pode ser criado. Corrige o bug do `ProducaoManual` no mesmo passo.

**Passo 4 — Extension do Prisma.** Camada única em `src/lib/prisma.ts` que injeta
`organizacaoId` a partir de um contexto por requisição. Aqui está o risco de regressão:
**vai em PR próprio**, com os 182 testes verdes, o auditor limpo, e revisão manual das
consultas legitimamente globais (usuário, organização, fabricante). Antes do merge, uma
bateria de teste em `empresa-teste` confirmando que nenhuma tela perdeu dado.

**Passo 5 — RLS.** Criar role `app_user` sem `BYPASSRLS`, dar `GRANT` só no necessário,
ligar `ENABLE ROW LEVEL SECURITY` + `FORCE`, policy padrão
`organizacaoId = current_setting('app.org_id', true)`. A aplicação passa a abrir cada
consulta com `SET LOCAL app.org_id` dentro da transação (compatível com o pooler em modo
transaction). A troca do `DATABASE_URL` para o role novo é o único momento de risco real —
faço em janela combinada, com o role antigo pronto para voltar em um `vercel env` e
redeploy. Teste de aceitação: forjar uma sessão da empresa-teste e provar que
`select * from demandas` retorna 6 linhas, não 539.

**Passo 6 — Storage.** Bucket novo, privado, caminho `org/{organizacaoId}/...`; leitura
por URL assinada de curta duração. Os arquivos antigos: migrados por script e as URLs
públicas antigas mantidas vivas por um período, ou invalidadas de uma vez? **Preciso da
sua decisão** — invalidar quebra link que já foi mandado por WhatsApp para cliente.

**Ordem de merge:** passos 1–3 em um PR (schema puro, sem efeito visível), passo 4 em PR
isolado, passos 5–6 em PR final com janela. Nunca os três juntos.

---

## As três decisões que são suas, não minhas

1. **Rede de videomakers**: compartilhada entre empresas (ativo do produto) ou isolada
   (privacidade competitiva do cliente)?
2. **URLs públicas de arquivo já distribuídas**: podem quebrar na migração do storage,
   ou precisam de período de convivência?
3. **Ordem**: eu recomendo Fase 1 completa antes de qualquer linha de Stripe — vender
   antes de isolar é assumir uma dívida que você paga com a reputação. Se a pressão
   comercial for outra, diga, e eu inverto 2 e 3.

---

## Adendo — 19/08/2026, após executar a Fase A

Achados da execução. **Corrigem afirmações feitas acima e no `ESTADO-ATUAL.md` §5.**

### O que foi feito e está em produção

- **Backup**: `~/nuflow-backups/nuflow-prod-20260819-195612.dump` (3,4 MB), verificado por
  `pg_restore` — 66 videomakers, 552 demandas, 1.690 históricos recuperáveis. SHA-256 ao lado.
- **Saneamento aplicado** (`prisma/sanear-perfil-global.ts`): 3 vínculos criados, 3 gravações
  comerciais, 2 fiscais. Verificação independente confirmou que a chave PIX cifrada
  **decifra de volta ao valor original**. Zero perfis sem vínculo.
- **Três caminhos de escrita corrigidos** para gravar no vínculo em vez do perfil global,
  via o helper novo `src/lib/videomaker-dados.ts`.

### Correção: "as colunas não são mais lidas" está errado

O `ESTADO-ATUAL.md` §5 afirma que, depois da R4.1, as colunas antigas de `Videomaker`
não são mais lidas. Sobre a **tela de edição** está certo. Fora dela, não: havia **3
caminhos de escrita** e restam **9 de leitura**. O DROP não era um passo de limpeza —
é uma migração de 12 pontos.

Escritas (corrigidas nesta sessão):

| Rota | Gravava no perfil global |
|---|---|
| `api/publico/videomaker` | cpfCnpj, razaoSocial, nomeFantasia, representante, endereco, chavePix, valorDiaria, observacoes |
| `api/videomakers` (POST) | cpfCnpj, valorDiaria, dadosBancarios, observacoes |
| `api/demandas/[id]/pagamento` | chavePix — **em texto puro**, sem cifra |

Leituras (ainda pendentes, bloqueiam o DROP): `ia/agentes/triagem`,
`relatorios/metricas` (2×), `relatorios/gerar`, `demandas/[id]/status`,
`videomakers` (GET), `videomakers/[id]` (GET), `videomakers/[id]/performance`,
`equipe-disponivel`, `lib/ia-tools-executor`.

### Dois bugs vivos encontrados no caminho

**1. O custo do trabalho usa a diária errada.** `api/demandas/[id]/status/route.ts:257`
cria o `CustoVideomaker` lendo `valorDiaria` do **perfil global**. Desde a R4.1 a diária
negociada mora no vínculo. Quem tem valor diferente nos dois lugares tem custo lançado
errado; quem tem o global nulo tem custo lançado como **R$ 0**. É dinheiro, e é hoje.

**2. A lista negra não funciona — e é global.** `equipe-disponivel/route.ts:47`,
`ia/agentes/triagem` e `lib/ia-tools-executor.ts:169` filtram por `emListaNegra` do
**perfil global**, onde há 0 registros. Ou seja: bloquear um profissional não o remove
dessas telas. E se alguém marcasse ali, ele sumiria para **todas as empresas** — o
oposto do isolamento. A lista negra real (`VideomakerOrganizacao.emListaNegra`) é ignorada.

### Terceiro achado, de arquitetura

Um profissional **`tipoContrato = "interno"` sem vínculo fica invisível para todas as
organizações** sob a Política B da RLS. Havia um caso em produção (cadastrado no mesmo dia).
O saneamento passou a criar o vínculo e a conferência passou a barrar o DROP enquanto existir
um caso — mas a lição vale para o cadastro: **criar perfil interno sem vínculo é um bug**,
e hoje nada impede.

### Risco herdado que a migração amplia

`secret-crypto.ts` deriva a chave de `NEXTAUTH_SECRET` quando `EMAIL_ENCRYPTION_KEY` não
existe — e ela não existe. Quanto mais dado fiscal for cifrado (a Fase A acabou de somar
mais), maior o estrago de rotacionar o `NEXTAUTH_SECRET`. E subir o `next-auth` de versão,
que já está na fila, é exatamente a operação que costuma rotacionar esse segredo.
**Definir `EMAIL_ENCRYPTION_KEY` deveria vir antes da subida do next-auth**, com re-gravação
do que já está cifrado.

---

## Adendo — 20/08/2026: o item nº 1 cobrou o preço antes de ser resolvido

O primeiro ponto de estabilidade deste documento dizia, em 19/08:

> Uma migration que falha derruba o **build**, ou seja, o deploy inteiro. Pior:
> builds concorrentes (preview + produção) podem correr migration ao mesmo tempo,
> e o resultado é indefinido. Migration é passo de release, não de build.

Eu subestimei. O problema não era migration concorrente — era que **o preview de
qualquer branch, mergeada ou não, aplicava DDL no banco de produção**.

**O que aconteceu.** Em 20/08 às 12:25 UTC, um `git push` numa branch de trabalho
disparou um build de preview. O `buildCommand` rodou `prisma migrate deploy` contra o
banco real e aplicou um `DROP COLUMN` de 11 colunas. Ninguém revisou, ninguém aprovou,
e a operação é irreversível. O PR daquela branch nem existia ainda.

**Por que não virou desastre.** A migration carregava uma trava transacional própria:
um bloco `DO` que, na mesma transação do DROP, conferia que todo valor privado tinha
equivalente nas tabelas por empresa e abortaria sem apagar nada se não tivesse. Ela
conferiu, passou, e o DROP seguiu. A verificação posterior contra o backup de 19/08
achou 211 valores privados e os 211 nas tabelas de destino, incluindo as chaves PIX
cifradas decifrando de volta ao original.

Foi engenharia defensiva **dentro do artefato** que salvou — não a esteira. A lição é
que a trava na migration não é zelo excessivo: é a última linha quando o processo falha.

**O que mudou.**

- `buildCommand` virou `prisma generate && next build`. Build gera artefato, não muda banco.
- Release passou a ser `.github/workflows/release-migrations.yml`, com gate de aprovação
  humana num GitHub Environment. A Vercel não tem release phase — não existe passo entre
  o build e o tráfego entrar —, então ele mora no GitHub Actions.
- Regra de ordem explícita: **deploy primeiro, migration depois**. Toda migration precisa
  ser compatível com o código que ainda está rodando.
- `scripts/guarda-banco.mjs` bloqueia **sempre** sob `VERCEL`, sem variável de escape, e
  exige `RELEASE_AUTORIZADO=sim` para escrever em produção pelo GitHub Actions.
- Os ambientes de Preview da Vercel deixaram de apontar para o banco de produção.

**Detalhe que vale registrar:** endurecer o guarda **não teria impedido** o incidente. O
`buildCommand` chamava `prisma migrate deploy` direto, não `npm run db:deploy` — o guarda
nunca esteve no caminho. Trava só protege o que ela consegue interceptar.
