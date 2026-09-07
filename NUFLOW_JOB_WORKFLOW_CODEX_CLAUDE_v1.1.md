# NUFLOW — JOB WORKFLOW MODULE

> **Documento de implementação para Codex / Claude Code**  
> **Versão:** 1.1  
> **Status:** Source of Truth  
> **Escopo:** Product + UX + Backend + Business Rules  
> **Módulo:** Jobs / Operação Audiovisual

------------------------------------------------------------------------

# 0. COMO USAR ESTE DOCUMENTO

Este arquivo é a **fonte de verdade funcional e técnica** para
implementação e evolução do módulo de **Jobs** do NUFLOW.

A arquitetura real já existente no projeto tem prioridade sobre
simplificações conceituais deste documento quando ela:

- já estiver em produção;
- possuir histórico válido;
- tiver maior granularidade operacional;
- representar fluxos reais utilizados pela equipe;
- puder ser reutilizada sem perda funcional.

## Regra de interpretação

Esta especificação **não autoriza migração destrutiva** apenas para
adequar nomes, enums, quantidade de estados ou colunas do Kanban.

Antes de alterar qualquer código relacionado a Jobs:

1.  Leia este documento por completo.
2.  Analise a arquitetura atual do projeto.
3.  Reutilize componentes, serviços, tabelas e infraestrutura existentes
    sempre que possível.
4.  Não crie arquitetura paralela sem necessidade.
5.  Não altere estados históricos sem necessidade comprovada.
6.  Não implemente funcionalidades fora do escopo sem necessidade
    explícita.
7.  Quando houver conflito entre o documento e uma arquitetura existente
    mais granular, preservar a operação real e adaptar a especificação
    de forma consciente.

------------------------------------------------------------------------

# 1. OBJETIVO DO MÓDULO

O **Job** deve ser a unidade central de operação audiovisual do NUFLOW.

O sistema deve acompanhar todo o ciclo operacional:

``` text
SOLICITAÇÃO
    ↓
TRIAGEM
    ↓
ATRIBUIÇÃO
    ↓
ACEITE
    ↓
CAPTAÇÃO
    ↓
MATERIAL
    ↓
EDIÇÃO
    ↓
VERSÃO
    ↓
APROVAÇÃO
    ↓
MASTER
    ↓
FINALIZAÇÃO DA PRODUÇÃO
    ↓
PUBLICAÇÃO / ENTREGA
```

O Job precisa responder constantemente:

``` text
O que aconteceu?
Quem é responsável agora?
Qual é a próxima ação?
Qual é o prazo?
Existe algum bloqueio?
A produção terminou?
Foi publicado?
```

------------------------------------------------------------------------

# 2. PRINCÍPIO CENTRAL

O conceito operacional mais importante do módulo é:

> **DE QUEM É A BOLA AGORA?**

Sempre que existir uma ação pendente, o sistema deve conseguir
identificar claramente quem precisa agir.

Preferencialmente cada Job deve permitir derivar ou registrar:

``` text
StatusInterno
JobPhase
current_owner_id
next_action
due_date
publicationStatus
```

Sempre que possível, `next_action`, `JobPhase` e indicadores auxiliares
devem ser **derivados** da fonte de verdade operacional, e não mantidos
como estados duplicados que precisam de sincronização permanente.

------------------------------------------------------------------------

# 3. FONTE DE VERDADE OPERACIONAL

## 3.1 StatusInterno existente

O NUFLOW já possui `StatusInterno` com granularidade maior e histórico
real de produção.

Portanto:

> **`StatusInterno` continua sendo a fonte de verdade operacional do
> Job.**

Não substituir automaticamente os estados existentes pelos 6
macroestados deste documento.

Não criar um segundo campo persistido de status apenas para reproduzir a
especificação.

Não migrar histórico apenas para adequar nomenclatura.

------------------------------------------------------------------------

# 4. JOBPHASE — MACROFASE DERIVADA

Os 6 estados abaixo passam a representar uma **macroclassificação do
workflow**, chamada conceitualmente de `JobPhase`.

``` text
pending_assignment
dispatched
in_progress
material_uploaded
in_editing
finished
```

## Regra

`JobPhase` deve ser derivada a partir de `StatusInterno` por uma função
centralizada de domínio.

Arquitetura desejada:

``` text
StatusInterno
      ↓
função central de mapeamento
      ↓
JobPhase
      ↓
Dashboard / filtros / métricas / API / visão macro
```

Evitar:

``` text
StatusInterno
+
JobPhase persistida
↓
sincronização permanente entre dois estados
```

Se a arquitetura atual justificar persistência por performance ou
integração, documentar claramente como evitar divergência.

------------------------------------------------------------------------

# 5. MACROFASES

## 5.1 `pending_assignment`

Representa Jobs ainda sem responsável operacional definido ou aguardando
triagem.

Responsável esperado:

