# Migração fiel ao protótipo v8 — local

Referência aprovada: `/Users/giovanigomes/.codex/visualizations/2026/09/07/01a07d46-c793-7690-925c-5265b622fc12/nuflow-workspace-v8.html` (133215 bytes). Não substituir por outras interpretações do layout.

## Decisão posterior do usuário — navegação

O usuário aprovou explicitamente o **menu compacto atual do sistema local**, incluindo os agrupamentos de Administração. Preservar essa distribuição como navegação definitiva. O HTML v8 é referência para o conteúdo/visual das páginas, mas NÃO substituir a organização atual do menu pela do protótipo.

## Incremento de 26/09/2026

- Detalhes reais organizados em Pedido, Entrega, Conversa e Equipe e contexto. Componentes permanecem montados ao trocar de seção, preservando rascunhos e uploads.
- Cabeçalho com título editável e próxima ação derivada do fluxo existente; painel lateral e janela ampliada continuam disponíveis.
- Ajustes de sobreposição do player/envio sobre o painel e cabeçalho responsivo.
- Montserrat 300–700 hospedada localmente, com licença OFL, aplicada ao workspace moderno e detalhes. Sem dependência de rede no build.
- Proporções e superfícies do Kanban aproximadas do protótipo. A estrutura completa do quadro ainda precisa ser migrada; não considerar concluído.

## Verificação

Build Next webpack e TypeScript aprovados. Vitest: 615 testes, 41 arquivos aprovados. ESLint do detalhe: zero erros, oito avisos existentes. Script `scripts/qa/detail-local.cjs` usa login real e PostgreSQL local: quatro seções, rascunho preservado, painel/modal, preferência e abertura pela lista, desktop e mobile. Imagens de revisão em `/tmp/nuflow-v8-detail.png` e `/tmp/nuflow-v8-detail-mobile.png`.

## Pendências explícitas

Migrar integralmente cabeçalhos, filtros e cards de Audiovisual/Growth/Jobs; revisar entrega Growth (hero ainda compartilhado com Pedido); implementar Hoje/Meu trabalho e perfil completo; alinhar dashboard/agenda/usuários/configurações/SaaS ao protótipo. Não fabricar métricas ausentes. Fazer testes de permissões e persistência por página. Nenhum commit, push ou deploy autorizado nesta fase.

## Banco real

O banco local é PostgreSQL real com fixtures sintéticas; não contém cópia de produção. Foram localizadas configurações externas em `videoops/.env.local`, sem expor valores. A revisão automática rejeitou a extração integral com pg_dump por escopo/origem não explicitamente confirmados. Nenhuma extração foi executada. Não tentar por outro meio. Aguardar autorização explícita da origem e do conjunto de dados. Continuar trabalho de interface com o banco local.

## Continuidade

Automação de heartbeat criada nesta tarefa: `continuar-migra-o-local-nuflow-v8`, a cada hora, para continuar a migração local até a revisão completa. Não interpretar isso como migração já concluída. Desativar ao concluir.

## Continuação 04h — controles dos quadros

Audiovisual e Growth usam `BoardOverview.module.css` e o ramo moderno de `BarraVisao`: título do protótipo, KPIs compactos calculados das demandas filtradas, Kanban/Lista, preferência de detalhes, filtros existentes e recortes. O período real de concluídas permanece explícito (hoje). Filtros móveis continuam recolhíveis. Navegação lateral não alterada. Removido o slogan duplicado do interior do Kanban. Ainda pendentes thumbnails/estrutura final dos cards e demais páginas.

Verificação deste incremento: build webpack e TypeScript aprovados; lint dos componentes/páginas alterados com zero erros e sete avisos preexistentes. `scripts/qa/demand-action-local.cjs` passou com login real nos dois quadros, busca, alternância Kanban/Lista, expansão dos filtros mobile e abertura de Nova Demanda. Capturas `/tmp/nuflow-v8-demandas-desktop.png`, `/tmp/nuflow-v8-demandas-mobile.png`, `/tmp/nuflow-v8-design-desktop.png`, `/tmp/nuflow-v8-design-mobile.png` revisadas. Servidor 3108 atualizado. Banco externo não acessado; sem commit/push/deploy.

## Continuação 05h — cards Audiovisual e Growth

`DemandaCard` agora tem apresentação moderna compartilhada: código/prioridade, miniatura real quando cadastrada, etiquetas e classificação, título, responsáveis com iniciais, prazo, contagem real de comentários e arquivos. O videomaker passa a participar da identificação dos responsáveis (antes o rodapé só considerava editor/designer/responsável). Nomes repetidos são agrupados; o nome completo permanece no título/descrição acessível. Miniaturas ausentes, inválidas ou que falhem ao carregar não geram arte fictícia. Todas as ações existentes, mensagens de estado e formulário de postagem foram preservados. Layout clássico mantido.

Validação: TypeScript e build webpack aprovados. ESLint: zero erros e um aviso preexistente sobre Date.now. Testes HTTP/browser com login e PostgreSQL local: `demand-action-local.cjs` e `detail-local.cjs` aprovados (Audiovisual/Growth, visualizações, busca/filtros, nova demanda, painel/modal, rascunho preservado e viewport mobile). Captura desktop revisada. As fixtures atuais não têm miniatura: renderização com uma imagem real cadastrada ainda precisa de cenário dedicado; não declarar validada essa ramificação. Menu compacto inalterado. Sem banco externo, commit ou publicação.

## Continuação 06h — dashboard

Cabeçalho `Sua operação, em perspectiva.`, tipografia e superfícies alinhados ao HTML v8. Adicionada área `Decisões de hoje` com contagens da API atual e links aplicáveis para aprovação, atraso e equipe. Mantidos os indicadores existentes com seus períodos e definições reais; não foram incluídos percentuais no prazo, tempo médio de ciclo nem gráfico semanal demonstrativo. Essas métricas do protótipo seguem pendentes de implementação e validação de dados. Menu compacto preservado.

Build/TypeScript e lint aprovados. `scripts/qa/dashboard-local.cjs` passou com login real e PostgreSQL local: comparação da contagem de aprovação com a API, navegação ao quadro filtrado, desktop e mobile sem overflow horizontal, nenhum pageerror. Capturas `/tmp/nuflow-dashboard-v8-desktop.png` e `/tmp/nuflow-dashboard-v8-mobile.png` revisadas. Sem banco externo, commit, push ou publicação. Demais páginas e métricas históricas continuam pendentes.

## Continuação 07h — agenda

Cabeçalho `Seu tempo de criar.`, alternância Mês/Lista e lista cronológica dos eventos reais do mês, respeitando os filtros de contexto existentes. A preferência de abrir detalhes em painel lateral ou modal é compartilhada com os cards; é possível ampliar o painel e fechar com Escape. Mantidos calendário, cadastro, exportação, metadados, vínculo com demanda e restrição da ação de excluir. Menu compacto preservado. Visão semanal e revisão completa da edição de compromissos continuam pendentes.

Build webpack e lint aprovados. `scripts/qa/agenda-local.cjs` passou com login real e PostgreSQL local: criação de evento temporário pela API, visualização na lista, painel/modal, Escape e mobile sem overflow horizontal nem pageerror. O evento temporário é removido no finally do teste. Capturas `/tmp/nuflow-agenda-v8-drawer.png` e `/tmp/nuflow-agenda-v8-mobile.png` revisadas. Servidor local 3108 atualizado. `git diff --check` aprovado. Sem banco externo, commit, push ou publicação; migração geral ainda em andamento.

## Continuação 08h — visão semanal da agenda

Adicionada Semana ao lado de Mês/Lista, com navegação por semana, intervalo explícito, horários e todos os eventos de cada dia (sem o limite de três do mês). No celular, a rolagem horizontal fica contida no calendário. Menu compacto e detalhes compartilhados preservados.

O teste inicial encontrou a exclusão de eventos do último dia: a consulta anterior enviava somente a data final, interpretada à meia-noite. Agora os limites do calendário são enviados em ISO com o instante completo de início/fim, respeitando o fuso do navegador. Rebuild e repetição de `scripts/qa/agenda-local.cjs` aprovados: evento real no sábado, próxima/semana anterior, lista, painel/modal, Escape e mobile sem overflow da página. Capturas semanais desktop/mobile revisadas. Build e lint aprovados; servidor 3108 atualizado. A API mantém sua semântica de eventos contidos no intervalo; eventos que atravessam os limites ainda exigem revisão específica. Edição de compromissos e demais páginas permanecem pendentes. Sem commit/push/publicação ou acesso ao banco externo.

## Continuação 09h — miniaturas reais dos cards

Desativado o arraste nativo do elemento img para não disputar com o arraste do card. Criado `scripts/qa/thumbnail-local.cjs`, restrito explicitamente ao PostgreSQL 127.0.0.1:55437/nuflow_local: altera temporariamente apenas thumbnailUrl da fixture LOCAL-a-audiovisual, carrega um PNG existente do servidor local e restaura o valor original em finally. Sem imagens ou dados externos.

Build aprovado; lint zero erros, um aviso preexistente Date.now. Teste real aprovado: imagem carregada, clique abre detalhes, fechamento, viewport mobile sem overflow da página e fallback quando imagem falha. O cenário lazy-loaded precisa trazer o card para a área visível antes de verificar o fallback; teste ajustado para isso. Capturas `/tmp/nuflow-thumbnail-desktop.png` e `/tmp/nuflow-thumbnail-mobile.png` revisadas. Essa validação encerra a pendência específica de renderização de miniatura; não cobre upload de vídeo ou drag-and-drop completo. Servidor local atualizado; nenhuma publicação ou commit. Demais páginas e funcionalidades pendentes continuam no escopo.

## Continuação — Jobs, visualizações e resumo

Jobs ganhou Kanban/Lista no visual moderno, resumo de jobs filtrados/atrasados/captações hoje e lista com próxima ação e responsável derivados das funções operacionais existentes. Tipografia, superfícies e controles seguem a linguagem do v8. O HTML aprovado não contém uma página Jobs específica; foi aplicado o padrão de listas do protótipo preservando a semântica própria do módulo. A lista abre /jobs/[id], mantendo o fluxo de negócio existente. Não alterados endpoints, permissões, gate de aprovação, isolamento nem menu compacto.

Build webpack, lint e git diff --check aprovados. `scripts/qa/jobs-v8-local.cjs` cria um Job temporário exclusivamente no PostgreSQL local e remove em finally: validou Kanban/Lista, busca por código, link operacional e mobile sem overflow/pageerror. Capturas `/tmp/nuflow-jobs-v8-list.png` e `/tmp/nuflow-jobs-v8-mobile.png` revisadas. Dados exibidos no teste são explicitamente sintéticos. Servidor 3108 atualizado. Detalhes do Job e migração das demais páginas continuam pendentes. Sem commit/push/publicação.

## Ampliação de escopo — autenticação e cadastro

Usuário solicitou também login, recuperar senha, cadastro e páginas auxiliares de sistema. Login, esqueci-senha e redefinir-senha foram modernizados com AuthSurface compartilhado, Montserrat, layout responsivo e contraste alinhado ao v8. Campos rotulados, autocomplete, mostrar/ocultar senha, foco visível, mensagens acessíveis e estados de conexão/link inválido/sucesso. Removido redirecionamento automático de sucesso da redefinição para permitir leitura e decisão do usuário. Símbolo inline evita depender de imagem bloqueada para visitantes sem sessão.

Validação: build webpack, lint sem avisos/erros e diff check aprovados. `scripts/qa/auth-local.cjs` usa usuário e token temporários no PostgreSQL local, removidos ao terminar: login incorreto, mostrar senha, erro de recuperação, token inválido/usado, divergência de confirmação, troca de senha persistida e login real com a nova senha. Capturas desktop/mobile em `/tmp/nuflow-auth-*.png`; revisão visual realizada. Envio SMTP e recuperação por e-mail entregue NÃO foram validados nem enviados externamente.

