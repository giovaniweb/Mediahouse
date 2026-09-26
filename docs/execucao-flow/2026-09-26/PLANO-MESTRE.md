# Flow: plano de execução em cascata

Versão 1 — 26/09/2026. Preparado a partir da auditoria do código, interface de produção e registros operacionais. **Este pacote é um plano; nenhuma correção foi implementada por sua criação.**

## Resultado esperado

Entregar um Flow mais simples, com dados confiáveis, isolamento entre empresas, automações observáveis e custos controlados. Preservar o núcleo Demandas/Jobs, Agenda, Equipe e Parcerias. IA ajuda a interpretar e planejar; autorização, contagem, cobrança, alertas e cálculo financeiro funcionam por código determinístico.

Há evidência suficiente para iniciar a execução. A auditoria adicional necessária está embutida nos cartões: testes de isolamento, recibos de WhatsApp, sincronização real, transcode, restauração e piloto. Não refazer a auditoria inteira antes de corrigir os defeitos já demonstrados.

## Como usar este pacote

1. Ler este plano uma vez e o [controle de execução](/Users/giovanigomes/MediaHouse/videoops/docs/execucao-flow/2026-09-26/CONTROLE.md).
2. Executar uma tarefa por vez, na ordem das dependências. Ler somente o caderno da tarefa atual e as fontes necessárias.
3. Usar o [texto de início](/Users/giovanigomes/MediaHouse/videoops/docs/execucao-flow/2026-09-26/INICIAR.md) depois de escolher o modelo desejado.
4. Ao retomar, ler primeiro o checkpoint no controle. Não depender da memória da conversa.

| Caderno | Cartões | Entrega |
| --- | --- | --- |
| [Fundação e segurança](/Users/giovanigomes/MediaHouse/videoops/docs/execucao-flow/2026-09-26/01-fundacao-seguranca.md) | F00–F01, S01–S08 | Base de trabalho, testes isolados, acesso e segredos |
| [Relatórios](/Users/giovanigomes/MediaHouse/videoops/docs/execucao-flow/2026-09-26/02-relatorios.md) | R01–R04 | Histórico legível, métricas, filtros, galeria |
| [Automações](/Users/giovanigomes/MediaHouse/videoops/docs/execucao-flow/2026-09-26/03-automacoes.md) | O01–O06 | Fila, WhatsApp, regras, observabilidade, limites |
| [Mídia](/Users/giovanigomes/MediaHouse/videoops/docs/execucao-flow/2026-09-26/04-midia.md) | M01–M04 | Arquivo privado, prévia, Drive, biblioteca |
| [Custos e externos](/Users/giovanigomes/MediaHouse/videoops/docs/execucao-flow/2026-09-26/05-custos.md) | C01–C03 | Contratação, competência e painel financeiro |
| [Experiência e SaaS](/Users/giovanigomes/MediaHouse/videoops/docs/execucao-flow/2026-09-26/06-experiencia-saas.md) | U01–U07 | Navegação, quatro jobs, secretária, gestão |
| [Validação e release](/Users/giovanigomes/MediaHouse/videoops/docs/execucao-flow/2026-09-26/07-validacao-release.md) | I01, L01–L03 | Custos de infraestrutura, ensaio, publicação e piloto |

## Fontes e estado inicial

- [Auditoria de referência](/Users/giovanigomes/MediaHouse/videoops/docs/auditorias/2026-09-26-auditoria-flow.md).
- [Verificações e limitações](/Users/giovanigomes/MediaHouse/videoops/docs/auditorias/2026-09-26-verificacoes.md).
- [Dados agregados](/Users/giovanigomes/MediaHouse/videoops/docs/auditorias/2026-09-26-dados-operacionais.json).
- [Quatro reproduções diagnósticas](/Users/giovanigomes/MediaHouse/videoops/docs/auditorias/2026-09-26-probes.spec.ts). Elas passam quando o defeito existe; não são testes de proteção.