``` text
Admin / Moderador
```

## 5.2 `dispatched`

Representa Job já atribuído a um videomaker e aguardando aceite ou
confirmação operacional.

Responsável esperado:

``` text
Videomaker
```

## 5.3 `in_progress`

Representa Job aceito e sob responsabilidade de captação/operação.

## 5.4 `material_uploaded`

Representa Job cuja captação foi concluída e cujo material está
disponível para produção/edição.

## 5.5 `in_editing`

Representa a etapa de produção audiovisual após recebimento do material.

Pode incluir estados internos mais granulares como:

- em edição;
- revisão pendente;
- ajuste solicitado;
- aguardando aprovação;
- impedimento relacionado à edição.

A macrofase não substitui essa granularidade.

## 5.6 `finished`

Representa **produção audiovisual concluída com sucesso**.

Não significa automaticamente:

``` text
published
encerrado
expirado
cancelado
```

`finished` deve ser reservado para conclusão bem-sucedida do produto
audiovisual.

------------------------------------------------------------------------

# 6. ESTADOS TERMINAIS NÃO CONCLUÍDOS

Estados internos como, por exemplo:

``` text
encerrado
expirado
cancelado
```

não devem ser automaticamente mapeados para:

``` text
JobPhase = finished
```

apenas porque o ciclo deixou de estar ativo.

Eles representam **término do ciclo sem necessariamente representar
conclusão da produção**.

O agente deve analisar esses estados separadamente e preservar sua
semântica.

Quando necessário, utilizar uma dimensão auxiliar, por exemplo:

``` text
lifecycleStatus:
- active
- completed
- cancelled
- expired
- closed
```

Somente criar um novo campo se a arquitetura atual realmente precisar.
Preferir derivação quando possível.

------------------------------------------------------------------------

# 7. BLOQUEIO / IMPEDIMENTO NÃO É FASE

`impedimento` representa uma condição operacional, não uma macrofase do
Job.

Um Job pode estar:

``` text
JobPhase = in_editing
StatusInterno = impedimento
```

Conceitualmente:

``` text
isBlocked = true
```

ou equivalente.

Não criar:

``` text
JobPhase = blocked
```

sem necessidade estrutural.

Bloqueio deve ser tratado como condição transversal ao workflow.

------------------------------------------------------------------------

# 8. MAPEAMENTO OBRIGATÓRIO ANTES DE ALTERAR O WORKFLOW

Antes de modificar banco, Kanban ou regras de transição, o agente deve
apresentar o mapeamento completo:

``` text
StatusInterno
→ Coluna atual do Kanban
→ JobPhase
→ publicationStatus
→ condição especial/bloqueio, quando aplicável
```

Esse mapeamento deve considerar **todos os valores existentes de
`StatusInterno`**.

Não assumir equivalências sem analisar a base.

Não iniciar migração destrutiva antes dessa análise.

------------------------------------------------------------------------

# 9. KANBAN OPERACIONAL

## Regra principal

As 6 `JobPhase` **não obrigam o Kanban a possuir exatamente 6 colunas**.

O Kanban pode e deve continuar mais granular quando isso representar
melhor a operação real.

Se hoje existem colunas reais de trabalho, elas devem ser preservadas
quando ainda fizerem sentido.

Exemplo conceitual:

``` text
Entrada
Aceite
Captação
Material
Edição
Aprovação
Para Postar
Finalizado
```

O Kanban é uma **visão operacional**, enquanto `JobPhase` é uma visão
macro de domínio.

------------------------------------------------------------------------

# 10. PARA POSTAR

A coluna **“Para Postar”** deve ser preservada enquanto representar uma
fila real de trabalho do Social Media.

Ela não deve ser removida apenas para forçar o Kanban a coincidir com as
6 macrofases.

Exemplo:

``` text
Para Postar:
JobPhase = finished
publicationStatus = not_published
```

Depois da publicação:

``` text
JobPhase = finished
publicationStatus = published
```

Portanto:

``` text
finished != published
```

------------------------------------------------------------------------

# 11. PUBLICAÇÃO COMO DIMENSÃO SEPARADA

A publicação é independente da conclusão da produção.

Campo conceitual:

``` text
publicationStatus
```

Valores recomendados:

``` text
not_published
scheduled
published
```

O projeto pode reutilizar enum/campo equivalente já existente.

Estados possíveis:

``` text
finished + not_published
finished + scheduled
finished + published
```

Não misturar finalização da produção com distribuição.

------------------------------------------------------------------------

# 12. KANBAN E DRAG-AND-DROP

O Kanban não deve se tornar uma forma irrestrita de alteração de estado.

A fonte de verdade continua sendo o workflow operacional.

Preferência:

``` text
usuário executa ação válida
↓
StatusInterno é alterado
↓
JobPhase é recalculada
↓
Kanban reflete o novo estado
```