Cadastro ainda pendente da regra solicitada ao usuário: convite da empresa, criação pública de empresa ou solicitação sujeita à aprovação. Pergunta enviada nesta tarefa. Não abrir criação pública de contas ou empresas sem a definição. Fluxos auxiliares de acesso/convite e demais páginas de sistema precisam ser inventariados e concluídos. Nenhum commit/push/deploy; servidor 3108 atualizado.

## Continuação 10h — detalhes operacionais de Jobs

Confirmado: /jobs/[id] já usa DemandaDetalhe compartilhado; não criar uma segunda tela divergente. Refinada a seção Operação do Job com etapa e responsável atual legíveis, removendo a duplicação visual da próxima ação no modo moderno. Ações de videomaker e conversão mantidas com seus controles existentes. Corrigida quebra das ações do cabeçalho em tela pequena.

Build aprovado; lint zero erros e oito avisos existentes. `jobs-v8-local.cjs` ampliado para navegar às quatro abas pela rota real /jobs/[id], verificar mobile e capturar desktop/mobile. Teste passou com fixture temporária em PostgreSQL local, removida ao terminar. Capturas /tmp/nuflow-job-detail-{desktop,mobile}.png revisadas. Validação cobre apresentação e navegação, não todas as transições de negócio/perfis do Job. Nenhum commit, push, deploy ou acesso externo. Cadastro permanece pendente da decisão do usuário; demais páginas ainda em migração.

## Formulários de captura — solicitação do usuário

Implementada LP `/comecar` com nome, e-mail, WhatsApp, empresa, mensagem opcional, autorização de contato e atribuição utm_source/utm_campaign. Endpoint POST `/api/publico/leads` valida campos, aplica rate limit e honeypot, salva no PostgreSQL e não cria contas nem envia mensagens. Modelo LeadComercial e migration 20260926140000_leads_comerciais aplicados APENAS localmente. Tabela com RLS e política de INSERT público; role app_user ganha somente INSERT, sem leitura. Insert SQL parametrizado sem RETURNING; leitura `/api/admin/leads` passa por requireSuperAdmin e conexão administrativa. Painel `/admin/leads` lista os 100 mais recentes; link adicionado ao painel de empresas. Não há pipeline/CRM nem paginação completa nesta entrega.

Cadastro público `/cadastrar-videomaker?org=<slug>` modernizado preservando o endpoint existente e vínculo pendente de aprovação. Labels acessíveis, layout mobile, tratamento correto de erro string, botão protegido durante envio e PIX opcional. Continua coletando CPF/CNPJ na primeira etapa (contrato existente). Link sem org ainda usa fallback legado: divulgar sempre link com slug para SaaS. Login compartilhado `/login` já modernizado e aponta interessados para `/comecar`. Seleção automática continua a regra existente da primeira membership; branding e login dedicado por slug não foram implementados nem alegados.

Build e lint aprovados. `scripts/qa/capture-local.cjs` passou com Chrome, HTTP e PostgreSQL locais: lead com UTM persistido; acesso anônimo 401, cliente 403, super-admin autorizado; candidatura com status pendente ligada SOMENTE à empresa B; mobile sem overflow. Dados e super-admin temporários removidos ao final. Sessões dos perfis separadas em contextos de browser. Capturas `/tmp/nuflow-lead-{desktop,mobile}.png`, `/tmp/nuflow-recruit-mobile.png`, `/tmp/nuflow-leads-admin.png` revisadas. Não houve SMTP, WhatsApp, banco externo, commit ou publicação. RLS foi criada, mas teste desta rodada usa role dono local; validação com role restrito em ambiente de deploy permanece necessária.

## 26/09 — Formulário simples de gravação → Jobs

- Página pública `/agendar-gravacao?org=<slug>` com cliente/clínica, endereço completo, data, horário (Brasília) e consultora. Identifica a empresa destinatária; sem slug válido/ativo não oferece envio.
- POST `/api/publico/jobs?org=<slug>` grava diretamente `cobertura_evento`, área audiovisual, departamento eventos, `planejamento` / `producao`, sem videomaker atribuído. Exceção específica solicitada pelo usuário ao fluxo de aprovação; demais formulários continuam com suas regras anteriores.
- Endereço em `localGravacao`/`localEvento`; data em `dataCaptacao`/`dataEvento`; consultora em detalhes estruturados e descrição. Não presume identidade autenticada nem cria acesso para consultora. Confirmação avisa que disponibilidade da equipe ainda depende de atribuição.
- A FK obrigatória de solicitante usa uma identidade técnica **inativa por empresa**, “Formulário de gravação”, sem e-mail/telefone e com hash inválido para login. Pode aparecer entre pessoas inativas; não representa uma pessoa recrutada ou usuária ativa. Histórico deixa explícita a origem pública e não atribui ação a um administrador real.
- Transação atômica com contexto da empresa; idempotência por UUID de envio + trava transacional; validações de limites, data real/futura, horário, honeypot e limite em memória por IP. Nenhum envio de e-mail/WhatsApp neste endpoint.
- QA real `scripts/qa/job-form-local.cjs`: formulário em Chrome, gravação no PostgreSQL local, Job visível no quadro/lista da empresa B, GET negado (404) na empresa A, cinco campos conferidos, conversão 14:30 Brasília → 17:30Z, repetição sem duplicação, datas inválidas/passadas rejeitadas, link sem empresa bloqueado, mobile sem overflow. Todos os registros temporários e identidade técnica criados pelo teste removidos em finally. Sem banco externo ou mocks.
- Build webpack e ESLint dos arquivos alterados passaram; revisão visual desktop/mobile feita. Capturas `/tmp/nuflow-job-form-desktop.png`, `/tmp/nuflow-job-form-mobile.png`, `/tmp/nuflow-job-form-result.png`.
- Limites: validado com role proprietário do PostgreSQL local; teste com role RLS restrita segue pendente antes de produção. Rate limit é por instância; formulário público por slug não verifica identidade da consultora. Sem commit, push ou publicação. Migração geral continua incompleta conforme seções anteriores.

## Continuação 11h — página Meu perfil

- Nova rota autenticada `/perfil`, acessível pelo menu da conta no Header. Reutiliza a lógica existente de UserProfileModal em modo página, preservando PATCH do próprio usuário, upload de foto e troca de senha. Menu compacto não alterado.
- Composição baseada no perfil v8: título/subtítulo, identificação, abas e painéis escuros com Montserrat. Visão geral traz bio, contato e links realmente cadastrados; não inclui indicadores de produtividade nem conexões simuladas do protótipo. Dados pessoais, Segurança e Conta funcionais. Integrações e indicadores pessoais seguem pendentes de implementação com dados reais.
- Labels e feedback acessíveis, botão de foto visível também ao toque; instrução de exclusão esclarece que não há exclusão direta nesta tela e remove endereço de suporte não confirmado. Revisão visual identificou nome desatualizado da sessão no hero: corrigido para refletir nome carregado do perfil.
- `scripts/qa/profile-local.cjs` executa login com solicitante temporário, edição e persistência de nome/bio/Instagram, recarga, divergência de senhas e troca real conferida no hash local; navega abas e verifica overflow mobile. Usuário e vínculo removidos ao final. Nenhuma integração externa. Build webpack aprovado; lint sem erros, um aviso preexistente no Header (navegação de configurações).
- Capturas `/tmp/nuflow-profile-desktop.png` e `/tmp/nuflow-profile-mobile.png`. Sem commit/push/publicação. Migração geral ainda em andamento; automação permanece ativa.

## Continuação 12h — entrega Growth nas abas do v8

- Prévia de arte, copy e controles de aprovação Growth foram retirados da aba Pedido e reunidos em Entrega no visual novo. Uma única expressão JSX compartilhada preserva os mesmos handlers, permissões e estados; clássico mantém posição anterior. Briefing permanece em Pedido.
- Layout da prévia usa colunas fluidas no desktop amplo e uma coluna no painel estreito/mobile, sem largura fixa de 360px que comprimisse o conteúdo.
- Build webpack e TypeScript aprovados. Lint sem erros, oito avisos existentes do componente. `scripts/qa/growth-delivery-local.cjs` passou com login real e leitura da fixture LOCAL-a-design no PostgreSQL local: instância única, visível apenas em Entrega no moderno, navegação entre quatro abas e retorno, prévia preservada no clássico, mobile sem overflow. Nenhuma demanda modificada.
- Capturas `/tmp/nuflow-growth-delivery-{desktop,mobile}.png` revisadas. Teste cobre estado sem arte anexada e navegação; upload de mídia e ciclo completo de aprovação não foram executados nesta rodada. Não houve integrações externas, commit, push ou publicação. Migração geral ainda incompleta.

## Continuação 13h — Pessoas & Acessos responsivo

- Visual novo: tipografia do título mais leve, abas sublinhadas como no protótipo e painel lateral com superfície sólida. No mobile, cada linha da tabela vira um cartão com os mesmos nove campos/ações; desktop mantém tabela, filtros, seleção e paginação existentes. Nenhuma alteração nos endpoints ou permissões.
- Painel recebe foco no botão Fechar ao abrir; Esc fecha (primeiro recolhe Mais ações quando aberto) e restaura foco ao elemento de origem. Abas expõem estado aria-pressed. Sem transformar o painel em modal ou bloquear o restante do layout desktop.
- TypeScript, build webpack, lint dos arquivos alterados e diff check passaram. `scripts/qa/people-layout-local.cjs` passou usando login e dados locais: tabela/cartões sem overflow, abertura da pessoa, aba Acessos, foco inicial e retorno com Esc. Nenhuma escrita de dados de pessoas ou permissão. Revisão visual desktop, cartões mobile e painel mobile nas capturas `/tmp/nuflow-people-desktop.png`, `/tmp/nuflow-people-mobile.png`, `/tmp/nuflow-person-panel-mobile.png`.
- Limite desta rodada: não executadas mutações administrativas (convite, exclusão, redefinição de terceiros ou alteração de permissões). Migração geral permanece incompleta; sem commit/push/deploy e sem acesso ao banco externo.

## Continuação 14h — Configurações e distinção de perfil

- Configurações usa superfícies sólidas, título leve e seleção violeta alinhados ao workspace v8. Navegação horizontal mobile limitada à largura disponível; foco visível também em campos e links.
- Antiga aba Meu Perfil renomeada Atuação profissional: trata da habilitação como editor/videomaker, mantendo componentes e endpoints. Link explícito leva a `/perfil` para dados pessoais/senha, evitando duas áreas com nome idêntico e funções diferentes.
- Enquanto a sessão carrega, exibe estado de carregamento em vez de falso Acesso restrito. Restrição admin/gestor preservada; conteúdo nomeado como região acessível.
- Build webpack e diff check passaram; lint sem erros, nove avisos existentes. `scripts/qa/settings-layout-local.cjs` passou com contas locais admin e solicitante: acesso autorizado/restrito, navegação Dados da Empresa, mobile sem overflow e link até Meu perfil. Capturas `/tmp/nuflow-settings-{desktop,mobile}.png` revisadas. Sem salvar configurações nem acionar integrações.
- Limites: callbacks OAuth, conexões externas e persistência de todas as abas não foram revalidados nesta rodada. Modernização e validação global continuam pendentes; nenhuma publicação/commit/push ou consulta a banco externo.

## Continuação 15h — Meu trabalho com dados reais da aplicação local