Produção observada: https://nuflow.space/dashboard, commit 7750b33, deploy de 12/09/2026. Fonte principal: /Users/giovanigomes/MediaHouse/videoops, HEAD c02f3ad no momento da auditoria. Há alterações locais anteriores e outras cópias. A interface de /Users/giovanigomes/MediaHouse/nuflow-kanban-preview já remove Tabela/importação, mas não está publicada. F00 deve reconciliar esse estado antes de qualquer edição.

Os números da auditoria são um retrato, não constantes para testes de regressão. A coleta usa o banco configurado localmente, corroborado por contagens da interface; não foi comparada a credencial com o deploy. Testes novos usam empresas e pessoas sintéticas.

## Decisões de produto já definidas para a implementação

| Assunto | Decisão padrão |
| --- | --- |
| Estrutura | Evoluir Next.js/Prisma/Supabase existentes. Não reescrever o produto nem trocar de provedor nesta fase |
| Menu | Hoje, Trabalho, Agenda, Biblioteca, Equipe, Gestão; Administração restrita |
| Trabalho | Demandas e Jobs como recortes do fluxo existente; Audiovisual/Growth; Kanban e Lista |
| Tabela e planilha | Retirar seletor, modal e endpoint de importação; reutilizar as mudanças existentes |
| Entregas sem vídeo | Filtro de qualidade na Biblioteca; não destino principal |
| Alertas | Manter, com regra, responsável, motivo, próxima ação e resolução |
| Central de IA | Tirar vitrine de agentes do fluxo diário; oferecer assistência contextual depois da autorização |
| Relatórios | Números por consultas determinísticas; texto de IA opcional sobre snapshot imutável |
| Growth | Separar demandas concluídas, entregáveis aprovados por tipo e publicações |
| Arquivo final | Não publicar automaticamente. Original privado, prévia privada, publicação explícita |
| Conversão | MP4 H.264/AAC para prévia; MP3 apenas para áudio. Original preservado |
| Histórico | Ocultar concluídos antigos da fila não apaga serviço, custo nem arquivo |
| Finanças | Custo por competência; desconhecido não vira zero; referência comercial por vídeo não vira receita |
| WhatsApp | Pedido, aceite de convite identificado, plano do dia e atualização/entrega |
| Quatro jobs | Até quatro sugestões permitidas e explicáveis; não promessa de duração nem atribuição automática |
| Plataforma | Onboarding assistido e limites por empresa; billing automático fica fora desta primeira entrega |
| Execução | Um executor, tarefas pequenas e checkpoints; sem subagentes ou sistemas novos de orquestração |

Nomes de tabelas/serviços novos nos cadernos são propostas de contrato. Antes de criar, conferir se já existe equivalente. Reutilizar os helpers de escopo, permissão, mídia e transições; não manter duas fontes de verdade.

## Fluxo de trabalho do executor

Para cada cartão:

1. Conferir dependências e o estado atual do código. Se já estiver resolvido, comprovar com teste/diff e registrar; não reimplementar.
2. Escrever em até cinco linhas a mudança e a prova de aceite. Se surgir uma decisão não prevista, escolher a alternativa reversível mais simples, desde que preserve os contratos deste plano.
3. Implementar uma fatia coerente. Cartões com vários passos podem ter checkpoints A/B/C antes do fechamento.
4. Rodar os testes específicos. Falha causada pela mudança deve ser corrigida antes de seguir. Não alterar expectativa para aceitar comportamento errado.
5. Rever autorização, contrato e efeitos colaterais do diff, especialmente no backend.
6. Registrar arquivos, validações, limitações e próxima ação no CONTROLE.md.
7. Seguir automaticamente para a próxima tarefa liberada. Não terminar cada cartão perguntando se deve continuar.

Se faltar serviço, dado ou credencial, separar o que pode ser comprovado localmente da validação externa. Continuar tarefas independentes; não ligar uma integração fictícia, inventar dados históricos ou marcar o cartão como completo sem os critérios exigidos. Quando não houver trabalho útil possível, explicar o bloqueio e a informação/ação mínima para destravá-lo.

## Fronteiras desta execução

Atualização 26/09: o usuário autorizou executar os planos. A execução técnica começou no checkout indicado em CONTROLE.md. O texto de INICIAR.md propõe uma execução técnica que prepara código, testes, migrações e pacote de release. **L02 e L03 são etapas operacionais posteriores**, com autorização de publicação e destinatários/ambientes definidos. Um plano salvo não inicia trabalho sozinho nem muda o modelo.