Se o sistema atual já usa drag-and-drop com validação de transições,
preservar o comportamento validado em vez de remover cegamente.

O importante é impedir transições inválidas.

------------------------------------------------------------------------

# 13. CRIAÇÃO DO JOB

O Job pode nascer de um formulário público.

Campos mínimos:

``` text
clinic_name
contact_name
contact_phone
address
scheduled_date
scheduled_time
job_type
description
notes
created_by
```

Após o envio:

- criar o registro segundo os padrões atuais do sistema;
- definir o `StatusInterno` correspondente à entrada;
- derivar `JobPhase = pending_assignment`;
- criar histórico;
- notificar Admin/Moderador usando o sistema existente.

------------------------------------------------------------------------

# 14. TRIAGEM

Ao abrir um Job novo, o Admin/Moderador precisa visualizar rapidamente:

- Clínica
- Data
- Horário
- Cidade/região
- Tipo de Job
- Solicitante
- Contato
- Observações
- Prazo
- Necessidades especiais
- Videomakers disponíveis

A principal ação desta etapa é:

``` text
[ATRIBUIR VIDEOMAKER]
```

------------------------------------------------------------------------

# 15. ATRIBUIÇÃO DO VIDEOMAKER

Ao selecionar um videomaker:

- preservar o modelo de dados existente;
- registrar o profissional responsável;
- atualizar `StatusInterno` para o estado equivalente;
- derivar `JobPhase = dispatched`;
- registrar timestamp quando aplicável;
- criar evento/histórico;
- utilizar a infraestrutura atual de notificações.

------------------------------------------------------------------------

# 16. ACEITE DO VIDEOMAKER

O videomaker deve poder:

``` text
[ACEITAR JOB]
[RECUSAR]
```

## Aceite

Ao aceitar:

- atualizar `StatusInterno` para o estado operacional correspondente;
- derivar `JobPhase = in_progress`;
- registrar `accepted_at` ou equivalente;
- registrar histórico;
- manter o videomaker como responsável atual.

## Recusa

Ao recusar:

- retornar o Job para estado de atribuição adequado;
- exigir motivo;
- registrar quem recusou;
- registrar data/hora;
- registrar histórico;
- notificar Admin/Moderador.

Não perder histórico da tentativa anterior.

------------------------------------------------------------------------

# 17. INFORMAÇÕES LIBERADAS AO VIDEOMAKER

Após aceitar, o videomaker deve encontrar em uma única experiência:

## Clínica

- Nome
- Endereço
- Contato
- Telefone

## Operação

- Data
- Horário
- Tipo de Job
- Briefing
- Observações
- Cache
- Prazo de entrega

## Materiais

- Guia de captação em PDF
- Guidelines de Hype
- Guidelines de Depoimento
- Guidelines de Stories
- Referências
- Orientações de entrega
- Orientações de Nota Fiscal

Evitar espalhar informação por várias telas.

------------------------------------------------------------------------

# 18. EXPERIÊNCIA MOBILE DO VIDEOMAKER

A interface deve ser extremamente objetiva.

Ações principais:

``` text
[ACEITAR JOB]

[RECUSAR]

[INICIAR CAPTAÇÃO]

[FINALIZAR CAPTAÇÃO]

[ENVIAR MATERIAL]

[ENVIAR NF]
```

Evitar menus complexos, excesso de informação e ações ambíguas.

------------------------------------------------------------------------

# 19. CAPTAÇÃO

Ao iniciar:

- registrar `capture_started_at` ou equivalente;
- atualizar `StatusInterno` se necessário;
- registrar histórico.

Ao finalizar:

- registrar `capture_finished_at`;
- atualizar estado operacional correspondente;
- registrar histórico.

------------------------------------------------------------------------

# 20. ENTREGA DO MATERIAL

Após a captação, o videomaker deve:

1.  Organizar/decupar os arquivos.
2.  Fazer upload no storage/cloud utilizado pela empresa.
3.  Inserir o link no Job.
4.  Enviar NF quando aplicável.

Após a confirmação:

- registrar `material_url` ou asset equivalente;
- registrar `material_uploaded_at`;
- atualizar `StatusInterno`;
- derivar `JobPhase = material_uploaded`;
- registrar histórico;
- notificar os próximos responsáveis.

------------------------------------------------------------------------

# 21. NOTA FISCAL

A NF deve ser associada ao Job como asset ou estrutura equivalente
existente.

Tipo conceitual:

``` text
invoice
```

Ao enviar:

- registrar histórico;
- permitir integração futura com financeiro;
- não construir sistema financeiro completo no MVP.

------------------------------------------------------------------------

# 22. EDIÇÃO

O Job precisa suportar três modos:

``` text
internal
external
videomaker
```

Campo conceitual:

``` text
editing_mode
```

Se a base atual já possui estrutura equivalente, reutilizar.