- Nova rota autenticada `/meu-trabalho` e item dentro do grupo Geral, preservando a distribuição compacta aprovada. Lista no estilo v8: título, próxima ação derivada, área/código/prazo e etapa textual com cor.
- Minhas e Atrasadas consomem `/api/demandas?mine=1`; Todas usa a mesma API sem esse filtro adicional, mantendo escopo de empresa/permissões no servidor. “Minhas” inclui solicitante e participantes conforme helper existente; texto explica esse significado. Demandas encerradas/finalizadas não entram. Ordenação por prazo, sem prazo ao final. Sem indicadores inventados.
- Links abrem DemandaDetalhe existente. Estados de carregamento, erro com nova tentativa e lista vazia. A página não cria nem modifica demanda.
- Build webpack, TypeScript e diff check passaram; lint zero erros e aviso preexistente de imagem no Sidebar. `scripts/qa/my-work-local.cjs` cria três fixtures temporárias no PostgreSQL local, testa os três filtros, exclusão de outra empresa, navegação ao detalhe e ausência de overflow mobile; remove fixtures no finally. Capturas `/tmp/nuflow-my-work-{desktop,mobile}.png` revisadas.
- Limites: reutiliza listagem sem paginação da API atual; volume elevado requer avaliação posterior. Rodada valida perfil admin; matriz completa de executor/solicitante e empresas com compartilhamento segue pendente. Hoje, indicadores avançados e validação global ainda em andamento. Sem commit/push/publicação ou banco externo.

### Continuação 26/09 — Hoje (16h)
- Criada `/hoje` com até três trabalhos ativos ligados ao usuário, ordenados por prazo, próxima ação e acesso ao detalhe real. Incluída no menu Geral, sem reorganizar os grupos existentes.
- Extraído `components/work/WorkPage.tsx` para compartilhar a leitura com `/meu-trabalho`, preservando filtros e permissões dos endpoints atuais.
- Agenda exibe até três compromissos em andamento ou futuros nos próximos sete dias, excluindo cancelados/concluídos. Horário de Brasília explícito. Links abrem a agenda geral (ainda não selecionam o evento).
- Build webpack aprovado (`/tmp/nuflow-today-build.log`), TypeScript aprovado; lint sem erros, um aviso de atualização inicial do relógio em effect.
- `scripts/qa/today-local.cjs` aprovado em Chrome/PostgreSQL locais: evento próprio visível, outra empresa excluída, eventos fora do período/concluídos/cancelados excluídos, limite de trabalhos, navegação e ausência de overflow horizontal mobile. Fixtures temporárias removidas no finally.
- Regressão `my-work-local.cjs` aprovada após extração. Capturas `/tmp/nuflow-today-desktop.png`, `/tmp/nuflow-today-mobile.png`, `/tmp/nuflow-today-agenda-mobile.png` revisadas.
- Pendência visual constatada: widget flutuante “No que você está?” pode sobrepor o link final da agenda no mobile; revisar espaço inferior compartilhado. Testes de papéis adicionais e RLS com papel restrito continuam pendentes. Não foi feita auditoria completa de todas as páginas nesta execução.
- Servidor local ativo em 127.0.0.1:3108. Nenhum commit, push, publicação ou acesso a banco externo.

### Continuação 26/09 — painel de foco mobile (17h)
- Resolvida a sobreposição registrada na página Hoje: `PainelExecutor` passou para uma faixa de altura própria na coluna do dashboard abaixo de md. Conteúdo rolável tem a altura restante; não depende de padding estimado por página. Desktop conserva o painel fixo no canto.
- Conteúdo expandido abre acima da faixa com altura limitada à viewport; botão declara `aria-expanded` e `aria-controls`. Mantidos endpoints, estado persistido, dados e ações existentes.
- Build webpack aprovado (`/tmp/nuflow-dock-build.log`). Teste `scripts/qa/focus-dock-local.cjs` aprovado com sessão real local: limite geométrico do link Abrir agenda acima do painel, clique sem obstrução, abrir/recolher painel, navegação e quadro desktop sem overflow horizontal.
- Captura `/tmp/nuflow-focus-dock-mobile.png` revisada: último link visível e faixa separada. Teste somente de leitura, sem gravações em demandas/checklists.
- Migração total ainda pendente; este incremento não certifica todas as rotas/ações nem a matriz completa de permissões. Nenhum acesso externo ao banco, commit, push ou publicação.

### Continuação 26/09 — Administração do SaaS (18h)
- Modernizada a apresentação de empresas com superfícies/typografia do protótipo, cartões responsivos e ações que quebram de linha no mobile. Mantidos endpoints e regras de superadmin.
- Resumo calculado sobre resposta real da API: empresas, ativas, desligadas e vínculos de pessoas. Vínculos não são apresentados como usuários únicos ou usuários ativos. Sem métricas fictícias de uso, armazenamento ou suporte.
- Adicionados estados de erro com nova tentativa e lista vazia. Corrigido conflito de estilo global do header observado na primeira captura.
- Build webpack aprovado; `scripts/qa/organizations-layout-local.cjs` aprovado após correção. Contagens comparadas com API local, admin comum recebe 403 da API e não vê resumo, superadmin vê resumo, mobile sem overflow horizontal. Captura mobile final revisada (`/tmp/nuflow-org-mobile.png`). Teste somente leitura, sem criar/desativar empresas.
- Pendentes dashboard de funcionamento/suporte/atualizações, métricas de uso com fontes reais e revisão completa dos modais/ações de gerenciamento. Não houve commit, publicação ou acesso a banco externo.

### Continuação 26/09 — Modais SaaS (19h)
- Overlay compartilhado Nova empresa/Pessoas/Módulos migrado para dialog nativo, com nome acessível, botão Fechar nomeado, foco inicial, Escape, restauração do foco e ciclo Tab/Shift+Tab explícito. Fundo fica inerte via showModal.
- Superfície alinhada ao protótipo, altura limitada à viewport com rolagem interna e alvos de toque de 44px. Mantidas operações e permissões existentes.
- Primeiro teste detectou saída do ciclo de Tab no Chrome; corrigida antes da validação final.
- Build webpack e organizations-layout-local.cjs aprovados: foco contido em nove Tabs, Escape, restauração no acionador, abertura/fechamento de Módulos, geometria mobile, métricas e bloqueio de admin comum. Captura `/tmp/nuflow-org-dialog-mobile.png` revisada. Nenhuma empresa ou módulo foi alterado no teste.
- Ainda pendentes validação completa das mutações administrativas, matriz de papéis e funcionalidades de funcionamento/suporte/atualizações. Não houve commit, publicação ou acesso ao banco externo.

### Continuação — validação com solicitante (28/09)
- Adicionado `scripts/qa/today-roles-local.cjs`, executado com login real de solicitante no PostgreSQL local, sem alterar o perfil existente.
- Fixtures de agenda temporárias: pública da empresa A, privada da A, pública da B, fora do período, concluída e cancelada. Apenas a pública elegível de A apareceu em Hoje; demais ausentes. Fixtures removidas no finally.
- Navegação Hoje → Meu trabalho e viewport 390px aprovadas, sem overflow horizontal. Captura `/tmp/nuflow-today-requester-agenda-mobile.png` revisada. Nenhuma modificação de lógica de autorização realizada.
- Esta execução amplia a evidência de agenda para solicitante; não certifica todas as permissões de demandas, videomaker/gestor nem RLS com papel restrito. Migração completa permanece pendente. Sem commit, publicação ou acesso ao banco externo.

### Continuação 28/09 — estados dos modais administrativos
- Pessoas e Módulos distinguem carregamento, erro recuperável e lista vazia. Falha na consulta de pessoas não é mais apresentada como “Ninguém vinculado”. Botões de desvincular têm nome acessível com a pessoa correspondente.
- TypeScript e build webpack aprovados. `organizations-recovery-local.cjs` aprovado: abortou apenas a requisição de pessoas no navegador local, conferiu alerta sem falso estado vazio, liberou a rede e recuperou dados da API local com Tentar novamente. Regressões de foco, mobile e superadmin também passaram.
- Teste de falha deliberadamente simulado; recuperação usou PostgreSQL/API reais locais. Sem mutações de pessoas/empresas. Falha de Módulos ainda não tem cenário automatizado próprio.
- Migração completa e validação de todas as ações permanecem pendentes; sem commit, push, publicação ou banco externo.

### Continuação 28/09 — recuperação de Módulos validada
- Ampliado `organizations-recovery-local.cjs` para abortar a leitura de módulos no navegador local, verificar erro sem falso estado vazio e recuperar a lista real usando Tentar novamente.
- Teste aprovado junto às verificações existentes de Pessoas, resumo, superadmin e teclado. Captura `/tmp/nuflow-modules-recovered-mobile.png` revisada: conteúdo cabe na viewport mobile e módulos indisponíveis continuam desabilitados.
- Resolvida a pendência de cenário automatizado de falha de Módulos registrada na execução anterior. Nenhuma ação de ligar/desligar foi executada. Não houve alteração de código de produção nesta execução; build anterior preservado.
- Permanecem pendentes as demais páginas/ações, funcionamento/suporte/atualizações e matriz completa de papéis. Sem commit, publicação ou acesso externo.

### Continuação 28/09 — intervalo da agenda
- GET /api/agenda agora consulta interseção inclusiva de intervalos em vez de exigir evento inteiramente contido no período. Eventos iniciados antes ou terminados depois passam a ser retornados, sem mudar escopo de empresa/papel/privacidade.
- Período incompleto, inválido ou invertido retorna 400; ausência de ambos continua permitindo leitura sem intervalo.
- Build webpack aprovado. `agenda-overlap-local.cjs` com solicitante e fixtures temporárias locais confirmou sobreposição à esquerda, direita e total, excluiu evento fora do intervalo, privado e de outra empresa, validou 400. Fixtures removidas no finally.
- Mudança de consulta: não certifica ainda a representação visual de eventos de vários dias em cada visão. Sem commit, publicação ou banco externo.

### Continuação 28/09 — representação de eventos de vários dias
- Cards diários agora usam interseção com cada dia, tanto no mês quanto na semana e na seleção lateral. Fim exatamente à meia-noite não ocupa indevidamente o dia seguinte.
- Lista mensal inclui eventos iniciados em mês anterior que ainda estejam em andamento. Detalhe com horário informa também a data de término.
- Build aprovado. `agenda-multiday-local.cjs` criou evento temporário atravessando limites do mês por API local, confirmou sete cards na semana, lista, painel/modal, Escape e ausência de overflow de página no mobile; evento removido ao final. Captura semanal mobile revisada.
- Ainda pendente modernização da sinalização de conflitos: agrupamento atual considera dia inicial. Horário mostrado nos cards de continuação continua sendo o de início original. Sem commit, publicação ou acesso externo.

### Continuação — rótulos de continuação da agenda
- Visão semanal distingue horário inicial, “Em andamento” nos dias intermediários e “Até HH:mm” no dia final; eventos de dia todo mantêm seu rótulo.
- Build aprovado. Teste multiday ampliado confirma rótulos de continuação e evita repetição do horário inicial nos sete cards. Expectativa inicial de zero horários foi corrigida para permitir o primeiro dia legítimo. Execução final aprovada, registro temporário removido; captura mobile revisada.
- Indicação de conflitos continua pendente. Sem commit, publicação ou banco externo.

### Continuação — conflitos da agenda
- Substituído agrupamento por dia inicial por interseção real de horários em cada dia visível. Mantida regra de contextos Contourline × Freelance. Cancelados/concluídos excluídos; horários encostados sem interseção não conflitam.
- TypeScript e build aprovados. Teste `agenda-conflicts-local.cjs` com fixtures no PostgreSQL local e login admin verificou alerta para sobreposição e sua ausência após cancelar os eventos temporários; cleanup no finally. Sem mudança de eventos existentes.
- Teste automatizado não cobre ainda todas as combinações de horários adjacentes/fusos/perfis. Migração geral segue pendente. Sem commit, publicação ou acesso externo.