Na execução técnica, não é necessário pedir confirmação para edições locais, correções, testes isolados ou decisões reversíveis já especificadas. Preservar mudanças existentes; usar checkout isolado se houver concorrência. Não fazer reset/clean global, copiar .env de produção para preview, reprocessar históricos reais, enviar mensagens a pessoas, publicar mídia ou aplicar DDL em produção por inferência.

Isso é particularmente relevante aqui: o repositório já possui [guarda de banco](/Users/giovanigomes/MediaHouse/videoops/scripts/guarda-banco.mjs) e [workflow de migrations](/Users/giovanigomes/MediaHouse/videoops/.github/workflows/release-migrations.yml). O workflow determina aplicação por disparo manual confirmado. Preparar SQL e ensaio antes de chegar a essa etapa; não contornar a guarda. A auditoria também teve exportação de segredos rejeitada por revisão automática; este plano não autoriza repetir ou contornar essa exportação.

Se o usuário já tiver autorizado uma operação concreta na conversa de execução, conservar essa autorização e não perguntar de novo. Mudança de risco, destino ou conteúdo da operação precisa ser explicitada.

## Contratos transversais

**Acesso:** sessão identifica a pessoa; vínculo atual determina empresa/papel; permissão permite ação; escopo limita registros. Nenhum desses níveis substitui outro. A organização de cookie/JWT/body é indicação, não autoridade. Ações de integração têm identidade técnica explícita, restrita à organização e finalidade.

**Dados:** timestamps persistidos em UTC; recortes de calendário no fuso da empresa. Períodos internos usam início inclusivo e fim exclusivo. Valores monetários novos usam Decimal/centavos, com arredondamento explícito. Nunca reconstruir custo histórico pela tarifa atual sem revisão.

**Efeitos:** uma operação de negócio pode ser tentada várias vezes e deve produzir o efeito uma única vez quando o mecanismo permitir. Não prometer exatamente uma entrega via provedor sem suporte: timeout ambíguo deve resultar em estado desconhecido/reconciliação, não reenvio cego.

**Filas:** estado durável no Postgres, chave única, prazo de validade, lease com expiração e tentativas limitadas. Reivindicar trabalho em transação curta; chamada de rede fora dela; atualizar resultado com a mesma versão/lease. Sem serviço pesado dentro de request do Next.

**Migrations:** expansão compatível → ensaio → aplicação autorizada → código compatível → eventual contração posterior. Nunca misturar remoção de coluna e migração de dados com a entrega inicial. Novas tabelas de empresa recebem escopo, índices, políticas e testes de isolamento na mesma fatia.

**Segredos:** respostas por allowlist; credenciais só no servidor; erros/logs sanitizados. Criptografia autenticada com versão de chave, sem invalidar legados silenciosamente. Não registrar tokens, URLs assinadas, PIX/CPF ou corpo integral de conversa em logs de auditoria.

## Verificação e política de conclusão

Cada cartão possui quatro campos independentes no controle:

- Implementação: A_FAZER, EM_EXECUCAO, IMPLEMENTADO ou BLOQUEADO.
- Validação: NAO_EXECUTADA, UNITARIA, INTEGRADA_ISOLADA ou EXTERNA_PENDENTE, acompanhada das provas.
- Revisão: PENDENTE ou CONFERIDA, com riscos materiais.
- Publicação: NAO_PUBLICADO, PUBLICADO ou NAO_APLICAVEL.

IMPLEMENTADO exige o código e as verificações locais exigidas pelo cartão. EXTERNA_PENDENTE não significa “integração funcionando”. Cartão sem teste obrigatório de banco não pode ser fechado por mocks. Revisão significa segunda leitura crítica do diff, não fingir revisão independente de outro profissional.

Rodar testes direcionados por cartão. Ao fechar cada caderno de código, rodar a suíte unitária, os auditores e checagem de tipos compatível com o repositório. Build no final de cada candidato a release, em ambiente isolado. Não repetir a suíte inteira a cada alteração de texto.