Não simplificar para apenas `editor_externo = true/false` se isso perder
o cenário em que o próprio videomaker edita.

------------------------------------------------------------------------

# 23. ENCAMINHAMENTO PARA EDIÇÃO

Após material disponível:

- identificar o modo de edição;
- atribuir responsável;
- atualizar `StatusInterno`;
- derivar `JobPhase = in_editing`;
- registrar histórico;
- notificar editor.

------------------------------------------------------------------------

# 24. EXPERIÊNCIA DO EDITOR

O editor deve receber:

- Material
- Briefing
- Identidade visual
- Referências
- Música/orientações
- Observações
- Prazo

Ações:

``` text
[INICIAR EDIÇÃO]
[ENVIAR VERSÃO]
```

------------------------------------------------------------------------

# 25. VERSÕES

O sistema deve suportar:

``` text
V1
V2
V3
...
MASTER
```

Cada versão precisa ter vínculo claro com o Job e registrar:

``` text
file_url
file_name
version
uploaded_by
created_at
```

Reutilizar a estrutura de assets existente sempre que possível.

------------------------------------------------------------------------

# 26. APROVAÇÃO E REVISÃO

Para versões em aprovação:

``` text
[APROVAR]
[SOLICITAR REVISÃO]
```

Revisão:

- comentário obrigatório;
- atualizar `StatusInterno` conforme fluxo existente;
- permanecer na `JobPhase = in_editing`;
- registrar histórico;
- notificar editor.

Estados como `revisao_pendente` e `ajuste_solicitado` são granularidade
interna e não precisam virar novas `JobPhase`.

------------------------------------------------------------------------

# 27. MASTER E FINALIZAÇÃO

Uma produção só deve ser considerada concluída com sucesso quando as
regras atuais de negócio forem satisfeitas.

Conceitualmente:

``` text
master disponível
+
approval_status = approved
```

ou equivalente existente.

Depois:

- atualizar `StatusInterno` para o estado de conclusão bem-sucedida;
- derivar `JobPhase = finished`;
- registrar `finished_at`;
- registrar histórico.

------------------------------------------------------------------------

# 28. CHECKLIST

Checklist representa ações internas.

Não utilizar checklist como substituto de `StatusInterno`.

Modelo conceitual:

``` text
job_checklist
- id
- job_id
- title
- completed
- completed_by
- completed_at
- position
```

------------------------------------------------------------------------

# 29. TIMELINE / HISTÓRICO

Todo Job deve possuir histórico.

## Regra

Histórico existente nunca deve ser apagado para simplificar a nova
arquitetura.

Correções de estado devem gerar novos registros de histórico quando
necessário.

------------------------------------------------------------------------

# 30. EVENT TYPES

Tipos conceituais recomendados:

``` text
job_created
job_dispatched
job_accepted
job_rejected
capture_started
capture_finished
material_uploaded
invoice_uploaded
editing_assigned
editing_started
version_uploaded
revision_requested
job_approved
job_finished
publication_scheduled
publication_completed
```

Se o projeto já possui outro sistema de eventos/histórico, adaptar estes
conceitos à estrutura existente.

------------------------------------------------------------------------

# 31. MODELO DE DADOS

A especificação original sugeria um novo modelo `jobs`, mas a V1.1
estabelece:

> **Não criar uma tabela nova apenas porque este documento chama a
> entidade de Job.**

Primeiro localizar a entidade real existente, por exemplo `Demanda`,
Job, Production, Request ou equivalente.

Depois decidir o que realmente precisa ser acrescentado.

Campos conceituais importantes:

``` text
job_number
title
description
clinic_name
contact_name
contact_phone
address
scheduled_date
scheduled_time
due_date
job_type
videomaker_id
editor_id
current_owner_id
editing_mode
cache_amount
material_url
master_url
publication_status
approval_status
created_by
created_at
updated_at
dispatched_at
accepted_at
capture_started_at
capture_finished_at
material_uploaded_at
editing_started_at
finished_at
```

Adicionar somente o que não estiver representado adequadamente hoje.

------------------------------------------------------------------------

# 32. RESPONSÁVEL ATUAL

O Job precisa permitir identificar `current_owner_id` ou equivalente
derivado.

Objetivo:

> saber imediatamente quem deve executar a próxima ação.

Exemplos:

``` text
entrada → Admin
aguardando aceite → Videomaker
captação → Videomaker
material entregue → Editor/triagem
edição/revisão → Editor ou aprovador
para postar → Social Media
```

------------------------------------------------------------------------

# 33. AÇÃO NECESSÁRIA

A interface deve mostrar uma indicação objetiva.

Exemplos:

``` text
Aguardando atribuição
Aguardando aceite do videomaker
Captação agendada
Aguardando material
Aguardando editor
Em edição
Revisão solicitada
Aguardando aprovação
Aguardando publicação
Bloqueado
```