### Continuação — limite entre compromissos
- Ampliado agenda-conflicts-local.cjs: dois eventos temporários consecutivos, um terminando exatamente quando outro inicia, não produzem conflito; antecipar o segundo em um segundo produz alerta.
- Execução local aprovada, junto a sobreposição e cancelamento; sem erros de página. Fixtures removidas no finally. Resolve a pendência de cobertura de horários adjacentes; fusos/perfis adicionais seguem sem certificação completa.
- Nenhuma alteração de código de produção nesta execução, nenhum commit/publicação/acesso externo. Migração geral permanece em andamento.

### Continuação — ativação de empresas sem cliques duplicados
- Controle de ligar/desligar empresa bloqueia novas alterações durante PATCH e revalidação da lista, com guarda síncrona e aria-busy/nome acessível. Libera após sucesso ou erro.
- TypeScript/build aprovados. organizations-busy-local.cjs intercepta PATCH no navegador: segura resposta, verifica botão desabilitado e apenas uma chamada, retorna 503 simulado e verifica recuperação. Teste final aprovado após sincronizar assert com término da resposta. Nenhuma empresa foi ativada/desativada; leituras vieram da API local.
- Fluxo de sucesso de mutação administrativa permanece sem validação completa. Sem commit, publicação ou banco externo.

### Continuação — ativação real em empresa temporária
- `organization-toggle-real-local.cjs` criou empresa isolada exclusivamente no PostgreSQL local, desativou e reativou pelos botões reais com sessão superadmin e confirmou persistência direta no banco e após reload.
- Sessão separada de admin comum recebeu 403 ao tentar alterar a mesma fixture, sem mudar o estado persistido. Teste aprovado; empresa temporária removida no finally.
- Resolve a pendência do caminho de sucesso de ativação/desativação. Não cobre ainda criação/vínculos/módulos em todos os papéis nem bloqueio da última empresa ativa. Nenhuma empresa preexistente alterada; sem commit, publicação ou banco externo.

### Continuação — criação real pelo formulário SaaS
- `organization-create-real-local.cjs` criou empresa temporária pelo modal Nova empresa (nome e slug), confirmou POST 201 e persistência no PostgreSQL local, fechamento do modal e atualização da lista.
- Reutilizou o fluxo real de desativar/reativar e recarregar, além da tentativa negada de admin comum. Tudo aprovado; empresa temporária removida no finally.
- Teste não criou usuário, não enviou convites e não alterou empresas preexistentes. Vinculação de administrador por e-mail e demais operações permanecem pendentes. Nenhuma mudança de código de produção nesta execução; sem commit/publicação/banco externo.

### Continuação — administrador por e-mail na criação
- organization-admin-link-local.cjs preencheu o e-mail de um usuário sintético existente no modal de criação e conferiu vínculo admin na empresa temporária via PostgreSQL local.
- Papel solicitante desse usuário na empresa original permaneceu inalterado. Teste também concluiu ativação/desativação e negação de admin comum. Empresa e vínculo temporários removidos por cleanup; nenhuma mensagem ou convite enviado.
- Resolve caminho de sucesso para e-mail existente. Não certifica ainda e-mail inexistente, remoção de membros nem matriz completa de papéis. Sem commit/publicação/banco externo.

### Continuação — e-mail de administrador inexistente
- organization-missing-admin-local.cjs criou empresa de QA pelo formulário com endereço único example.invalid e confirmou aviso de necessidade de vincular pessoa em Pessoas.
- Consulta ao PostgreSQL local comprovou ausência de vínculo e de criação automática de conta para esse endereço. Empresa temporária removida no finally. Teste aprovado, sem envio de e-mail.
- Conclui os dois caminhos do campo opcional de administrador na criação (existente/inexistente). Validação não equivale à conclusão da migração geral: páginas e operações restantes continuam pendentes. Sem commit/publicação/banco externo.

### Continuação — desvinculação de pessoas
- Teste real revelou DELETE 400: interface enviava usuarioId no corpo enquanto API exige query. Corrigido botão para query codificada, mantendo contrato e autorização do backend.
- organization-member-removal-local.cjs aprovado após correção: vínculo temporário removido pela UI; conta e papel na empresa original preservados; cleanup da empresa.
- Build inicial falhou ENOSPC. Removido somente cache regenerável .next/cache/webpack (aprox. 1,2 GB); nova compilação aprovada e servidor local reiniciado. Espaço em disco merece acompanhamento.
- Sem commit, publicação ou banco externo. Migração completa ainda pendente.

### Continuação — vínculo pelo modal Pessoas
- organization-member-link-local.cjs validou remoção e novo vínculo como gestor pelo formulário do modal em empresa temporária, com persistência no PostgreSQL local. Papel solicitante na empresa original e conta preservados; cleanup completo no finally.
- Servidor local estava parado; reiniciado em 3108. Ajustado seletor do teste para combobox após timeout no nome exato do label. Execução final aprovada. Nenhuma alteração de código de produção nesta execução.
- Não certifica toda matriz de papéis/ações. Migração global pendente; sem commit/publicação/banco externo.

### Continuação — alteração real de módulos
- organization-modules-real-local.cjs criou empresa temporária, alterou módulo disponível pelo modal e verificou persistência diretamente no PostgreSQL local e atualização do botão.
- Tentativa explícita de ligar módulo indisponível retornou 409 e não criou configuração persistida. Teste aprovado; empresa/configuração temporárias removidas no finally.
- Sem alteração de empresas existentes, código de produção, commit ou publicação. Ainda não certifica efeito do módulo em todas as páginas/sessões da empresa nem conclui migração geral.

### 2026-09-29 — Equipe interna: primeira migração da superfície
- `/equipe`: cabeçalho editorial, Montserrat, superfícies e espaçamento alinhados à referência; busca e limpeza com nomes acessíveis e filtros com estado anunciado. Mantidos endpoint, cálculos e ações existentes.
- Build de produção local aprovado (`/tmp/nuflow-team-build.log`). Servidor reiniciado em `127.0.0.1:3108`.
- `scripts/qa/team-layout-local.cjs`: aprovado com autenticação e API locais, busca/limpeza, seleção de filtro e viewport 390×844 sem overflow horizontal. Capturas desktop/mobile revisadas: `/tmp/nuflow-team-{desktop,mobile}.png`.
- Limite da verificação: a empresa de teste não contém editores internos; os zeros são resultados da API local. Este teste não valida cards preenchidos, cadastro, exclusão ou detalhe individual. A migração desta área ainda precisa desses estados e de tratamento explícito de carregamento/erro. Nenhuma mutação, commit ou publicação realizada.

### 2026-09-29 — Recuperação da consulta da equipe interna
- Carregamento agora tem estado próprio; falha da API mostra aviso e botão de nova tentativa, sem apresentar indicadores zerados nem equipe vazia como resultado da falha. Nenhuma alteração em permissões ou endpoints.
- Resultado vazio de busca/filtro orienta ajustar os critérios, em vez de cadastrar a primeira pessoa.
- Build local aprovado (`/tmp/nuflow-team-recovery-build.log`). Teste `team-recovery-local.cjs` simula falha de rede somente no navegador e recupera pela API local real; não altera registros. Cards preenchidos e formulários continuam pendentes.

### 2026-09-29 — Cadastro da equipe interna
- Formulário com superfície Montserrat do protótipo, uma coluna no celular, alvos mínimos de 44px e rótulos associados aos campos. Seleções de áreas/especialidades anunciam estado.
- Janela nativa dialog com título acessível, Escape e restauração do foco. Campos e payload existentes preservados.
- Build aprovado: `/tmp/nuflow-team-form-build.log`. `team-form-layout-local.cjs` passou com login local: abertura, preenchimento sem envio, limites mobile, Escape e foco restaurado. Captura `/tmp/nuflow-team-form-mobile.png` revisada.
- Persistência do cadastro e cards preenchidos seguem pendentes; teste não enviou registros. Sem commit/publicação.

### 2026-09-29 — Cadastro real da equipe interna validado localmente
- `scripts/qa/team-create-real-local.cjs` aprovado: formulário grava editor no PostgreSQL local, cidade e capacidade 7 persistem no perfil/vínculo correto; card reaparece após reload; viewport mobile sem overflow horizontal.
- Login separado na empresa B confirma que o editor criado em A não aparece em GET /api/editores de B. Isto cobre isolamento da listagem deste registro, não toda a matriz de permissões.
- Fixture com e-mail único example.invalid e sem telefone/WhatsApp, sem envio de mensagem; editor e usuário temporários removidos no finally. Captura `/tmp/nuflow-team-filled-mobile.png` revisada.
- Sem mudança de código de produção nesta rodada. Detalhes individuais, edição/exclusão e demais papéis continuam pendentes. Não houve commit/publicação nem acesso a banco externo.

### 2026-09-29 — Perfil individual da equipe interna
- Aplicadas superfícies, tipografia e cabeçalho da família visual da equipe. Removido limite antigo de largura; ações do cabeçalho podem quebrar linha.
- Falha no carregamento do perfil agora oferece nova tentativa e retorno à equipe, em vez de carregamento infinito.
- Build aprovado (`/tmp/nuflow-team-detail-build.log`). `team-detail-local.cjs` aprovado com fixture temporária via formulário real: perfil abre em desktop/mobile, sem overflow horizontal, persistência e isolamento de listagem preservados. Fixture removida ao final. Primeiro teste encontrou seletor de título ambíguo; seletor ajustado, sem falha da aplicação.
- Capturas `/tmp/nuflow-team-detail-{desktop,mobile}.png`. Edição, avaliação e demais ações ainda não certificadas; a página ainda requer refinamento de conteúdo/organização. Sem commit/publicação.

### 2026-09-29 — Desempenho sem dados
- Componente compartilhado de desempenho deixa de classificar profissional sem demandas como abaixo da meta. Exibe estado sem dados. Sem conclusões, tempo médio e custo por vídeo não sugerem médias de zero.
- Falha de consulta ganhou aviso/retry; indicadores passam a duas colunas no celular. Cálculos e endpoints preservados.
- Build aprovado (`/tmp/nuflow-performance-empty-build.log`). `performance-empty-local.cjs` passou com fixture real temporária no PostgreSQL local e assegura mensagem sem demandas e ausência de “Abaixo da meta”. Captura mobile revisada. Fixture removida.
- Falha/retry e cenários com demandas não certificados nesta rodada; migração geral continua pendente. Sem commit/publicação.

### 2026-09-30 — Avaliação vazia no perfil interno
- Resumo do perfil agora distingue carregamento, falha e ausência de avaliações. Não apresenta a nota padrão de cinco estrelas quando a consulta retorna zero avaliações.
- Build aprovado (`/tmp/nuflow-rating-empty-build.log`). Teste local `rating-empty-local.cjs` cobre perfil temporário sem avaliações. A listagem ainda utiliza a nota armazenada e precisa de contagem de avaliações para aplicar a mesma distinção; não alterada nesta rodada.
- Sem commit/publicação; fixture temporária removida pelo teste.

### 2026-09-30 — Avaliações nos cards da equipe
- GET editores inclui contagem de avaliações filtrada explicitamente pela empresa atual ou avaliações públicas sem empresa; não retorna comentários adicionais. Card sem avaliações mostra estado textual, sem cinco estrelas padrão.
- Build aprovado (`/tmp/nuflow-team-rating-build.log`). `team-rating-empty-local.cjs` verifica estado vazio no card após cadastro/reload real local, com limpeza da fixture. Sem commit/publicação.
- Nota armazenada quando existem avaliações continua com semântica preexistente; revisão da média e cenário multiorganização com avaliações seguem pendentes.