Na auditoria: 595 testes/38 arquivos passaram, assim como auditores de tenancy e perfil global. Esse número é referência histórica. Não há comando test:integration no package.json auditado, embora um comentário o mencione. F01 deve criar/verificar uma execução real de integração.

Não declarar “pronto para vender” antes de L03. A meta técnica termina com código e pacote de release verificados; publicação e piloto têm seus próprios critérios.

## Ordem e entregas intermediárias

    F00 → F01 → S01…S08 → R01…R04 → O01…O06
          → M01…M04 → C01…C03 → U01…U07 → I01 → L01
          → L02 (publicação autorizada) → L03 (piloto)

As dependências exatas estão no controle. Se houver bloqueio localizado, pode-se avançar uma tarefa independente sem declarar a fase bloqueada como concluída.

Preparar três candidatos revisáveis: (A) segurança e correções de dados; (B) automações/mídia/custos; (C) experiência e gestão. Não esperar todo o projeto para tornar a correção da exposição de segredos revisável. Não publicar os três num único salto sem checkpoints.

## Continuidade no Codex e economia de contexto

O texto de início solicita um Goal explícito com resultado verificável. Goals permitem continuidade entre turnos até conclusão ou condição de parada; não eliminam limites, permissões ou bloqueios. Este pacote prepara esse pedido, sem ativá-lo agora. [OpenAI: Using Goals in Codex](https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex).

O executor deve ler o plano principal na entrada, o checkpoint na retomada e só o caderno atual. Plano, critérios e progresso em arquivos sustentam trabalhos longos. [OpenAI: Run long horizon tasks with Codex](https://developers.openai.com/blog/run-long-horizon-tasks-with-codex).

Não presumir que escolher um modelo leve garante resolver qualquer problema. Se uma decisão de autorização, transação, migração ou concorrência permanecer sem prova após investigação, registrar o contraexemplo e pedir revisão focada. O modelo leve pode continuar o restante. Não trocar o modelo automaticamente.

## Fora do escopo desta entrega

Reescrita completa, microserviços generalizados, marketplace financeiro, assinatura/cobrança automática, aplicativo móvel nativo, migração de nuvem, exclusão massiva de originais, criação automática de custos históricos e novos agentes autônomos genéricos. Novos problemas comprovados devem entrar no controle como adendos justificados, não como expansão silenciosa.

## Cobertura da auditoria e dos pedidos

Os IDs da primeira coluna são da auditoria; os demais são cartões deste plano.

| Achado ou pedido | Execução correspondente |
| --- | --- |
| S01 — Configuração expõe token | S02 |
| S02 — Permissões financeiras/IA | S01, S03, O06 |
| S03 — Segurança das ferramentas | S05, O02, U03 |
| S04 — OAuth | S04 |
| S05 — Revogação | S01, U05 |
| S06 — Runtime RLS | S07, L01, L02 |
| S07 — Mídia privada/pública | S06, U04 |
| R01 — Formato dos relatórios | R01 |
| R02 — Período e área | R02 |
| R03 — Growth e reabertura | R02 |
| C01 — Custo total incorreto | C02, C03 |
| C02 — Filtro financeiro | R03 |
| C03 — Backfill financeiro | C01, C02, U07 |
| W01 — Resultado de envio | O01, O03, O05 |
| W02 — Recebimento | O02, U03 |
| W03 — Agenda/lembretes | O04 |
| A01 — IA para regras | O04, O06, I01 |
| M01 — Drive | M01, M03 |
| M02 — Conversão/Railway | M02 |
| M03 — Galeria | R04, M04 |
| M04 — Pendência de final | M04, U01 |
| H01 — Histórico/retenção | M04 |
| Tabela/importação e excesso de telas | U01 |
| Jobs intuitivos/quatro sugestões | C01, U02, U03 |
| Externos e parcerias | C01, U04 |
| Pessoas, plataforma e segurança operacional | S01–S08, U05 |
| Auditoria intuitiva | S08, U06 |
| Parâmetros, e-mail e módulos sem uso | U07 |
| APIs, faturas, custo e Huawei não identificado | O06, I01 |
| Funcionamento real antes da venda | L01–L03 |