Essa indicação pode ser derivada de `StatusInterno`, `JobPhase`,
responsável atual, `publicationStatus` e condição de bloqueio.

------------------------------------------------------------------------

# 34. PRAZO E RISCO

Cada Job pode possuir indicador derivado:

``` text
on_time
attention
overdue
```

Considerar:

- data/hora da captação;
- prazo;
- `StatusInterno`;
- `JobPhase`;
- tempo parado;
- responsável atual;
- bloqueios.

------------------------------------------------------------------------

# 35. CARD DO KANBAN

Mostrar somente dados essenciais.

Exemplo:

``` text
JOB #00124

Clínica X

12/09 · 14:00
São Paulo

João

Captação

⚠ Aguardando ação
```

Detalhes pertencem à página do Job.

------------------------------------------------------------------------

# 36. FILTROS DO KANBAN

Preferencialmente:

``` text
Todos
Meus Jobs
Hoje
Atrasados
Videomaker
Editor
Tipo
Região
```

------------------------------------------------------------------------

# 37. DASHBOARD

Indicadores iniciais:

``` text
Jobs ativos
Jobs atrasados
Aguardando ação
Dentro do prazo
```

Filtros possíveis:

- Período
- Videomaker
- Editor
- Região
- Tipo
- JobPhase
- publicationStatus

------------------------------------------------------------------------

# 38. PERMISSÕES

Permissões críticas devem existir no backend/RLS.

Não confiar apenas no frontend.

## Admin / Moderador

Pode criar, editar, atribuir, realocar, visualizar todos, acompanhar
timeline, métricas e ajustar dados operacionais.

## Videomaker

Pode visualizar Jobs atribuídos, aceitar, recusar, acessar briefing,
iniciar/finalizar captação, enviar material e NF.

Não pode arbitrariamente:

- mudar estados fora das transições válidas;
- trocar responsável;
- alterar cache;
- finalizar produção;
- alterar dados administrativos.

## Editor

Pode visualizar Jobs atribuídos, abrir material, iniciar edição, enviar
versões, visualizar revisões e enviar master.

## Social Media

Pode visualizar Jobs prontos para distribuição, acessar master, alterar
`publicationStatus` e marcar como publicado.

------------------------------------------------------------------------

# 39. NOTIFICAÇÕES — REGRA ABSOLUTA

O NUFLOW **JÁ POSSUI sistema de notificações**.

> **NÃO CRIAR UM NOVO SISTEMA DE NOTIFICAÇÕES.**

Antes de implementar:

1.  localizar o sistema atual;
2.  entender tabelas/models/services/hooks;
3.  reutilizar infraestrutura;
4.  integrar eventos de Job;
5.  evitar notificações duplicadas.

------------------------------------------------------------------------

# 40. PRINCÍPIO DE NOTIFICAÇÕES

Pergunta principal:

> **Quem precisa saber disso agora?**

Conceito:

> **Aconteceu isso. Agora é sua vez.**

------------------------------------------------------------------------

# 41. MATRIZ DE NOTIFICAÇÕES

| Evento               |    Admin | Solicitante | Videomaker |                     Editor |   Social |
|----------------------|---------:|------------:|-----------:|---------------------------:|---------:|
| Job criado           |       ✅ |           — |          — |                          — |        — |
| Videomaker atribuído |        — |          ✅ |         ✅ |                          — |        — |
| Job aceito           |       ✅ |           — |          — |                          — |        — |
| Job recusado         |       ✅ |           — |          — |                          — |        — |
| Material enviado     |       ✅ |           — |          — |                         ✅ |        — |
| V1 enviada           |        — |           — |          — | Responsável pela aprovação | Opcional |
| Revisão solicitada   |        — |           — |          — |                         ✅ |        — |
| Master aprovado      |       ✅ |          ✅ |          — |                          — |       ✅ |
| Produção finalizada  |       ✅ |          ✅ |          — |                          — |       ✅ |
| Publicação concluída | Opcional |    Opcional |          — |                          — |       ✅ |

------------------------------------------------------------------------

# 42. REGRAS DE NOTIFICAÇÃO

Toda notificação relacionada ao Job deve possuir, conforme
infraestrutura atual:

``` text
job_id
event_type
recipient_id
created_at
```

Regras:

1.  Não duplicar notificações.
2.  Deep-link deve abrir diretamente o Job.
3.  Mostrar CTA quando houver ação objetiva.
4.  Respeitar permissões.
5.  Não notificar usuários sem relação com o Job.
6.  Não criar um segundo sistema de notificação.

------------------------------------------------------------------------

# 43. SEGURANÇA

Toda operação crítica deve validar:

``` text
actor
role
relationship with job
StatusInterno
requested transition
```

As validações reais devem usar `StatusInterno` e regras já existentes,
não depender exclusivamente de `JobPhase`.

------------------------------------------------------------------------

# 44. IDEMPOTÊNCIA