### 2026-09-30 — Edição real do perfil interno
- `team-edit-real-local.cjs` aprovado: cadastro temporário pela UI, edição de cidade/UF com PUT real, leitura direta no PostgreSQL local e reload confirmam persistência. Nova alteração cancelada não é gravada.
- Mantidas verificações de cadastro/vínculo e ausência na listagem da empresa B. Fixture removida no finally; sem telefone e sem notificações externas.
- Nenhuma alteração em código de produção nesta rodada. Teste não certifica campos financeiros/fiscais, avaliação ou todos os papéis. Sem commit/publicação.

### 2026-09-30 — Edição mobile do perfil interno
- Campos de contato em uma coluna no celular; inputs do perfil com nomes acessíveis explícitos (nome, status, cidade/UF, contatos, capacidade e dados profissionais).
- Build aprovado (`/tmp/nuflow-team-edit-mobile-build.log`). `team-edit-real-local.cjs` agora realiza edição no viewport 390×844 e usa nomes acessíveis para cidade/UF; persistência, reload e cancelamento passaram. Sem overflow horizontal. Captura `/tmp/nuflow-team-edit-mobile.png` revisada; fixture removida.
- Demais ações e papéis seguem pendentes. Sem commit/publicação.

### 2026-09-30 — Cabeçalho do perfil mobile
- Corrigido extravasamento interno observado na captura anterior: nome flexível com largura mínima zero, avatar sem compressão, status em linha própria no celular e avaliações com quebra de linha.
- Build aprovado (`/tmp/nuflow-profile-header-build.log`). Teste `team-edit-real-local.cjs` ampliado para verificar limites geométricos dos controles Nome e Status a 390px; passou junto com persistência/cancelamento e limpeza da fixture. Captura mobile revisada.
- Sem commit/publicação; migração geral ainda em andamento.

### 2026-09-30 — Superfície da equipe externa
- `/videomakers` adota a família visual da equipe interna: Montserrat, superfícies, cabeçalho e espaçamento. Busca/limpeza com nomes acessíveis e filtros com estado anunciado.
- Carregamento e falha separados da listagem; erro oferece retry sem falsos indicadores vazios. APIs e ações existentes preservadas.
- Build aprovado (`/tmp/nuflow-external-team-build.log`). `external-team-layout-local.cjs` passou com API local, busca/limpeza, filtro e mobile sem overflow; captura mobile revisada. Nenhuma aprovação/cadastro/envio executado.
- Cards preenchidos, cadastro, detalhe e recuperação de erro desta área ainda precisam de validação. Sem commit/publicação.

### 2026-09-30 — Formulário da equipe externa
- Cadastro externo com superfície compartilhada do protótipo, dialog nativo nomeado, Escape/retorno de foco, campos em uma coluna no celular e labels associados.
- Build aprovado (`/tmp/nuflow-external-form-build.log`). `external-form-layout-local.cjs` valida abertura, preenchimento sem envio, limites mobile, Escape e foco restaurado. Captura `/tmp/nuflow-external-form-mobile.png` revisada.
- Persistência e aprovação não testadas nesta rodada; nenhuma mensagem enviada. Sem commit/publicação.

### 2026-09-30 — Persistência do cadastro externo
- Corrigido POST videomakers que ignorava habilidades e chavePix enviados pelo formulário. PIX segue pelo helper de cifra por empresa; não é gravado no perfil global.
- Build aprovado. `external-save-local.cjs` valida via API real local habilidades, diária no vínculo, PIX não armazenado em claro e ausente da listagem, card visível. Fixture e usuário removidos.
- Primeira execução falhou pois servidor local não tinha chave de cifra. Repetição usa EMAIL_ENCRYPTION_KEY efêmera somente no processo, não exibida/persistida. Não usar esse processo para dados duráveis cifrados; reinicialização perde a chave. Falha de cifra pode deixar cadastro parcial (pendência de atomicidade preexistente).
- Teste não é envio pelo formulário; aprovação/envio não acionados. Sem commit/publicação.
- Após o teste, processo com chave efêmera encerrado e servidor normal restaurado. Configuração local permanente de cifra continua pendente.

### 2026-09-30 — Envio real pelo formulário externo
- `external-create-ui-local.cjs` aprovado com formulário real e PostgreSQL local: nome/e-mail/cidade e diária enviados, POST 201, janela fecha, cidade e diária conferidas no perfil/vínculo, card visível ao retornar à listagem.
- Fixture sem telefone ou dados fiscais, e-mail único example.invalid; profissional e usuário removidos no finally. Sem notificações, aprovação, commit ou publicação.
- Nenhuma alteração de produção nesta rodada. Cadastro com PIX no servidor normal continua dependendo da configuração permanente de cifra; atomicidade em falhas permanece pendente.

### 2026-09-30 — Perfil externo: superfície inicial
- Perfil externo usa superfícies e tipografia da equipe; removido limite antigo de largura, contatos em uma coluna mobile, carregamento separado de erro com retry/retorno.
- Build aprovado (`/tmp/nuflow-external-detail-build.log`). `external-detail-local.cjs`: cadastro temporário via UI, abertura do perfil desktop/mobile e ausência de overflow horizontal; fixture removida. Capturas `/tmp/nuflow-external-detail-{desktop,mobile}.png`.
- Edição e demais ações ainda pendentes; teste não aciona aprovação/notificações. Sem commit/publicação.

### 2026-09-30 — Ações e avaliação no perfil externo
- Cabeçalho permite quebra das ações no celular. Resumo da avaliação distingue carregamento, falha e zero avaliações, sem estrelas padrão no vazio.
- Build aprovado (`/tmp/nuflow-external-header-build.log`). `external-detail-local.cjs` verifica geometria de Editar/QR/Voltar em 390px e mensagem sem avaliações. Seletor QR corrigido para incluir acento após primeira falha de teste. Fixture removida.
- Sem commit/publicação; ações não foram acionadas e avaliação com dados ainda pendente.

### 2026-09-30 — Edição externa com vínculo de cadastro
- Teste real encontrou PUT 404 para profissional recém-cadastrado: temVinculoComOrg considerava apenas demandas/custos, ignorando VideomakerOrganizacao. Incluído vínculo explícito, preservando histórico legado e exigência de gestor. Helper também é usado no DELETE; exclusão não certificada nesta rodada.
- Build aprovado (`/tmp/nuflow-external-edit-build.log`). `external-edit-local.cjs` passou: cidade/UF via UI persistem e reload confirma; cancelar não grava; empresa B sem vínculo recebe 404 ao tentar PUT e dados permanecem intactos. Fixture removida.
- Sem notificações, commit ou publicação. Campos fiscais e demais ações/perfis continuam pendentes.

### 2026-09-30 — Proteção na exclusão da rede externa
- DELETE agora retorna 409 quando há vínculo explícito, demanda ou custo de outra empresa, antes de excluir o perfil global. Evita remoção conhecida entre empresas; não constitui certificação completa de concorrência ou todas as relações legadas.
- Build aprovado (`/tmp/nuflow-external-delete-build.log`). `external-delete-shared-local.cjs` cria fixture local com vínculos A/B, confirma 409 e preservação de perfil/ambos vínculos; limpeza final apenas da fixture.
- Pendente revisar demais referências (coberturas/avaliações), concorrência e UX de desvinculação. Sem commit/publicação.

### 2026-09-30 — Mensagem de bloqueio de exclusão externa
- Lista externa exibe motivo retornado pela API e trata falhas de rede; botão de remoção tem nome acessível com o profissional.
- Build aprovado (`/tmp/nuflow-delete-message-build.log`). `external-delete-message-local.cjs` testa clique real, confirmação, resposta 409, mensagem explicativa e preservação dos vínculos A/B. Fixture removida; sem commit/publicação.

### 2026-09-30 — Edição mobile do perfil externo
- Nome e status adaptados ao espaço mobile; avatar não comprime e nome tem largura flexível. Campos da edição receberam nomes acessíveis.
- Build aprovado (`/tmp/nuflow-external-edit-mobile-build.log`). `external-edit-local.cjs` passa com geometria Nome/Status em 390px, seletores acessíveis, persistência/cancelamento e negativa da empresa B sem vínculo. Captura `/tmp/nuflow-external-edit-mobile.png` revisada. Fixture removida.
- Sem commit/publicação; campos fiscais e demais papéis permanecem pendentes.

### 2026-09-30 — Recuperação da equipe externa
- `external-recovery-local.cjs` verifica falha de rede simulada no navegador: aviso visível, indicadores/estado vazio ausentes, retry carregando API local real. Busca/filtros seguem utilizáveis e mobile não apresenta overflow horizontal.
- Nenhuma mutação de dados nem alteração no código de produção nesta rodada. Falha injetada apenas no browser, sem interromper PostgreSQL ou simular dados de sucesso. Sem commit/publicação.

### 2026-09-30 — Equipe Growth
- Equipe Growth alinhada às superfícies/Montserrat da família visual aprovada, título editorial e largura fluida. Contatos/badges podem quebrar linha no mobile. Consulta/API e membros existentes preservados.
- Carregamento e falha separados de vazio/contagem; retry disponível.
- Build aprovado (`/tmp/nuflow-growth-team-build.log`). `growth-team-layout-local.cjs` passou: erro injetado no browser não vira vazio, recuperação usa API local real, desktop/mobile sem overflow. Capturas revisadas. Sem mutação/commit/publicação.
- Cenário com membros preenchidos e matriz de papéis ainda pendentes nesta página.
- Correção do limite acima: captura contém três membros da base local, portanto houve revisão de lista preenchida. Nomes/e-mails longos ficam truncados no mobile e precisam de refinamento; matriz de papéis ainda pendente.

### 2026-09-30 — Legibilidade dos cards Growth mobile
- Cards em grade com área própria para identificação e badges na linha seguinte no celular. Nomes quebram linha e e-mails longos permanecem legíveis, sem truncamento.
- Build aprovado (`/tmp/nuflow-growth-cards-build.log`). `growth-team-layout-local.cjs` ampliado para conferir largura de nomes/e-mails retornados pela API local; aprovado, captura mobile revisada. Sem alterações de dados, commit ou publicação.

### 2026-09-30 — Isolamento da listagem Growth
- `growth-team-isolation-local.cjs` aprovado com sessões separadas dos administradores locais A/B. IDs retornados pela API correspondem exatamente aos vínculos internos Growth ativos de cada empresa; os nomes retornados aparecem na interface.
- Verificação somente de leitura, contra PostgreSQL local e servidor 127.0.0.1:3108, com rede externa bloqueada no navegador. Nenhuma mutação, commit ou publicação.
- Escopo limitado à listagem por empresa; não certifica todos os papéis, ações ou RLS com papel restrito. A migração geral permanece em andamento.

### 2026-09-30 — Avaliação vazia na rede externa
- Listagem inclui contagem de avaliações e apresenta “Sem avaliações registradas” quando não há registros, em vez da nota padrão do perfil. Contagem global segue o contrato já existente do resumo de avaliações da rede; comentários privados não foram adicionados à resposta.
- Build aprovado (`/tmp/nuflow-external-rating-build.log`). `external-rating-empty-local.cjs` valida cadastro via UI, persistência local, contagem zero, ausência de estrelas preenchidas no card criado e mobile sem overflow. Fixture removida; captura `/tmp/nuflow-external-rating-empty-mobile.png`.
- Notas com avaliações mantêm cálculo existente; revisão ampla de métricas permanece pendente. Sem commit, publicação ou envio de mensagens.

### 2026-09-30 — Linhas / Projetos
- Página passa a usar a superfície compartilhada da migração, largura fluida, Montserrat e campos com labels associados. Ações por ícone recebem nomes acessíveis; linhas permitem quebra no mobile.
- Carregamento e falha separados da lista vazia, com retry. Não alteradas APIs nem permissões.
- Build aprovado (`/tmp/nuflow-linhas-build.log`). `linhas-layout-local.cjs` verifica falha de rede apenas no browser, ausência de falso vazio, recuperação via API local e desktop/mobile sem overflow horizontal. Capturas `/tmp/nuflow-linhas-{1440,390}.png` revisadas; base local sem linhas nesta execução.
- Pendente teste de lista preenchida e operações de edição/ativação/exclusão. Captura mobile mostra repetição do shell no limite inferior, também observada na página anterior: investigar layout global; ausência de overflow horizontal não certifica esse comportamento. Sem commit/publicação/mutação de dados.

