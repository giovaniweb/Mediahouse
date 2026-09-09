# Espelhamento Cross-Tenant — plano de ação

Como a Contourline terceiriza a execução de uma demanda para o NuFlow de outra
produtora **sem duplicar o registro** e **sem afrouxar o isolamento**.

Escrito em 08/09/2026 · decisão de produto tomada (Espelhamento, não Cópia) ·
**parceria previamente aceita aprovada pelo Giovani em 08/09/2026** (§6.1).

> **Estado: os quatro PRs implementados** e no PR
> [#68](https://github.com/giovaniweb/Mediahouse/pull/68), com o CI verde. As 24
> migrations aplicam num Postgres 18 limpo, `migrate diff` diz *No difference
> detected*, e o `verificar-rls.mjs` prova 22 verificações contra um Postgres 16
> real — 9 delas novas, sobre a fronteira do espelho.
>
> **Falta o que nenhuma medição substitui:** a passada humana pelas telas, e a
> ordem de release do §7.

Documentos que este plano assume lidos: `RLS-PLANO-DE-VOO.md` (a política é
`organizacaoId = current_setting('app.org_id')`), `AUDITORIA-PERMISSOES.md`
(permissão efetiva, fail-closed) e `AUDITORIA-JOB-WORKFLOW.md` §2.3 (o que a RLS
sabe responder e o que ela não sabe).

---

## 0. A frase que decide o resto

**O espelhamento é uma aresta entre duas empresas, não uma segunda linha na
tabela.** O card continua sendo um único registro em `demandas`, com
`organizacaoId` da Contourline, imutável. O que nasce é uma linha em
`demanda_compartilhamento` dizendo "esta demanda também é visível e operável
pela empresa X, neste escopo".

É a mesma decisão do commit `02c5064` — *converter é virar uma chave, não criar
outro registro*. Duplicar o card produziria dois estados que precisam ser
sincronizados para sempre, e o dia em que divergirem, ninguém sabe qual dos dois
é verdade.

**O que este plano NÃO faz**, e é deliberado:

| | |
|---|---|
| não move a posse | `demandas.organizacaoId` nunca muda. Nenhum caminho de código o escreve hoje, e a trava da §2.3 garante que continue assim |
| não abre a empresa | o destino ganha acesso **a esta demanda**, não ao quadro, nem à agenda, nem ao financeiro da origem |
| não conta duas vezes | o card espelhado permanece nas métricas da origem e **não entra** nas do destino (§3.4) |
| não depende da Virada B | as políticas entram inertes, como a `20260826000000` entrou. Com RLS desligada, quem isola é o código; com ela ligada, o banco confirma (§6) |

---

## 1. Banco

### 1.1 A tabela pivô

```prisma
enum EscopoCompartilhamento {
  acompanhar // só leitura: vê o card e a timeline, não muda nada
  executar   // move status, comenta, envia material
}

model DemandaCompartilhamento {
  id                   String   @id @default(cuid())
  demandaId            String
  /// Copiado de `demandas.organizacaoId` por gatilho. NÃO é digitável — ver §1.2.
  organizacaoOrigemId  String
  organizacaoDestinoId String
  /// Rótulos congelados no ato. Ver §1.6: por que não lemos `organizacoes`.
  nomeOrigem           String
  nomeDestino          String
  escopo               EscopoCompartilhamento @default(executar)
  criadoPorId          String
  criadoEm             DateTime @default(now())
  revogadoEm           DateTime?
  revogadoPorId        String?

  demanda    Demanda      @relation(fields: [demandaId], references: [id], onDelete: Cascade)
  origem     Organizacao  @relation("CompartilhamentoOrigem",  fields: [organizacaoOrigemId],  references: [id], onDelete: Cascade)
  destino    Organizacao  @relation("CompartilhamentoDestino", fields: [organizacaoDestinoId], references: [id], onDelete: Cascade)

  @@unique([demandaId, organizacaoDestinoId])
  @@index([organizacaoDestinoId, revogadoEm])
  @@index([demandaId])
  @@map("demanda_compartilhamento")
}
```

Três detalhes que não são estilo:

**`organizacaoOrigemId` é denormalizado, e aqui isso é obrigatório.** A Fase 2
(`DIAGNOSTICO-SAAS.md`, adendo de 25/08) recusou denormalizar empresa nas tabelas
filhas justamente porque a coluna pode discordar do pai. A exceção existe por
recursão: a política de `demandas` vai perguntar a esta tabela, e se esta tabela
perguntasse de volta a `demandas` para saber a origem, o Postgres entraria em
recursão de política — o clássico erro `infinite recursion detected in policy`.
A aresta precisa ser legível **sem** ler o vértice. O gatilho da §1.2 é o preço
que se paga por isso.

**`@@unique([demandaId, organizacaoDestinoId])` com revogação por data, não por
DELETE.** Revogar apagando a linha perde a prova de que o acesso existiu — e é
exatamente o registro que uma auditoria de LGPD vai pedir. Consequência: o
`unique` impede recompartilhar com a mesma empresa depois de revogar. A rota de
compartilhar trata isso como *reativação* (`revogadoEm = null`, novo
`criadoEm`), nunca como linha nova.

**`revogadoEm` entra no índice** porque toda política e toda consulta filtram por
ele. Sem isso, cada leitura de card espelhado varre a tabela.

### 1.2 O gatilho que torna a origem indigitável

```sql
CREATE OR REPLACE FUNCTION fixar_origem_compartilhamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER            -- roda como dono: enxerga a demanda sem depender da RLS
SET search_path = public
AS $$
DECLARE
  org_dona TEXT;
  nome_origem TEXT;
  nome_destino TEXT;
BEGIN
  SELECT d."organizacaoId" INTO org_dona FROM demandas d WHERE d.id = NEW."demandaId";
  IF org_dona IS NULL THEN
    RAISE EXCEPTION 'Demanda % não existe.', NEW."demandaId";
  END IF;
  IF org_dona = NEW."organizacaoDestinoId" THEN
    RAISE EXCEPTION 'Compartilhar uma demanda com a própria dona não faz sentido.';
  END IF;

  SELECT o.nome INTO nome_origem  FROM organizacoes o WHERE o.id = org_dona;
  SELECT o.nome INTO nome_destino FROM organizacoes o WHERE o.id = NEW."organizacaoDestinoId";
  IF nome_destino IS NULL THEN
    RAISE EXCEPTION 'Organização de destino % não existe.', NEW."organizacaoDestinoId";
  END IF;

  NEW."organizacaoOrigemId" := org_dona;
  NEW."nomeOrigem"  := nome_origem;
  NEW."nomeDestino" := nome_destino;
  RETURN NEW;
END $$;

CREATE TRIGGER compartilhamento_origem_do_pai
  BEFORE INSERT OR UPDATE ON demanda_compartilhamento
  FOR EACH ROW EXECUTE FUNCTION fixar_origem_compartilhamento();
```

O que ele fecha: sem isso, o `organizacaoOrigemId` é um campo que a aplicação
escreve — e um campo que a aplicação escreve é um campo que um bug escreve
errado. Com ele, a origem é **derivada da demanda**, sempre, inclusive num
`UPDATE`. É a mesma lógica da trava dentro da migration que salvou o incidente
de 20/08: engenharia defensiva no artefato, não no processo.

### 1.3 A política da própria aresta — e a assimetria que a torna segura

```sql
ALTER TABLE demanda_compartilhamento ENABLE ROW LEVEL SECURITY;

-- Ler: os dois lados. É o que faz o card aparecer para o destino.
CREATE POLICY "compartilhamento_leitura" ON demanda_compartilhamento
  FOR SELECT TO app_user
  USING ("organizacaoOrigemId"  = current_setting('app.org_id', true)
      OR "organizacaoDestinoId" = current_setting('app.org_id', true));

-- Criar, alterar e revogar: SÓ a origem. O destino não se convida.
CREATE POLICY "compartilhamento_escrita_da_origem" ON demanda_compartilhamento
  FOR ALL TO app_user
  USING      ("organizacaoOrigemId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoOrigemId" = current_setting('app.org_id', true));
```

Esta é a linha inteira da segurança do recurso. Políticas permissivas se somam
por OR, então o SELECT vira `origem OR destino` e o INSERT/UPDATE/DELETE fica
`origem`. Se as duas regras vivessem numa política só (`FOR ALL` com o OR), o
destino poderia **apagar a própria restrição** — ou, pior, inserir uma aresta
apontando qualquer demanda para si mesmo. O `WITH CHECK` do `FOR ALL` é o que
recusa isso, e o gatilho da §1.2 é a segunda parede.

### 1.4 `demandas`: uma segunda política, nunca uma política editada

A `demandas_por_org` **não muda**. Some-se a ela:

```sql
CREATE POLICY "demandas_espelhadas_leitura" ON demandas
  FOR SELECT TO app_user
  USING (EXISTS (
    SELECT 1 FROM demanda_compartilhamento c
    WHERE c."demandaId" = demandas.id
      AND c."organizacaoDestinoId" = current_setting('app.org_id', true)
      AND c."revogadoEm" IS NULL));

CREATE POLICY "demandas_espelhadas_execucao" ON demandas
  FOR UPDATE TO app_user
  USING (EXISTS (
    SELECT 1 FROM demanda_compartilhamento c
    WHERE c."demandaId" = demandas.id
      AND c."organizacaoDestinoId" = current_setting('app.org_id', true)
      AND c."revogadoEm" IS NULL
      AND c.escopo = 'executar'))
  WITH CHECK (EXISTS (
    SELECT 1 FROM demanda_compartilhamento c
    WHERE c."demandaId" = demandas.id
      AND c."organizacaoDestinoId" = current_setting('app.org_id', true)
      AND c."revogadoEm" IS NULL
      AND c.escopo = 'executar'));
```

Editar a política existente em vez de somar outra tornaria impossível responder
"esta linha saiu por posse ou por espelho?" ao depurar. Somando, o `pg_policies`
continua legível e a `demandas_por_org` continua sendo a mesma que o
`verificar-rls.mjs` já prova hoje.

Note que **não há política de DELETE para o espelho**. Excluir o card é da
origem, sempre.

### 1.5 O que a RLS não sabe dizer: quais COLUNAS

`WITH CHECK` enxerga a linha nova, nunca a antiga. Não existe forma de escrever
em RLS "o destino pode mudar `statusInterno` mas não `dataLimite`". E
`GRANT UPDATE (coluna)` não serve: `app_user` é um role só, então a restrição
valeria para todo mundo, inclusive para a dona.

Então a coluna é decidida por gatilho — o mesmo lugar, a mesma transação:

```sql
CREATE OR REPLACE FUNCTION limitar_colunas_do_espelho()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE org_atual TEXT := current_setting('app.org_id', true);
BEGIN
  -- Sem empresa declarada (RLS desligada, dono do banco, migration): não interfere.
  IF org_atual IS NULL OR org_atual = '' THEN RETURN NEW; END IF;
  -- Quem age é a dona: nada a limitar.
  IF OLD."organizacaoId" = org_atual THEN RETURN NEW; END IF;

  IF NEW."organizacaoId" IS DISTINCT FROM OLD."organizacaoId" THEN
    RAISE EXCEPTION 'Espelho não muda a posse da demanda.';
  END IF;

  -- A lista branca do executor. Tudo que não está aqui volta ao valor anterior,
  -- em silêncio: a intenção é que a tela do destino simplesmente não ofereça.
  NEW.codigo        := OLD.codigo;
  NEW.titulo        := OLD.titulo;
  NEW.descricao     := OLD.descricao;
  NEW.prioridade    := OLD.prioridade;
  NEW."dataLimite"  := OLD."dataLimite";
  NEW."solicitanteId" := OLD."solicitanteId";
  NEW."gestorId"    := OLD."gestorId";
  NEW."clienteFinalNome"     := OLD."clienteFinalNome";
  NEW."clienteFinalTelefone" := OLD."clienteFinalTelefone";
  NEW."clienteFinalEmail"    := OLD."clienteFinalEmail";
  NEW."telefoneSolicitante"  := OLD."telefoneSolicitante";
  NEW."publicToken"          := OLD."publicToken";
  NEW."publicTokenAtivo"     := OLD."publicTokenAtivo";
  -- ... a lista completa sai de um diff contra o schema no PR, não daqui.
  RETURN NEW;
END $$;

CREATE TRIGGER demandas_espelho_colunas
  BEFORE UPDATE ON demandas
  FOR EACH ROW EXECUTE FUNCTION limitar_colunas_do_espelho();
```

**Escolha consciente:** restaurar em silêncio, em vez de `RAISE EXCEPTION`. Um
`PATCH` de status que mande o objeto inteiro (e o `DemandaDetalhe` manda) faria
o card do destino falhar inteiro por causa de um campo que ninguém tocou.

**O que a implementação melhorou em relação a este rascunho.** Escrever coluna a
coluna (`NEW.titulo := OLD.titulo`) exigiria um teste de deriva para gritar
quando o schema andasse — e teste de deriva é coisa que se aprende a ignorar. O
gatilho real subtrai em vez de enumerar:

```sql
NEW := jsonb_populate_record(NEW, to_jsonb(OLD) - permitidas);
```

Tudo que não está na lista branca volta ao valor da dona, inclusive coluna que
ainda não existe. **Coluna nova em `demandas` nasce imutável para o espelho sem
ninguém precisar lembrar deste arquivo** — e a §5.3 deixou de ser necessária.

**O que o destino pode escrever:** `statusInterno`, `statusVisivel`,
`posicaoKanban`, `linkBrutos`, `linkFolderBrutos`, `linkFinal`,
`motivoImpedimento`, `dataCaptacao`, `videomakerId`, `editorId`, `updatedAt`.
Tudo o mais é da origem.

### 1.6 Tabelas filhas: o que atravessa e o que não

As políticas filhas perguntam ao pai com `p."organizacaoId" = app.org_id`.
Estender `demandas` **não as estende automaticamente** — cada uma é uma decisão.
E é bom que seja: é aqui que se separa "operar o job" de "ver a operação da
Contourline".

| tabela | espelha? | por quê |
|---|---|---|
| `historico_status` | **sim** (SELECT + INSERT) | mover o card grava aqui. Sem isso, o destino não consegue mover nada |
| `comentarios` | **sim** (SELECT + INSERT) | é o canal entre as duas equipes. UPDATE/DELETE continuam da origem |
| `arquivos` | **sim** (SELECT + INSERT) | brutos e entrega. **Sem DELETE**: o destino não apaga material da origem |
| `checklist_itens` | **sim** (SELECT + UPDATE) | é a lista de execução |
| `aprovacoes_video` | **não** | aprovar é do cliente da origem. §24 do documento de Jobs: só finaliza com master aprovado — e quem aprova não é quem executa |
| `custos_videomaker` | **não** | é o cache negociado pela origem |
| `notas_fiscais` | **não** | dado fiscal de terceiro |
| `demanda_produto` | **não** | catálogo comercial da origem |
| `convites_videomaker` | **não** | o destino usa a rede dele |
| `alertas_ia`, `mensagens_whatsapp`, `logs_automacao` | **não** | operação interna da origem; `mensagens_whatsapp` carrega conversa com o cliente final |

Modelo da política filha que espelha (`historico_status` como exemplo):

```sql
CREATE POLICY "historico_status_espelhado" ON historico_status
  FOR SELECT TO app_user
  USING (EXISTS (SELECT 1 FROM demanda_compartilhamento c
                 WHERE c."demandaId" = historico_status."demandaId"
                   AND c."organizacaoDestinoId" = current_setting('app.org_id', true)
                   AND c."revogadoEm" IS NULL));

CREATE POLICY "historico_status_espelhado_escrita" ON historico_status
  FOR INSERT TO app_user
  WITH CHECK (EXISTS (SELECT 1 FROM demanda_compartilhamento c
                 WHERE c."demandaId" = historico_status."demandaId"
                   AND c."organizacaoDestinoId" = current_setting('app.org_id', true)
                   AND c."revogadoEm" IS NULL
                   AND c.escopo = 'executar'));
```

### 1.7 O nome da outra empresa: por que ele mora na aresta

`organizacoes_a_propria` diz `id = app.org_id`. O destino **não consegue ler o
nome da Contourline** — e a tag pede exatamente isso.

Duas saídas. A recusada: uma política `organizacoes_contraparte` liberando a
linha inteira da outra empresa quando existir aresta. Funciona, e abre `slug`,
`ativo` e toda coluna que `organizacoes` ganhar no futuro (plano, assinatura,
`stripeCustomerId` — que o `DIAGNOSTICO-SAAS.md` §Pilar 2 já prevê) para uma
empresa que só precisa de um rótulo.

A escolhida: **os nomes vivem na aresta**, congelados pelo gatilho da §1.2.
Custo honesto — a empresa muda de nome e o chip mostra o nome antigo até alguém
recompartilhar. É um rótulo, não uma chave; e a alternativa era abrir uma tabela
inteira para resolver um `<span>`.

### 1.8 O efeito colateral que vai aparecer na tela

`usuarios_por_membresia` limita `usuarios` a quem é membro da empresa ativa.
Logo, no card espelhado o destino vê **`solicitante: null`, `gestor: null`,
`responsaveis: []`** — as pessoas da Contourline não existem para ele.

Isso é o isolamento funcionando, não um bug, e é **desejável**: o executor
terceirizado não precisa do e-mail e do telefone do solicitante da Contourline.
Mas tem consequência concreta:

- o `include` do `GET /api/demandas/[id]` **não pode assumir** que essas relações
  vêm preenchidas — hoje várias telas fazem `demanda.solicitante.nome` direto;
- `videomakers`, `editores` e `designers` são de leitura global (`USING (true)`),
  então o nome do executor aparece normalmente nos dois lados;
- a tela do destino mostra **quem pediu = o nome da empresa de origem**, que é a
  informação verdadeira daquele lado da mesa.

---

## 2. Aplicação

### 2.1 Onde o `where` muda — e onde não muda

Com a RLS ligada, o banco já devolveria o card espelhado. Mas todo o código
escreve `where: { organizacaoId }` por cima (Fase 1, 26 rotas), então o espelho
não apareceria de qualquer jeito. E como a RLS **ainda não está ligada em
produção** (Virada B pendente), por enquanto o código é a única camada.

Helper novo, ao lado de `filtroMinhasDemandas`:

```ts
// src/lib/compartilhamento.ts
export function escopoComEspelho(organizacaoId: string): Prisma.DemandaWhereInput {
  return {
    OR: [
      { organizacaoId },
      { compartilhamentos: { some: { organizacaoDestinoId: organizacaoId, revogadoEm: null } } },
    ],
  }
}
```

E um irmão de `requireDemandaOrg`, **sem substituí-lo**:

```ts
export async function requireDemandaAcesso(
  session: Session | null,
  demandaId: string,
  minimo: "acompanhar" | "executar"
): Promise<{ organizacaoId: string; papel: "dona" | "espelho" } | NextResponse>
```

A regra de adoção é opt-in, rota a rota. Trocar `requireDemandaOrg` em massa é
exatamente o tipo de diff grande e silencioso que este repositório já pagou caro
para aprender a evitar.

| rota | passa a aceitar espelho? |
|---|---|
| `GET /api/demandas` (lista/Kanban) | sim — `escopoComEspelho` |
| `GET /api/demandas/[id]` | sim — `acompanhar` |
| `PATCH /api/demandas/[id]/status` | sim — `executar` |
| `POST /api/demandas/[id]/comentarios` | sim — `executar` |
| `GET/POST /api/demandas/[id]/arquivos`, `upload-url` | sim — `executar` |
| `PATCH /api/demandas/[id]` (edição de campos) | **não** |
| `DELETE /api/demandas/[id]` | **não** |
| pagamento, custos, NF, convites, aprovação, produtos | **não** |
| dashboard, métricas, relatórios | **não** — §2.4 |

Tudo que fica em "não" continua com `requireDemandaOrg` e responde **404**, não
403: a demanda não existe para aquela rota, e um 403 confirmaria a existência do
id — o mesmo raciocínio das quatro tentativas de IDOR do Passo 3 do plano de voo.

⚠️ O `scripts/auditar-tenancy.mjs` decide por arquivo e vai ver um `OR` onde
esperava `organizacaoId` direto. Antes do PR, rodar o auditor e, se ele reclamar,
**ensinar a regra nova** (reconhecer `escopoComEspelho`) em vez de adicionar
arquivo à allowlist — a allowlist está em zero e só pode encolher.

### 2.2 A guarda de transição ganha um eixo

`podeTransicionar` hoje pergunta papel, permissão efetiva e vínculo com o job.
Falta perguntar **de que lado da mesa a pessoa está** — porque um `admin` do
destino hoje passaria por `ehGestao()` e marcaria `entregue_cliente` num card da
Contourline.

`ActorTransicao` ganha `origem: "dona" | "espelho"`, e a guarda ganha uma seção
**antes** do bypass de gestão:

```ts
/** O que o executor terceirizado pode fazer no card de outra empresa. */
export const STATUS_PERMITIDOS_AO_ESPELHO: StatusInterno[] = [
  "videomaker_notificado", "videomaker_aceitou", "videomaker_recusou",
  "captacao_agendada", "captacao_realizada", "brutos_enviados",
  "editor_atribuido", "fila_edicao", "editando", "edicao_finalizada",
  "impedimento",
]
```

Fora dessa lista, recusa com código novo `fora_do_espelho`. O que fica de fora,
e por quê: `aprovado`, `postagem_pendente`, `postado`, `entregue_cliente`,
`encerrado`, `expirado` — aprovação, publicação e encerramento são da dona do
contrato com o cliente. É o §38 do documento de Jobs aplicado à fronteira entre
empresas em vez de entre papéis.

O bypass de gestão (`ehGestao`) passa a valer **só do lado dono**. Do lado
espelho, ninguém é gestão.

### 2.3 Notificação: quem precisa saber disso agora

Este é o ponto que faz o recurso valer a pena — *"quando a produtora externa
mover o card, a Contourline vê o movimento em tempo real"* — e é o que o código
atual **não** faz sozinho.

`kanban-avisos.ts` e `sendWhatsappMessage` recebem o `organizacaoId` da rota,
que numa movimentação do espelho é o **destino**. Resultado sem tratamento: a
produtora externa avisa a si mesma e a Contourline não fica sabendo de nada.

O conserto é pequeno e explícito, dentro do `emSegundoPlano()` que já existe:

```ts
if (papel === "espelho") {
  emSegundoPlano(
    () => comOrg(compartilhamento.organizacaoOrigemId, () =>
      avisarGestoresDaOrigem({ demandaId, de: statusAtual, para: alvo, porEmpresa: nomeDestino })),
    "aviso-espelho-origem"
  )
}
```

`comOrg` existe exatamente para isso: declarar a outra empresa por transação,
fora de uma sessão. Três cuidados:

1. **Nada de canal novo.** §39 do documento de Jobs é regra absoluta — o aviso
   entra pelo `AlertaIA`/sino e pelo WhatsApp que já existem.
2. **Nada de duplicar.** O mesmo evento não pode disparar o aviso normal do
   destino e o aviso da origem com o mesmo texto para as mesmas pessoas. Como as
   listas de destinatários vêm de empresas diferentes, não há interseção — mas o
   teste precisa provar isso, não presumir.
3. **A mensagem para a origem diz quem moveu**, pelo nome da empresa
   (`nomeDestino`), nunca pelo nome da pessoa: o quadro de pessoal do parceiro
   não é assunto da Contourline.

E o inverso, mais fácil de esquecer: quando a **origem** muda o card (adianta o
prazo, cancela), o destino precisa saber. Mesmo mecanismo, direção oposta.

### 2.4 O que fica de fora, de propósito

Card espelhado **não entra** em: `/api/dashboard/metrics`, `/api/dashboard/hoje`,
relatórios, `producao_manual`, custos e qualquer contagem do destino.

O motivo é aritmético antes de ser filosófico: se entrasse nos dois lados, a
soma da plataforma passaria a contar cada job duas vezes, e no dia em que houver
cobrança por volume (`DIAGNOSTICO-SAAS.md`, Pilar 2) a fatura seria a de dois
jobs. O card é produção da Contourline, executada por terceiro.

O destino ganha, no lugar, uma aba própria — **"Terceirizados"** — com contagem
separada. Se depois a operação pedir esses jobs dentro dos números do destino,
isso vira decisão de produto com um campo explícito, não um efeito colateral.

Mesma regra para `filtroMinhasDemandas`: o espelho aparece porque a pessoa é o
`videomakerId`/`editorId` do card, não porque a empresa dela está na aresta.

---

## 3. Interface

### 3.1 A tag

Um chip, uma linha, sem cor nova no vocabulário do card. `DemandaCard.tsx` hoje
já carrega prioridade, departamento, atraso e postagem — §52 do documento de
Jobs pede o contrário de mais badge. Então: **um** chip contornado, na linha de
meta de baixo, ao lado do departamento.

| lado | chip | title (hover) |
|---|---|---|
| origem (Contourline) | `🤝 Terceirizado · {nomeDestino}` | "Executado por {nomeDestino}. Você continua dona do card." |
| destino (produtora) | `🤝 {nomeOrigem}` | "Card de {nomeOrigem}. Você executa; aprovação e entrega são da origem." |
| escopo `acompanhar` | mesmo chip, opacidade menor + cadeado | "Somente acompanhamento." |

O payload precisa de um campo só, calculado no `GET /api/demandas`:

```ts
espelho: { papel: "origem" | "destino"; contraparte: string; escopo: "acompanhar" | "executar" } | null
```

Ele desce para `DemandaCard`, `DemandasLista` e `DemandasTabela` — as três
visões, senão a terceirização fica invisível em duas delas.

### 3.2 O detalhe

`DemandaDetalhe` ganha uma faixa no topo, não um modal: quem é a contraparte,
qual escopo, e a frase que evita o suporte — *"campos de briefing, prazo e
aprovação são editáveis apenas pela {nomeOrigem}"*. Do lado do destino, os
blocos de custo, NF, produtos e aprovação **não renderizam** (as rotas já
devolvem 404; a tela não deve oferecer botão que vai falhar).

### 3.3 O arrasto

`KanbanBoard` já tem `COLUNAS_BLOQUEADAS_VM`. Some-se
`COLUNAS_BLOQUEADAS_ESPELHO = ["para_postar", "finalizado"]`, com o mesmo
cadeado. **É dica visual, não segurança** — a autoridade é a §2.2, e o
`AUDITORIA-JOB-WORKFLOW.md` §2.1 registra por que confiar no `onDragEnd` foi o
risco número um deste módulo.

### 3.4 Onde se compartilha

Ação no `DemandaDetalhe` (menu, junto de "Compartilhar link"), visível só para
quem tem `moverKanban` e papel de gestão na origem: escolher a empresa, escolher
o escopo, confirmar. A lista de empresas elegíveis **não é** "todas as
organizações da plataforma" — é uma decisão de produto que está aberta na §6.

---

## 4. Ciclo de vida

| evento | o que acontece |
|---|---|
| compartilhar | aresta criada; histórico `job_compartilhado` na demanda; gestores do destino notificados |
| destino move o card | `historico_status` grava com `origem: 'kanban'` e observação nomeando a empresa; gestores da **origem** avisados (§2.3) |
| origem revoga | `revogadoEm = now()`; o card some do quadro do destino **na próxima consulta** — sem apagar comentário, arquivo nem histórico que o destino produziu. A prova do trabalho fica |
| origem exclui a demanda | `onDelete: Cascade` leva a aresta junto |
| destino é desativado | a aresta permanece; a política filtra por `revogadoEm`, não por `organizacoes.ativo` — **decisão pendente**, ver §6 |

Registrar no histórico é obrigatório e não é decoração: sem isso, um card que
mudou de mão três vezes não tem como responder quem fez o quê, que é a pergunta
central do §29.

---

## 5. As travas

### 5.1 `scripts/verificar-rls.mjs` ganha cinco provas

O verificador é o gate do CI e já prova 11 coisas. As novas, com dado semeado:

1. demanda da empresa A compartilhada com B: **B lê**; **C não lê**.
2. B **não consegue** inserir aresta apontando demanda de A para B (a política da
   §1.3 recusa) — nem com `organizacaoOrigemId` forjado (o gatilho recusa).
3. B move `statusInterno` e **grava**; B tenta mudar `dataLimite` e o valor
   **volta ao anterior** (§1.5).
4. B **não alcança** `custos_videomaker` nem `notas_fiscais` daquela demanda.
5. aresta com `revogadoEm` preenchido: B volta a **não ler** — zero linhas.

Sem essas cinco, a feature não passa do PR de banco. Uma política de RLS que
ninguém provou é uma política que ninguém sabe se funciona.

### 5.2 Trava de saída na migration

No mesmo padrão das anteriores: `DO $$ ... RAISE EXCEPTION` conferindo, dentro
da transação, que (a) `demanda_compartilhamento` tem RLS ligada e exatamente as
duas políticas previstas, (b) os dois gatilhos existem, (c) `demandas` continua
com `demandas_por_org` intacta. A migration que aborta é mais barata que a que
passa pela metade.

### 5.3 ~~Teste de contração da lista branca~~ — dispensado

Este item existia porque a versão rascunhada do gatilho enumerava as colunas
congeladas. A versão implementada enumera as **permitidas** e devolve todo o
resto ao valor da dona, então o schema pode andar à vontade: coluna nova é
imutável para o espelho por construção. Um teste a menos, e um a menos que
poderia ser ignorado.

---

## 6. As decisões que são suas, não minhas

1. ~~**Quem pode ser destino?**~~ **RESOLVIDO em 08/09/2026: só sob parceria
   previamente aceita.** `parceria_organizacao` existe, com aceite dos dois
   lados, e o pré-requisito é conferido **no banco** — o gatilho
   `compartilhamento_derivar_origem` recusa a aresta sem parceria aceita, então
   nem uma rota nova nem um script conseguem pular o aperto de mão. A rota é uma
   porta; o gatilho é a parede.
2. ~~**O aceite do destino, job a job.**~~ **Descartado, como recomendado:** a
   parceria já é o aceite, no nível certo. Pedir aceite por card somaria um
   estado para responder a mesma pergunta duas vezes.
3. **Destino desativado ou parceria encerrada.** ⚠️ **Implementado como "a
   aresta continua valendo", que é o CONTRÁRIO do que eu havia recomendado** —
   e a razão apareceu ao escrever a tela: encerrar a relação comercial no meio de
   uma captação pararia um job real. Encerrar a parceria impede compartilhamentos
   NOVOS (o gatilho exige `status = 'aceita'`) e não toca nos que já existem;
   revogar card a card é ato separado, e a tela avisa isso ao confirmar.
   Se você preferir que caduque junto, é uma política a mais e um join por leitura.
4. **O custo do videomaker num card terceirizado.** Fora do escopo, de propósito.
   `CustoVideomaker` só nasce em `finalizado`, que o espelho não alcança — então
   hoje o custo continua sendo lançado pela dona, como sempre foi. Se a produtora
   parceira passar a pagar o próprio videomaker por dentro do NuFlow, isso é
   modelagem financeira nova, não um efeito colateral a ser descoberto depois.
5. **O cliente final aparece?** O plano corta `clienteFinalNome/Telefone/Email`
   da lista branca (o destino não os edita), mas **não** os esconde da leitura —
   quem vai gravar precisa do endereço e do contato no local. Se a Contourline
   preferir intermediar o contato, esses campos saem do payload do espelho e
   entram numa observação escrita à mão.

---

## 7. Sequência

Quatro PRs, na ordem, cada um com critério de parada. Nenhum deles liga nada
sozinho — o recurso só existe para o usuário no PR 4.

| # | entrega | critério de parada | reversível? |
|---|---|---|---|
| **1** ✅ | Schema + migration: tabelas, gatilhos, políticas, travas de saída. **Inerte** | 22 verificações verdes no CI; `migrate diff` sem diferença | sim, `DROP` da tabela |
| **2** ✅ | `lib/compartilhamento.ts`, `requireDemandaAcesso`, `escopoComEspelho`, guarda com o eixo `origem` | 589 testes; auditor em zero; trava de exaustividade provada por simulação nos dois sentidos | sim, código puro |
| **3** ✅ | `/api/parcerias`, `/api/demandas/[id]/espelhar`, adoção em 5 rotas, aviso cruzado | build verde; a passada humana continua pendente | sim |
| **4** ✅ | Chip nas três visões, faixa no detalhe, seção de terceirizar, `/parcerias`, coluna bloqueada | idem | sim |

Duas correções de rumo que a execução impôs, registradas porque contradizem o
que está escrito acima:

- **`/compartilhar` já existia.** É o link público de acompanhamento
  (`/d/[token]`), em uso. A rota do espelhamento virou
  `/api/demandas/[id]/espelhar`. Os nomes são parecidos e os recursos não são.
- **A aba "Terceirizados" não foi feita.** O chip já responde "de quem é este
  card" nas três visões, e uma aba a mais para o mesmo dado é recurso que
  ninguém pediu — se a operação sentir falta de filtrar por isso, vira um filtro
  na barra que já existe, não uma aba.

**Ordem obrigatória de release**, que este repositório aprendeu em 20/08: deploy
do código **antes** da migration, e toda migration compatível com o código que
ainda está rodando. O PR 1 é aditivo puro, então ele pode ir primeiro; os
gatilhos não fazem nada enquanto não existir aresta.

**Nota sobre a Virada B.** Nada aqui depende de a RLS estar ligada, e é assim de
propósito. Com `RLS_ATIVO` desligado, quem isola é o código da §2 — o mesmo
nível de garantia que o resto do sistema tem hoje. Quando a Virada B acontecer,
as políticas da §1 passam a confirmar o que o código já fazia, e as cinco provas
da §5.1 param de ser teoria. **O que não pode acontecer é o inverso:** ligar a
RLS depois, sem as políticas do PR 1, faria todo card espelhado sumir da tela do
destino sem erro nenhum. Por isso o PR 1 vem primeiro, mesmo sendo inerte.

---

## 8. O que pode dar errado

| sintoma | causa provável | o que fazer |
|---|---|---|
| `infinite recursion detected in policy for relation "demandas"` | alguma política nova de `demanda_compartilhamento` passou a consultar `demandas` | a aresta nunca lê o vértice — é o motivo da §1.1 |
| destino vê o card e a tela vem com "Solicitante: —" | `usuarios_por_membresia` — comportamento correto (§1.8) | ajustar o `include` e a tela, não a política |
| card espelhado sumiu depois da Virada B | políticas da §1.4 não aplicadas | `desligar-rls`, aplicar, religar |
| destino move e a Contourline não fica sabendo | notificação saiu com o `organizacaoId` do destino | §2.3 — `comOrg` na origem |
| jobs contados duas vezes no total da plataforma | espelho entrou em `dashboard/metrics` | §2.4 |
| `permission denied for table demanda_compartilhamento` | tabela criada depois do `GRANT` | o `ALTER DEFAULT PRIVILEGES` da `20260826000000` cobre tabela nova; conferir que a migration não criou a tabela com outro dono |