Ações críticas precisam evitar duplicação:

- aceitar Job duas vezes;
- gerar duas notificações;
- inserir eventos duplicados;
- enviar mesma transição repetidamente;
- finalizar produção mais de uma vez.

------------------------------------------------------------------------

# 45. NÃO IMPLEMENTAR AGORA

Fora do MVP:

- IA autônoma alterando Jobs;
- chat complexo;
- editor de vídeo interno;
- storage próprio de arquivos grandes;
- financeiro completo;
- publicação automática;
- gamificação avançada;
- migração massiva de estados sem necessidade.

------------------------------------------------------------------------

# 46. IA FUTURA

A IA poderá monitorar:

``` text
Jobs atrasados
Jobs sem responsável
Jobs sem aceite
Jobs parados
Material pendente
Edição atrasada
V1 sem aprovação
Jobs próximos do prazo
Jobs bloqueados
Fila de publicação
```

Primeiro estágio:

``` text
IA = monitorar + alertar
```

Não:

``` text
IA = executar mudanças críticas autonomamente
```

------------------------------------------------------------------------

# 47. MÉTRICAS FUTURAS

Preservar timestamps suficientes para medir:

- Jobs por videomaker;
- taxa de aceite;
- taxa de recusa;
- tempo até aceite;
- tempo de captação;
- tempo até material;
- tempo de edição;
- tempo até V1;
- quantidade de revisões;
- aprovação em primeira versão;
- Jobs por mês;
- custo médio;
- Jobs atrasados;
- lead time;
- tempo bloqueado;
- tempo entre master aprovado e publicação.

------------------------------------------------------------------------

# 48. ORDEM DE IMPLEMENTAÇÃO

Executar preferencialmente:

``` text
1. Auditoria da arquitetura existente
2. Mapeamento StatusInterno → Kanban → JobPhase → publicationStatus
3. Validação das transições existentes
4. Backend / banco somente onde necessário
5. Permissões / RLS
6. Histórico / timeline
7. Integração com notificações existentes
8. Kanban
9. Job Detail
10. Experiência mobile do videomaker
11. Experiência do editor
12. Aprovação
13. Finalização
14. Publicação
15. Dashboard
16. Métricas
17. Inteligência
```

------------------------------------------------------------------------

# 49. FASE 0 — AUDITORIA OBRIGATÓRIA

Antes de escrever código, mapear:

``` text
- entidade atual de Demanda/Job
- todos os valores de StatusInterno
- transições válidas
- histórico existente
- colunas atuais do Kanban
- usuários
- roles
- notificações
- arquivos/assets
- comentários
- storage
- RLS/permissões
- rotas
- componentes reutilizáveis
- publicationStatus ou equivalente
- estados de bloqueio/impedimento
- estados de encerramento/cancelamento/expiração
```

Depois classificar:

``` text
REUTILIZAR
ADAPTAR
CRIAR
DEPRECAR
```

------------------------------------------------------------------------

# 50. MAPEAMENTO QUE O AGENTE DEVE APRESENTAR

Antes de uma alteração estrutural, apresentar tabela semelhante a:

| StatusInterno     | Coluna atual        | JobPhase           | publicationStatus | Condição  |
|-------------------|---------------------|--------------------|-------------------|-----------|
| exemplo_1         | Entrada             | pending_assignment | —                 | —         |
| exemplo_2         | Aceite              | dispatched         | —                 | —         |
| exemplo_3         | Edição              | in_editing         | —                 | —         |
| postagem_pendente | Para Postar         | finished           | not_published     | —         |
| postado           | Finalizado          | finished           | published         | —         |
| impedimento       | Edição              | in_editing         | —                 | blocked   |
| cancelado         | Fora do fluxo ativo | não assumir        | —                 | cancelled |

A tabela real deve usar todos os estados existentes no NUFLOW.

------------------------------------------------------------------------

# 51. ESTRATÉGIA DE ALTERAÇÃO

Evitar refactors gigantes.

Preferir:

``` text
analisar
↓
alterar pouco
↓
validar
↓
continuar
```

------------------------------------------------------------------------

# 52. UX

Direção:

``` text
clean
minimal
sofisticada
alta legibilidade
baixa carga cognitiva
mobile-first para executor
desktop-first para gestão
```

Evitar excesso de badges, cores, campos, informações duplicadas e
simplificação que remova filas reais de trabalho.

------------------------------------------------------------------------

# 53. CRITÉRIOS DE ACEITE DO MVP

O MVP estará funcional quando:

- [ ] A arquitetura existente for preservada sem migração destrutiva.
- [ ] Todos os `StatusInterno` estiverem mapeados.
- [ ] `JobPhase` for derivada de forma centralizada.
- [ ] O Kanban preservar filas operacionais úteis.
- [ ] “Para Postar” continuar disponível enquanto for fila real do
  Social.