### 2026-09-30 — Investigação da captura mobile do shell
- A repetição registrada na rodada anterior não foi reproduzida após aguardar dois requestAnimationFrame depois do resize do Playwright. DOM possui um único botão de navegação visível e um único título; captura estabilizada mostra cabeçalho único e dock inferior corretamente separado.
- `linhas-layout-local.cjs` agora aguarda repaint e verifica unicidade no mobile. Teste aprovado; captura `/tmp/nuflow-shell-390.png` revisada. Evidência aponta artefato transitório de captura/redimensionamento, não duplicação de componentes; nenhuma alteração de produção foi necessária.
- Nenhuma mutação, commit ou publicação. Operações de Linhas / Projetos e demais pendências da migração continuam abertas.

### 2026-09-30 — Ações reais de Linhas / Projetos
- `linhas-actions-local.cjs` aprovado: criação pelo formulário, edição com persistência após reload, desativação e exclusão de linha temporária sem demandas. PostgreSQL local confirma cada alteração; fixture removida no finally.
- Administrador B não recebe a linha de A na lista e tentativas PATCH/DELETE retornam 404. Escopo de dois administradores locais, não matriz completa de papéis ou RLS restrito.
- Lista preenchida mobile sem overflow horizontal; captura `/tmp/nuflow-linhas-filled-mobile.png` revisada. Pendente caminho de desativação por exclusão com demandas vinculadas, reativação e tratamento de falhas durante edição.
- Nenhuma alteração de produção nesta rodada, sem commit/publicação ou integração externa.

### 2026-09-30 — Preservação do rascunho de Linhas / Projetos
- PATCH da interface trata falha de rede e resposta de erro. Edição só fecha após sucesso; texto digitado permanece disponível para nova tentativa. APIs/permissões preservadas.
- Build aprovado (`/tmp/nuflow-linhas-recovery-build.log`). `linhas-save-recovery-local.cjs` aborta PATCH apenas no navegador, confirma aviso, rascunho preservado e banco intacto; libera rede, salva e confirma após reload. Revalida desativação/remoção e negativas da empresa B. Fixture temporária removida.
- Escopo não inclui perda da resposta após gravação, concorrência ou falhas de exclusão. Sem commit/publicação ou mensagens externas.

### 2026-09-30 — Recuperação de remoção em Linhas / Projetos
- Remoção trata falhas de rede e apresenta o erro da API quando disponível; sucesso mantém distinção entre remoção sem vínculos e desativação com demandas. Nenhuma mudança no contrato ou permissões da API.
- Build aprovado (`/tmp/nuflow-linhas-delete-build.log`). `linhas-delete-recovery-local.cjs` bloqueia DELETE somente no browser, confirma aviso e preservação da fixture no PostgreSQL/interface, depois libera e confirma remoção. Revalida negativa de outra empresa e fluxo básico. Fixture removida no finally.
- Caminho com demandas vinculadas e concorrência ainda pendentes. Sem commit/publicação ou serviços externos.

### 2026-10-01 — Linha com demanda vinculada
- `linhas-linked-local.cjs` aprovado: linha e demanda temporárias no PostgreSQL local; reativação via UI seguida de remoção retorna hardDelete=false, quantidade vinculada 1 e aviso de desativação.
- Banco confirma linha inativa e demanda ainda vinculada; reload mantém a linha disponível para reativar. Negativas da empresa B continuam passando. Demanda temporária e linha removidas no finally, sem tocar em registros existentes.
- Nenhuma alteração no código de produção nesta rodada. Concorrência e matriz completa de papéis continuam fora deste teste. Sem commit, publicação ou serviços externos.

### 2026-10-01 — Histórico: superfície e recuperação
- Histórico usa superfície compartilhada da migração, Montserrat e título editorial; cabeçalho permite quebra no celular e tabela tem rolagem própria se necessário. Busca/filtros têm nomes acessíveis e botão expõe expansão.
- Falhas não aparecem mais como zero conclusões ou lista vazia. Retry explícito; conteúdo/paginação ocultos durante erro/carregamento para evitar resultados anteriores sob filtros novos.
- Build aprovado (`/tmp/nuflow-history-build.log`). `history-layout-local.cjs` verifica falha no browser, recuperação via API local, filtros acessíveis e desktop/mobile sem overflow. Capturas `/tmp/nuflow-history-{1440,390}.png` revisadas; base local sem conclusões no teste.
- Pendente lista preenchida, filtros reais, paginação e isolamento específico desta tela. APIs/permissões preservadas. Sem mutação de dados, commit ou publicação.

### 2026-10-01 — Histórico preenchido e paginação
- Teste real identificou painel flutuante de foco cobrindo a paginação no desktop. Histórico agora reserva 100px inferiores para tornar controles acessíveis.
- Build aprovado (`/tmp/nuflow-history-pagination-build.log`). `history-filled-local.cjs` passou após correção: 51 conclusões temporárias de A distribuídas em 50+1, busca real, registro de B ausente, abertura do detalhe e mobile sem overflow horizontal. Captura `/tmp/nuflow-history-filled-mobile.png` revisada.
- Primeira execução teve rejeição de Promise sem tratamento e deixou 52 fixtures; cleanup restrito ao prefixo QA-HISTORY e descrição exata removeu essas fixtures. Espera/click agora usa Promise.all e finally remove registros das execuções seguintes.
- Filtros de datas/tipo, ordenação estável e matriz completa de papéis continuam pendentes. Sem commit/publicação ou acesso externo.

### 2026-10-01 — Legibilidade do Histórico mobile
- No celular, código e data aparecem abaixo do título, liberando a largura da linha para identificar a entrega. Títulos permitem quebra e não usam truncamento em uma linha; desktop mantém colunas próprias.
- Build aprovado (`/tmp/nuflow-history-mobile-build.log`). `history-filled-local.cjs` ampliado verifica título sem line-clamp/overflow e repete busca, paginação, exclusão do registro B e abertura do detalhe. Captura mobile revisada; fixtures removidas.
- Sem commit/publicação. Filtros por tipo/data e ordenação estável permanecem pendentes.

### 2026-10-01 — Desempate da paginação de demandas
- API de demandas mantém prioridade/data de criação como critérios principais e acrescenta ID descendente como desempate único. Evita ordenação indefinida quando os critérios anteriores coincidem; aplica-se também ao Histórico, sem mudar filtros/permissões.
- Build aprovado (`/tmp/nuflow-history-order-build.log`). `history-filled-local.cjs` agora cria 51 registros de mesma data/prioridade e verifica a sequência exata dos IDs nas duas páginas, sem repetição/omissão. Busca, isolamento A/B, mobile e abertura do detalhe continuam passando; fixtures removidas.
- Paginação por offset ainda pode mudar sob inserções concorrentes; este teste valida base estática, não snapshot transacional. Sem commit/publicação.

### 2026-10-01 — Filtros reais do Histórico
- `history-filters-local.cjs` aprovado com quatro demandas temporárias: data inicial restringe resultados, faixa sem entregas mostra vazio, limpeza restaura três resultados mantendo a busca e filtro de tipo retorna somente os dois registros esperados. Registro da empresa B permanece excluído; mobile sem overflow horizontal.
- Primeiro teste esperava nova resposta após limpar, mas SWR recupera a chave em cache. Teste corrigido para verificar estado visível/campos nessa etapa; nenhuma alteração de produção necessária. Fixtures removidas pelo finally em ambas execuções.
- Datas testadas ao meio-dia UTC. Limites de dia/fuso e datas inválidas ainda pendentes: API combina new Date(YYYY-MM-DD) com setHours local, o que exige revisão específica. Sem commit/publicação.

### 2026-10-01 — Datas do Histórico no fuso da operação
- Filtro agora usa início inclusivo e início do dia seguinte exclusivo em America/Sao_Paulo, sem depender do fuso do servidor. Datas inexistentes e períodos invertidos retornam 400. Data exibida na tabela usa o mesmo fuso.
- Helper específico preserva semântica dos prazos só-data existentes. Busca do primeiro instante local contempla variação histórica de offset; transições históricas ainda não foram testadas nesta rodada.
- Build aprovado (`/tmp/nuflow-history-dates-build.log`). `history-day-boundaries-local.cjs` confirmou inclusão de 00:00 e 23:59:59.999 locais, exclusão dos instantes vizinhos e rejeição de datas inválidas/invertidas. Quatro fixtures removidas pelo finally.
- Sem commit/publicação. Mensagem específica de validação no formulário e testes de horário de verão histórico permanecem pendentes.

### 2026-10-01 — Orientação de período invertido no Histórico
- Interface explica que a data final deve ser igual ou posterior à inicial, associa a mensagem aos campos com aria-invalid/aria-describedby e suspende consulta para intervalo invertido. Não mostra lista antiga ou falso vazio nesse estado; limpar restaura consulta.
- Build aprovado (`/tmp/nuflow-history-period-build.log`). `history-period-validation-local.cjs` aprovado: valida mensagem, estado acessível dos campos, ausência de falso vazio e recuperação pela limpeza, além de desktop/mobile sem overflow. Sem mutações de dados.
- Validação de datas inexistentes continua na API. Sem commit/publicação.

### 2026-10-01 — Banco de Ideias: primeira migração
- Superfície compartilhada, largura fluida, título editorial, cabeçalho/filtros com quebra mobile, busca/ordenação nomeadas e chips com aria-pressed. Lista distingue carregamento, falha com retry e vazio.
- Debounce passa a useEffect com cancelamento, evitando timers recriados a cada render.
- Build aprovado (`/tmp/nuflow-ideas-build.log`). Validação browser NÃO concluída: admin-a é redirecionado de /ideias para /dashboard antes de acessar a página. `ideas-layout-local.cjs` falha aguardando alerta; screenshot de diagnóstico `/tmp/ideas-debug.png`. Não alteradas permissões/módulos para contornar o redirecionamento.
- Próximo passo: identificar configuração/permissão local necessária e testar com fixture autorizada, restaurando estado. Modais, ações, KPI e lista preenchida permanecem pendentes. Sem commit/publicação ou acionamento de IA/integrações.

### 2026-10-01 — Diagnóstico do módulo Ideias
- Causa confirmada em src/lib/modulos.ts: DISPONIVEL_NA_PLATAFORMA.ideias=false e PADRAO_MODULOS.ideias=false. É desligamento global deliberado do piloto, não falha de autenticação nem vínculo da empresa de teste. Ativar apenas ModuloOrganizacao não resolve a indisponibilidade global.
- `ideas-disabled-local.cjs` aprovado: sessão admin-a acessa /ideias e retorna ao dashboard; /api/ideias responde 403. Nenhuma configuração/permissão foi alterada.
- Ajustes visuais anteriores compilam, mas não estão validados em uso; manter essa distinção. Não repetir ideas-layout-local.cjs na configuração atual. Próximas rodadas devem priorizar páginas habilitadas; validação de Ideias exige uma configuração de teste isolada explicitamente delimitada, sem liberar módulo na plataforma por consequência da migração.
- Sem commit/publicação, mutações ou integrações externas.