- [ ] `finished` continuar diferente de `published`.
- [ ] Estados de bloqueio não virarem macrofases indevidamente.
- [ ] Cancelamentos/expirações não forem tratados automaticamente como
  conclusão bem-sucedida.
- [ ] Formulário criar Job.
- [ ] Admin receber notificação.
- [ ] Admin conseguir atribuir videomaker.
- [ ] Solicitante receber o videomaker atribuído.
- [ ] Videomaker receber os dados do Job.
- [ ] Videomaker aceitar ou recusar.
- [ ] Recusa exigir motivo.
- [ ] Admin receber aceite/recusa.
- [ ] Videomaker acessar briefing.
- [ ] Videomaker iniciar/finalizar captação.
- [ ] Videomaker enviar material e NF.
- [ ] Editor receber material.
- [ ] Editor iniciar edição.
- [ ] Editor enviar V1.
- [ ] Aprovador aprovar ou solicitar revisão.
- [ ] Revisão registrar comentário.
- [ ] Master ser aprovado.
- [ ] Produção ser finalizada sem confundir publicação.
- [ ] Timeline preservar histórico.
- [ ] Permissões funcionarem no backend.
- [ ] Notificações não serem duplicadas.

------------------------------------------------------------------------

# 54. REGRAS CRÍTICAS PARA CODEX / CLAUDE CODE

## NÃO FAZER

Não:

- substituir `StatusInterno` pelos 6 macroestados;
- criar outro enum persistido sem necessidade;
- criar sistema paralelo de notificações;
- remover “Para Postar” apenas para reduzir o Kanban;
- transformar bloqueio em macrofase;
- tratar cancelado/expirado/encerrado automaticamente como `finished`;
- transformar checklist em workflow;
- misturar `finished` com `published`;
- criar tabela duplicada sem investigar a base;
- apagar histórico;
- fazer migração destrutiva sem necessidade;
- alterar toda a arquitetura só para fazer o código coincidir
  literalmente com este documento.

## FAZER

Sempre:

- preservar `StatusInterno` como fonte de verdade operacional;
- derivar `JobPhase`;
- mapear todos os estados existentes;
- preservar histórico;
- reutilizar componentes existentes;
- validar transições;
- usar permissões backend/RLS;
- reutilizar notificações existentes;
- manter UX simples;
- preservar filas reais de trabalho;
- testar fluxo completo.

------------------------------------------------------------------------

# 55. DEFINIÇÃO FINAL DO PRODUTO

Cada Job deve permitir compreender:

``` text
STATUS OPERACIONAL
+
MACROFASE
+
RESPONSÁVEL
+
PRÓXIMA AÇÃO
+
PRAZO
+
BLOQUEIO
+
NOTIFICAÇÃO
+
HISTÓRICO
+
PUBLICAÇÃO
```

------------------------------------------------------------------------

# 56. INSTRUÇÃO FINAL PARA CODEX / CLAUDE CODE

Use este documento como **contrato funcional**, porém nunca de forma
cega.

A versão 1.1 estabelece explicitamente:

> **A arquitetura existente do NUFLOW deve ser respeitada quando ela já
> representar melhor a operação real.**

Quando houver divergência:

1.  Audite primeiro.
2.  Preserve dados e histórico.
3.  Preserve granularidade operacional útil.
4.  Reutilize infraestrutura existente.
5.  Derive simplificações em vez de duplicar estado.
6.  Não tome decisão estrutural silenciosamente.
7.  Apresente o impacto antes de migrações relevantes.
8.  Atualize a documentação quando uma decisão estrutural for validada.

O objetivo não é fazer o NUFLOW parecer com este documento.

O objetivo é utilizar este documento para **evoluir o NUFLOW sem
destruir a arquitetura operacional que já funciona**.

------------------------------------------------------------------------

# CHANGELOG

## v1.1

Alterações principais:

- `StatusInterno` existente definido como fonte de verdade operacional.
- 6 estados da especificação redefinidos como `JobPhase` macro derivada.
- Removida obrigação de Kanban com exatamente 6 colunas.
- Preservada a coluna operacional “Para Postar”.
- `publicationStatus` mantido como dimensão separada.
- `finished != published` reforçado.
- `impedimento` definido como condição/bloqueio, não macrofase.
- cancelado/encerrado/expirado separados de conclusão bem-sucedida.
- adicionada auditoria obrigatória dos estados existentes.
- adicionado mapeamento obrigatório:
  `StatusInterno → Coluna → JobPhase → publicationStatus → condição`.
- reforçada proibição de migração destrutiva apenas para adequar a
  especificação.

------------------------------------------------------------------------

# ANEXO A — MAPEAMENTO VALIDADO (07/09/2026)

Cumpre o §8 deste documento. Validado por Giovani antes da implementação e
implementado em `src/lib/job-fase.ts`, com teste de exaustividade em
`tests/unit/job-fase.spec.ts`.