### 2026-10-01 — Galeria Growth: superfície e estados
- Superfície compartilhada/Montserrat, título editorial e largura fluida; busca nomeada e títulos dos cards permitem quebra. Busca sem resultado tem texto distinto de galeria vazia.
- Falha da API não apresenta contagem zero nem falso vazio: aviso/retry e carregamento identificado. API e permissões preservadas.
- Build aprovado (`/tmp/nuflow-gallery-build.log`). `gallery-layout-local.cjs` aprovado: falha injetada no browser, recuperação com API local, desktop/mobile sem overflow. Capturas `/tmp/nuflow-gallery-{1440,390}.png` revisadas; lista vazia na base local.
- Pendente lista preenchida, visualizador acessível e isolamento específico da galeria. Sem mutações, commit ou publicação.

### 2026-10-01 — Visualizador da Galeria Growth
- Overlay substituído por dialog nativo com nome do criativo, fechamento explícito/Esc e retorno do foco ao card; iframe PDF recebe título. Visual em superfície escura com borda e dimensões limitadas à viewport.
- Build aprovado (`/tmp/nuflow-gallery-dialog-build.log`). `gallery-dialog-local.cjs` cria demanda design finalizada temporária com imagem local, testa abertura por Enter, estado modal, limites desktop/mobile, Esc e foco restaurado. Captura mobile revisada; fixture removida.
- Sem acesso a mídia externa. PDF, links de outros formatos, isolamento específico e paginação seguem pendentes. Sem commit/publicação.

### 2026-10-01 — Isolamento e elegibilidade da Galeria Growth
- `gallery-isolation-local.cjs` aprovado com seis fixtures: sessões A/B recebem somente seus criativos design; audiovisual, status entrada e ausência de link final ficam fora. Status finalizado e para_postar com link aparecem.
- Busca na interface apresenta os títulos retornados pela API e estado específico quando não encontra resultado. Nenhuma integração/mídia externa acessada; seis fixtures removidas pelo finally.
- Verificação cobre dois administradores e linkFinal legado; múltiplos arquivos por demanda, paginação e papéis restritos ainda pendentes. Nenhuma alteração de produção, commit ou publicação nesta rodada.

### 2026-10-01 — Paginação da Galeria Growth
- Galeria consulta páginas de 48 demandas e oferece Anterior/Próxima com limites; busca reinicia na primeira página. Navegação fica acima do dock de foco e não aparece em erro/carregamento ou página única.
- Build aprovado (`/tmp/nuflow-gallery-pages-build.log`). `gallery-pages-local.cjs` aprovado com 49 demandas temporárias: primeira página com 48, segunda com uma e nova busca retornando à primeira. Mobile sem overflow; captura `/tmp/nuflow-gallery-page-mobile.png` revisada. Fixtures removidas pelo finally.
- Contagem da API representa demandas, enquanto múltiplos arquivos podem gerar mais cards: semântica dessa contagem, ordenação estável, parâmetros inválidos de paginação, PDF/outros formatos e papéis restritos permanecem pendentes. Teste usa um arquivo local por demanda.
- Servidor local atualizado em 127.0.0.1:3108. Sem acesso a banco/mídia externos, commit ou publicação. Migração completa ainda não concluída.

### 2026-10-01 — Contagem de demandas e arquivos na Galeria Growth
- Cabeçalho diferencia total de demandas com entregas disponíveis e quantidade de arquivos na página atual, com singular/plural. Evita tratar total de demandas da API como total de criativos; paginação e elegibilidade existentes preservadas.
- Build aprovado (`/tmp/nuflow-gallery-count-build.log`). `gallery-dialog-local.cjs` ampliado e aprovado com uma demanda e dois arquivos finais locais: contagem 1/2, dois cards, abertura por teclado, modal, Esc e retorno do foco em desktop/mobile. Fixture e arquivos removidos pelo finally.
- Servidor reconstruído em 127.0.0.1:3108. Sem commit/publicação ou acesso externo. Ordenação estável, parâmetros de paginação inválidos, PDF/outros formatos e papéis restritos continuam pendentes; migração completa ainda em andamento.

### 2026-10-01 — Bloco de acesso, estados de sistema e convites
- Criada superfície SystemState compartilhada no padrão escuro/lilás/Montserrat para 404, erro de acesso, erro do painel, erro global e estados do convite. Botões responsivos, foco visível e código de suporte opcional; não exibe mensagens técnicas internas.
- Error boundaries usam retry da versão Next 16.3, que refaz a consulta/renderização. Removida promessa genérica de que um rascunho foi salvo; isso não era garantido pela boundary. Global mantém html/body próprios.
- Convite de videomaker redesenhado integralmente: briefing, dados, pagamento existente, prazo em Brasília, ações e estados terminais. GET cancelável e recuperável; falha no POST preserva detalhes e oferece consulta do estado antes de nova tentativa. Textos não afirmam entrega de WhatsApp. API/permissões e condições de pagamento preservadas.
- Build aprovado (`/tmp/nuflow-access-block-build.log`). `public-access-block-local.cjs` aprovado: login, recuperação, token inválido, leads, recrutamento e formulário sem empresa em desktop/mobile sem overflow; convite temporário real via GET, dois tamanhos, falha POST injetada sem envio, estado pendente preservado, consulta novamente, aceito/recusado/expirado via fixtures, token inválido e 404. Capturas `/tmp/nuflow-access-invite-{1440,390}.png` e `/tmp/nuflow-access-404-mobile.png` revisadas. Fixtures removidas.
- `auth-local.cjs` aprovado: login inválido, visibilidade de senha, recuperação sem SMTP, token inválido/usado, divergência de confirmação, senha nova persistida e login com senha nova. Usuário/token temporários removidos.
- Limites: error boundaries compiladas, mas erro real do layout e retry não foram injetados nesta rodada. Nenhum POST real de convite foi executado para evitar notificações; estados terminais testados com fixtures. Formulários de captura tiveram smoke de renderização, não repetição integral de envios. SMTP/WhatsApp, cadastro autônomo de empresa e branding por cliente seguem pendentes; /comecar continua captação de interesse, não abertura de conta. Não declarar o bloco inteiro ou toda migração 100% concluídos.
- Servidor local atualizado em 127.0.0.1:3108. Sem commit, push, publicação ou banco externo.

### 2026-10-01 — Etapas do recrutamento de videomakers
- Avanço valida os campos da etapa com reportValidity: documento, nome, e-mail, telefone, cidade e estado; espaços vazios são rejeitados. Representante identificado como opcional, conforme API existente. Mudança de etapa transfere foco ao título, áreas usam aria-pressed e os valores permanecem ao voltar.
- Build aprovado (`/tmp/nuflow-recruit-steps-build.log`). `recruitment-steps-local.cjs` aprovado em 1440/390: documento vazio impede avanço, e-mail inválido e estado vazio impedem etapa seguinte, foco acompanha título, voltar preserva e-mail e não há overflow. Captura mobile revisada.
- Nenhum POST, dado gravado ou notificação nesta rodada. Teste cobre navegação/validação no navegador, não persistência final, validação fiscal de documento ou cifragem. Servidor local atualizado; sem commit/publicação. Pendências gerais mantidas.

### 2026-10-02 — Recrutamento: formulário até revisão e aprovação local
- Cadastro público resolve empresa antes de consultas fiscais, escopa duplicidade fiscal por organização, normaliza e-mail e aceita JSON inválido como erro de validação. Cifra ocorre antes de escrita; perfil, vínculo pendente, fiscal e alerta são gravados numa transação. Falha devolve mensagem recuperável sem cadastro parcial.
- Aprovação exige vínculo explícito com a organização da sessão e pendência desse vínculo; ativa perfil e vínculo juntos. Resolução de alertas limitada à mensagem do profissional, evitando resolver todos os cadastros pendentes da empresa. Resposta distingue credenciais enviadas de envio não confirmado.
- Banner de revisão empilha texto/botão no mobile e descreve tentativa de WhatsApp sem garantir entrega. API pública mantém fallback legado de empresa quando org está ausente; isso não foi alterado nesta rodada.
- Build final aprovado (`/tmp/nuflow-recruit-flow-build.log`). `recruitment-flow-local.cjs` aprovado: envio pela UI com falha de rede e retry; persistência real, vínculo/fiscal A, duplicidade 409, org inexistente 503, PIX sem chave 503 sem perfil parcial, fiscal/diária ausentes na sessão B, aprovação B 404, aprovação A com usuário previamente vinculado, vínculo ativo e repetição 400. Conta já existente evita qualquer envio de credenciais. Fixtures e alertas removidos pelo finally.
- Duas tentativas iniciais corrigiram somente fixture sem senhaHash e seletor ambíguo do título; cleanup executado. Última execução confirma correção visual mobile, screenshot desktop e ausência de overflow. Capturas /tmp/nuflow-recruit-success-mobile.png e /tmp/nuflow-recruit-review-{mobile,desktop}.png.
- Limites: chave permanente de cifra não configurada; teste valida falha íntegra, não sucesso de PIX. Aprovação com criação nova de conta/WhatsApp não executada; esse caminho ainda pode precisar de atomicidade entre criação de usuário e ativação. Duplicidade concorrente e RLS com papel restrito não validados. Alertas ainda identificados por nome/mensagem (homônimos precisam de referência estável). Migração geral não concluída. Sem commit, push, publicação ou banco externo.

### 2026-10-02 — Recuperação de falhas da aprovação na interface
- Botão de aprovação mostra processamento, fica desabilitado durante a requisição e impede novo acionamento nesse período. Erros da API permanecem visíveis; falha de rede mantém o perfil e oferece atualização antes de repetir, sem presumir se o servidor recebeu a ação.
- Build aprovado (`/tmp/nuflow-recruit-approval-build.log`). `recruitment-flow-local.cjs` ampliado e aprovado: POST de aprovação abortado no browser, mensagem visível, botão reabilitado, registro ainda pendente e atualização remove aviso. Demais verificações locais de persistência/isolamento do mesmo fluxo passaram. Fixtures removidas; nenhum envio de credenciais.
- Duplicação concorrente entre sessões e atomicidade da criação de nova conta na aprovação permanecem pendentes. Sem commit/publicação; servidor local atualizado.

### 2026-10-02 — Paginação determinística da Galeria Growth
- API rejeita página/limite inválidos (400), incluindo texto, frações, valores não positivos e offset além de int32. Limite aceito entre 1 e 48. Datas iguais desempatadas por ID de demanda; arquivos de sequência igual desempatados por ID.
- Build aprovado (`/tmp/nuflow-gallery-order-build.log`). `gallery-pages-local.cjs` aprovado com 49 demandas de datas iguais: 48+1 na ordem exata esperada, sem repetição, busca volta à primeira página e mobile sem overflow. Nove entradas de paginação inválidas retornaram 400. Fixtures removidas.
- Ordenação estável em base estática; paginação por offset ainda pode variar com alterações concorrentes. PDF/outros formatos e papéis restritos continuam pendentes. Sem commit/publicação; servidor local atualizado.

### 2026-10-02 — Alternativa ao preview PDF da Galeria Growth
- Visualizador PDF oferece link para nova aba acima do iframe e limita sua altura a 65vh. Usuário não fica dependente da prévia embutida; demais formatos mantêm Abrir arquivo.
- Build aprovado (`/tmp/nuflow-gallery-formats-build.log`). `gallery-formats-local.cjs` aprovado desktop/mobile com duas referências locais temporárias: PDF com extensão maiúscula e query reconhecido, iframe nomeado, prévia abortada mantém link correto, arquivo ZIP mantém link correto, modal/teclado/Esc/restauração de foco e limites de viewport aprovados. Fixtures removidas.
- Teste deliberadamente NÃO valida renderização de um documento PDF nem download ZIP: verifica fallback/URL e interação com mídia indisponível; nenhuma mídia externa acessada. Renderização real de PDF e matriz de papéis ainda pendentes. Sem commit/publicação, servidor local atualizado.