O critério do mapeamento é o §2 — **de quem é a bola agora?** — e não a coluna
em que o card aparece hoje. É por isso que `planejamento` e `urgencia_aprovada`
vivem na coluna "Produção" e mesmo assim são `pending_assignment`: ninguém foi
acionado ainda.

| StatusInterno | Coluna do Kanban | JobPhase | publicationStatus | Condição |
|---|---|---|---|---|
| `pedido_criado` | Entrada | `pending_assignment` | `not_published` | |
| `aguardando_aprovacao_interna` | Entrada | `pending_assignment` | `not_published` | |
| `aguardando_triagem` | Entrada | `pending_assignment` | `not_published` | |
| `urgencia_pendente_aprovacao` | Entrada | `pending_assignment` | `not_published` | |
| `urgencia_aprovada` | Produção | `pending_assignment` | `not_published` | |
| `planejamento` | Produção | `pending_assignment` | `not_published` | |
| `videomaker_recusou` | Produção | `pending_assignment` | `not_published` | volta à fila (§6) |
| `videomaker_notificado` | Produção | `dispatched` | `not_published` | |
| `videomaker_aceitou` | Produção | `in_progress` | `not_published` | |
| `captacao_agendada` | Produção | `in_progress` | `not_published` | |
| `captacao_realizada` | Produção | `in_progress` | `not_published` | captou, não entregou |
| `brutos_enviados` | Produção | `material_uploaded` | `not_published` | |
| `editor_atribuido` | Edição | `in_editing` | `not_published` | |
| `fila_edicao` | Edição | `in_editing` | `not_published` | |
| `editando` | Edição | `in_editing` | `not_published` | |
| `edicao_finalizada` | Aprovação | `in_editing` | `not_published` | master não aprovado |
| `revisao_pendente` | Aprovação | `in_editing` | `not_published` | |
| `ajuste_solicitado` | Aprovação | `in_editing` | `not_published` | |
| `impedimento` | Aprovação | `in_editing` | `not_published` | **bloqueado** |
| `aprovado` | Para Postar | `finished` | `not_published` | fila do Social |
| `postagem_pendente` | Para Postar | `finished` | `not_published` | fila do Social |
| `postado` | Finalizado | `finished` | `published` | |
| `entregue_cliente` | Finalizado | `finished` | `published` | |
| `contagem_15_dias_iniciada` | Finalizado | `finished` | `published` | |
| `lembrete_15_dias_enviado` | Finalizado | `finished` | `published` | |
| `expirado` | Finalizado | `finished` | por evidência | terminal |
| `encerrado` | Finalizado | `finished` | por evidência | terminal, pode ser **cancelado** |

## A.1 Por que `expirado` e `encerrado` respondem por evidência

Os dois são alcançáveis **sem** ter passado por `postado` — `impedimento →
encerrado` e `urgencia_pendente_aprovacao → encerrado` são caminhos legais em
`TRANSICOES_VALIDAS`. Para eles a publicação é derivada de prova (`linkPostagem`
preenchido ou `dataPostagem` gravada), não da posição na cadeia.

Pela mesma razão, `ehCancelado()` distingue "encerrado sem nunca ter entregue"
de "concluído": ambos caem em `finished` porque a especificação não tem fase de
cancelamento, e tratá-los como a mesma coisa seria mentira de gestão.

## A.2 DIVERGÊNCIA — `scheduled` não tem produtor

O §11 define três valores para `publicationStatus`: `not_published`,
`scheduled`, `published`.

**Nada na base produz `scheduled` hoje.** `Demanda.dataPostagem` é gravada
exclusivamente no ato de marcar como `postado`
(`src/app/api/demandas/[id]/status/route.ts`), e a tela a exibe como
"Postado em" — é fato consumado, não agendamento. Não existe campo de "agendado
para" no schema.

Inferir `scheduled` de `dataPostagem > agora` produziria um estado que não
corresponde a nada, porque essa data nunca está no futuro.

Decisão: `scheduled` fica **declarado no tipo e sem produtor** até existir um
campo de agendamento. O teste `nada na base produz scheduled hoje` registra a
ausência como sabida, e não como esquecimento. Criar o campo é decisão de outra
fase — publicação não estava no escopo desta etapa.

## A.3 Trava de exaustividade

Duas camadas, porque uma não basta:

1. `Record<StatusInterno, JobFase>` — um status novo sem mapeamento **não
   compila**.
2. O teste enumera o enum em runtime (`Object.values(StatusInterno)`) e falha
   nomeando o status órfão — porque `tsc` não roda em todo caminho, e um mapa
   incompleto em produção devolve `undefined` como fase, que vira card sem
   coluna.

A verificação foi provada por simulação: removendo `fila_edicao` do mapa, três
testes falham e o primeiro diz `StatusInterno sem fase: fila_edicao`.