### 2026-10-02 — Galeria com papel solicitante
- `gallery-requester-local.cjs` aprovado com sessões reais solicitante-a e solicitante-b: cada sessão recebe somente entregas elegíveis da sua empresa, busca/lista e vazio funcionam na UI; pedido anônimo à API retorna 401.
- Seis demandas temporárias cobrem design finalizado/para_postar, audiovisual, entrada, link ausente e empresa distinta; removidas pelo finally. Nenhuma alteração de permissão foi necessária.
- Evidência de isolamento na camada de aplicação para administradores (rodada anterior) e solicitantes. Não representa validação de todos os papéis, restrições de área nem RLS com credencial PostgreSQL restrita. Sem mudança de produção, novo build, commit ou publicação nesta rodada.

### 2026-10-02 — Histórico nos limites do horário de verão
- `history-dst-local.cjs inicio` e `fim` aprovados contra API e PostgreSQL locais. Datas 2018-11-04 (23 horas) e 2019-02-16 (25 horas) em America/Sao_Paulo: primeiro e último instante do dia incluídos, instantes imediatamente fora excluídos. Teste inclui rejeição de datas inválidas/invertidas.
- Quatro fixtures por execução, todas removidas pelo finally. Confirma funcionamento do helper existente para as duas transições históricas; nenhuma alteração de código de produção ou necessidade de rebuild. Não equivale a validar todos os fusos/transições.
- Sem commit/publicação; pendência específica de horário de verão do Histórico encerrada para esses cenários.

### 2026-10-02 — Configurações: falhas em Parâmetros
- Edição, ativação e remoção verificam status HTTP antes de indicar sucesso. Falha de edição preserva o campo e seu valor. Lista distingue erro/carregamento/vazio e oferece retry; botões editar/remover e campo de edição recebem nomes acessíveis.
- Build final aprovado (`/tmp/nuflow-parameters-errors-build.log`), após corrigir uso do helper erroDaResposta, que já devolve Error. `parameters-errors-local.cjs` aprovado: parâmetro temporário via API local, PATCH 403 injetado no browser, aviso real, edição mantida, retry bem-sucedido e valor persistido. Remoção da fixture confirmada no finally.
- Sem acionamento de WhatsApp, e-mail, Drive ou rotinas de manutenção. Teste cobre edição; ativação/remoção com falha, recuperação da lista e revisão visual mobile específica ainda pendentes. Sem commit/publicação; servidor local atualizado.

### 2026-10-02 — Parâmetros: lista e ações recusadas
- `parameters-errors-local.cjs` ampliado e aprovado: PATCH de ativação e DELETE recusados (403 injetado) mantêm registro/estado na API local; falha GET mostra aviso sem falso vazio e retry recupera lista. Mantida verificação de rascunho/edição persistida.
- Captura mobile `/tmp/nuflow-parameters-mobile.png` revisada e largura sem overflow. Ícones de ação ainda pequenos para toque; ampliar alvos em rodada visual futura. Nenhum acionamento de integrações/rotinas de manutenção.
- Parâmetro temporário removido via API no finally. Sem alteração de produção, build adicional, commit ou publicação nesta rodada.

### 2026-10-02 — Parâmetros no celular: ações e legibilidade
- Ações com alvos mínimos de 44×44, foco visível e nome acessível para cancelar edição. Mobile separa nome/código e posiciona ações abaixo; input de edição mantém largura disponível e fonte 16px.
- Build aprovado (`/tmp/nuflow-parameters-touch-build.log`). `parameters-errors-local.cjs` aprovado após mudança, incluindo medição dos alvos mínimos e ausência de overflow mobile; edição, recusas e recuperação da lista continuam passando. Captura mobile revisada, fixture removida.
- Sem alteração de API/permissão, commit ou publicação. Servidor local atualizado.

### 2026-10-02 — Reativação de parâmetros
- Gestão solicita incluirInativos=1, restrito a admin/gestor na API. Permite reativar pela própria lista; demais consultas mantêm somente ativos. Filtro de organização preservado.
- Build aprovado (`/tmp/nuflow-parameters-reactivate-build.log`). `parameters-reactivate-local.cjs` aprovado: desativar pela UI mantém item com ação Ativar, consulta padrão exclui, consulta de gestão inclui, reativar retorna item à consulta padrão; solicitante recebe 403 ao pedir inativos. Fixture removida no finally.
- Sem alteração de permissões existentes de escrita ou acesso a integrações. Sem commit/publicação; servidor local atualizado.

### 2026-10-02 — Permissão de alteração dos parâmetros
- PATCH agora exige admin/gestor, alinhado à criação e à tela de configuração. Antes verificava sessão/empresa, mas permitia alteração direta por solicitante. DELETE continua exclusivo de admin; isolamento por organização preservado.
- Build aprovado (`/tmp/nuflow-parameters-permissions-build.log`). `parameters-permissions-local.cjs` aprovado: solicitante da empresa A recebe 403 em PATCH/DELETE; admin B recebe 404 para parâmetro A e não o vê na consulta incluindo inativos; admin A altera seu próprio registro. Parâmetro temporário removido no finally.
- Verificação na camada de aplicação; RLS com credencial restrita e sessão de gestor ainda não exercitados neste teste. Sem commit/publicação, integrações ou banco externo. Servidor local atualizado.

### 2026-10-02 — Sessão real de gestor nos parâmetros
- `scripts/qa/parameters-manager-local.cjs` aprovado contra 127.0.0.1:3108 e PostgreSQL local: conta temporária autenticada como gestor cria, edita, desativa e reativa parâmetro; consulta incluindo inativos acompanha o estado persistido. DELETE recebe 403 e mantém o registro.
- Usuário, vínculo e parâmetro temporários removidos no finally. Teste restringe destino do banco a 127.0.0.1:55437/nuflow_local e navegação ao servidor local.
- Fecha a pendência de sessão de gestor na API. Não comprova RLS com credencial restrita nem apresentação de ações conforme papel na UI. Sem alteração de código de produção, rebuild, commit, publicação ou acesso externo.

### 2026-10-02 — Ações de parâmetros conforme perfil
- A lista agora exibe Remover somente para admin, com guarda adicional no handler. Gestor mantém edição e ativação; a autorização da API permanece independente da interface.
- Build aprovado em /tmp/nuflow-parameters-role-ui-build.log. Teste parameters-manager-local aprovado com sessão real: Editar aparece, Remover não aparece, operações autorizadas persistem e DELETE direto recebe 403. parameters-errors-local aprovado confirma ações de admin, preservação de rascunho/registro nas recusas, recuperação da lista e mobile sem overflow.
- Fixtures removidas pelos testes. Servidor 127.0.0.1:3108 atualizado; sem commit, publicação ou banco externo. Migração geral e validação de RLS restrita continuam pendentes.

### 2026-10-02 — Acesso ao menu da conta
- Header recebe nome acessível Abrir menu da conta, foco visível violeta e alvo mínimo de 44px. Ações e permissões existentes preservadas.
- Build aprovado em /tmp/nuflow-account-menu-build.log. account-menu-local.cjs aprovado com login real em 1440/390px: Enter abre, Escape fecha e restaura foco após fechamento assíncrono, alvo mínimo verificado.
- Servidor e PostgreSQL estavam desligados. Cluster local reiniciado; primeira inicialização assumiu 5432 e foi corrigida para 127.0.0.1:55437. Testes iniciais falharam no login por indisponibilidade; teste final passou. Nenhum dado de negócio alterado.
- Servidor disponível em 127.0.0.1:3108. Sem commit, publicação ou acesso externo. Migração geral ainda incompleta.

### 2026-10-02 — Seletor de empresas acessível
- Nome acessível inclui empresa atual; foco violeta, alvo mínimo 44px, nome mais compacto em mobile, indicação textual da empresa atual e itens bloqueados durante troca. Endpoint e recarga completa preservados.
- Build /tmp/nuflow-org-selector-build.log aprovado. org-selector-accessibility-local.cjs aprovado em 1440/390px: login real, resposta GET sintética com duas empresas, abertura por Enter e restauração de foco com Escape, alvo mínimo. Não valida troca real, autorização entre empresas ou RLS; nenhum POST de troca executado.
- Primeira tentativa de execução expirou na revisão automática; repetição autorizada. Servidor local atualizado. Sem commit/publicação ou acesso externo.

### 2026-10-02 — Papel da sessão acompanha empresa ativa
- Callback Node da sessão agora consulta vínculos ativos, escolhe empresa do cookie validada por membership e deriva tipo/papel/organizacaoId do vínculo. Antes tipo permanecia no JWT do login. Sem vínculo ativo, papel privilegiado não é mantido. Configuração edge continua sem Prisma.
- Build aprovado /tmp/nuflow-org-role-build.log após ajuste de tipagem Session. org-switch-real-local.cjs passou: usuário temporário gestor A/solicitante B troca pela UI A→B→A; consulta de gestão via fetch do navegador responde 403 em B e 200 em A, empresa ativa B confirmada. Usuário/vínculos removidos no finally.
- Limitação do primeiro teste: APIRequestContext não acompanhou cookie Secure em loopback como o navegador e devolveu 200, inclusive após correção. Teste final usa fetch da página; a falha inicial isoladamente não prova exploração via navegador na versão anterior. Código anterior mantinha token.tipo, corrigido independentemente dessa limitação do harness.
- Regressão parameters-permissions-local passou: solicitante 403, admin de outra empresa 404, alteração própria permitida. Ainda pendentes matriz completa de papéis, superadmin sem vínculo, revogação durante sessão e RLS restrita. Nenhum commit/publicação/banco externo. Servidor local atualizado.

### 2026-10-02 — Revogação de vínculo durante sessão aberta
- org-revocation-local.cjs aprovado com conta temporária e requisições reais do navegador, PostgreSQL local. Após troca A→B→A, remoção do vínculo A resolve empresa B restante e consulta de gestão retorna 403; tentativa POST de selecionar A retorna 404. Remoção de todos os vínculos retorna lista vazia/empresa ativa null e recusa consulta de parâmetros.
- Usuário e vínculos temporários limpos no finally. Nenhuma alteração no código de produção ou rebuild necessário. Fecha revogação para estes endpoints; não comprova todas as rotas nem RLS com credencial restrita. Superadmin sem vínculo e matriz completa de papéis continuam pendentes.
- Sem commit/publicação/banco externo.

### 2026-10-02 — Gravação pública com resposta perdida
- job-form-response-loss-local.cjs passou: requisição gravada de verdade no PostgreSQL local, resposta abortada no navegador, campos preservados, reenvio mantém envioId, confirmação retorna e banco contém um único Job/um histórico. Cinco campos e fuso conferidos; Job em B e GET 404 em A.
- Primeiro teste aguardava anunciador vazio do Next em vez do erro do formulário; corrigido para mensagem específica. Repetições atingiram 429; servidor local reiniciado e cenário isolado aprovado. Sem alteração em código de produção. Teste inclui cleanup da fixture no finally.
- Captura mobile imediata após resize apresentou artefato de composição; adicionada espera de dois frames para futuras capturas, ainda sem nova inspeção visual dessa captura. Verificação de largura passou. Teste não cobre concorrência de envios nem persistência após fechar/reabrir a página.
- Sem commit/publicação/banco externo. Servidor local disponível em 127.0.0.1:3108.

### 2026-10-02 — Captura visual estável do agendamento
- Revisão visual concluída em 1440×900 e 390×900 após document.fonts.ready e dois frames. Capturas /tmp/nuflow-form-review-1440.png e /tmp/nuflow-form-review-390.png inspecionadas: formulário e CTA completos, sem duplicação de cabeçalho e sem overflow. Fecha a pendência de artefato de composição da captura anterior.
- Nova observação: ícones nativos de data/hora têm contraste baixo no tema escuro; melhorar color-scheme dos controles em próxima alteração. Sem envio de formulário ou mudança de dados nesta verificação. Não equivale à revisão de todo o sistema.
