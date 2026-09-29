# Controle da execução do Flow

Última atualização: 29/09/2026 — O06: reserva durável de IA, relatórios protegidos e painel de consumo parcial; sem deploy.

## Checkpoint de retomada

- Tarefa em andamento: O06 EM_EXECUCAO. Sugestões por regras, orçamento durável e geração de relatórios protegida; demais caminhos de IA ainda pendentes. S01/S02/S03 conservam recortes pendentes.
- Próxima tarefa: migrar demais consumidores de analisarComClaude, coberturas/briefing e chat/tools ao orçamento; depois cache/opt-out, política auditada e preço datado. Ver O06-LIMITES-IA.md; não avançar M01 como se O06 estivesse completa.
- Checkout de execução: /Users/giovanigomes/MediaHouse/nuflow-melhorias; branch melhorias/execucao-auditoria.
- Fonte auditada: /Users/giovanigomes/MediaHouse/videoops; não pressupor árvore limpa.
- Base: origin/main 7750b33dae75cd0a742da02e37d58ac56fb06860; fetch conferido em 26/09.
- Última alteração: reserva atômica e conciliação em Postgres; relatório conserva indicadores sem IA ao atingir limite; painel parcial com custo desconhecido.
- Verificações O06 parcial: 687 unitários, 212 integrações, 24 runtime, build webpack, tipos, lint sem erros e auditores/grants. Migration 20260929090000_orcamento_ia apenas no banco descartável; produção/provedor permanecem pendentes.
- Validações externas conhecidas: runtime RLS, OAuth/Drive, WhatsApp/recibos, e-mail, transcrição, worker, restauração e piloto.
- Decisão pendente que impede começar: nenhuma; F00/F01 preparam a base.

## Fila de tarefas

A ordem das linhas é a preferência de execução. Só iniciar quando as dependências tiverem as provas locais exigidas; dependência externa pendente deve ficar visível. Não trocar BLOQUEADO por IMPLEMENTADO para liberar a fila. L02/L03 são operacionais e ficam fora do Goal técnico F00–L01.

Legenda de cadernos: 01 fundação/segurança; 02 relatórios; 03 automações; 04 mídia; 05 custos; 06 experiência/SaaS; 07 validação/release. Estados descritos no plano mestre. Publicação pode ser NAO_APLICAVEL para preparações sem artefato de produto.

| ID | Tarefa | Caderno | Depende de | Implementação | Validação | Revisão | Publicação |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F00 | Base e preservação | 01 | — | IMPLEMENTADO | UNITARIA | CONFERIDA | NAO_APLICAVEL |
| F01 | Ambiente sintético | 01 | F00 | EM_EXECUCAO | INTEGRADA_ISOLADA | PENDENTE | NAO_PUBLICADO |
| S01 | Contexto e revogação | 01 | F01 | EM_EXECUCAO | INTEGRADA_ISOLADA | PENDENTE | NAO_PUBLICADO |
| S02 | Configuração sem segredos | 01 | S01 | EM_EXECUCAO | INTEGRADA_ISOLADA | PENDENTE | NAO_PUBLICADO |
| S03 | APIs críticas autorizadas | 01 | S01 | EM_EXECUCAO | INTEGRADA_ISOLADA | PENDENTE | NAO_PUBLICADO |
| S04 | OAuth e cifra versionada | 01 | S02 | IMPLEMENTADO | INTEGRADA_ISOLADA | CONFERIDA | NAO_PUBLICADO |
| S05 | Ferramentas autorizadas | 01 | S01, S03 | IMPLEMENTADO | INTEGRADA_ISOLADA | CONFERIDA | NAO_PUBLICADO |
| S06 | Publicação explícita | 01 | S01, S03 | IMPLEMENTADO | INTEGRADA_ISOLADA | CONFERIDA | NAO_PUBLICADO |
| S07 | RLS e pool | 01 | S01, S04, S06 | IMPLEMENTADO | INTEGRADA_ISOLADA | CONFERIDA | NAO_PUBLICADO |
| S08 | Serviço de auditoria | 01 | S02, S03, S04, S05, S06, S07 | IMPLEMENTADO | INTEGRADA_ISOLADA | CONFERIDA | NAO_PUBLICADO |
| R01 | Relatório legado | 02 | S03 | IMPLEMENTADO | INTEGRADA_ISOLADA | CONFERIDA | NAO_PUBLICADO |
| R02 | Métricas e recortes | 02 | R01, S01 | IMPLEMENTADO | INTEGRADA_ISOLADA | CONFERIDA | NAO_PUBLICADO |
| R03 | Filtro de custos | 02 | S03, R02 | IMPLEMENTADO | INTEGRADA_ISOLADA | CONFERIDA | NAO_PUBLICADO |
| R04 | Ordem e paginação de galeria | 02 | S06 | IMPLEMENTADO | INTEGRADA_ISOLADA | CONFERIDA | NAO_PUBLICADO |
| O01 | Fila durável | 03 | F01, S07, S08 | IMPLEMENTADO | INTEGRADA_ISOLADA | CONFERIDA | NAO_PUBLICADO |
| O02 | Inbox WhatsApp | 03 | O01, S05 | IMPLEMENTADO | INTEGRADA_ISOLADA | CONFERIDA | NAO_PUBLICADO |
| O03 | Outbox e recibos | 03 | O01, O02 | IMPLEMENTADO | INTEGRADA_ISOLADA | CONFERIDA | NAO_PUBLICADO |
| O04 | Regras e lembretes | 03 | O03, R01, R02 | IMPLEMENTADO | INTEGRADA_ISOLADA | CONFERIDA | NAO_PUBLICADO |
| O05 | Alertas e saúde | 03 | O02, O03, O04 | IMPLEMENTADO | INTEGRADA_ISOLADA | CONFERIDA | NAO_PUBLICADO |
| O06 | Limites e uso de IA | 03 | S03, S05, O01, R02 | EM_EXECUCAO | INTEGRADA_ISOLADA | PENDENTE | NAO_PUBLICADO |
| M01 | Identidade da mídia | 04 | S06, O01 | A_FAZER | NAO_EXECUTADA | PENDENTE | NAO_PUBLICADO |
| M02 | Worker privado | 04 | M01, O01 | A_FAZER | NAO_EXECUTADA | PENDENTE | NAO_PUBLICADO |
| M03 | Sync Drive | 04 | M01, S04, O01 | A_FAZER | NAO_EXECUTADA | PENDENTE | NAO_PUBLICADO |
| M04 | Biblioteca e histórico | 04 | M01, M02, M03, R04 | A_FAZER | NAO_EXECUTADA | PENDENTE | NAO_PUBLICADO |
| C01 | Convite e contrato | 05 | S01, S08, O03 | A_FAZER | NAO_EXECUTADA | PENDENTE | NAO_PUBLICADO |
| C02 | Competência e lançamento | 05 | C01, S03, S07 | A_FAZER | NAO_EXECUTADA | PENDENTE | NAO_PUBLICADO |
| C03 | Painel e conciliação | 05 | C02, R02, R03 | A_FAZER | NAO_EXECUTADA | PENDENTE | NAO_PUBLICADO |
| U01 | Navegação e remoções | 06 | F00, S03, R04, O05, M04 | A_FAZER | NAO_EXECUTADA | PENDENTE | NAO_PUBLICADO |
| U02 | Próxima ação e quatro jobs | 06 | U01, C01, R02 | A_FAZER | NAO_EXECUTADA | PENDENTE | NAO_PUBLICADO |
| U03 | Secretária delimitada | 06 | U02, O02, O03, O06, M01, S05 | A_FAZER | NAO_EXECUTADA | PENDENTE | NAO_PUBLICADO |
| U04 | Equipe e parcerias | 06 | C01, S06, S07, U01 | A_FAZER | NAO_EXECUTADA | PENDENTE | NAO_PUBLICADO |
| U05 | Administração SaaS | 06 | S01, S07, S08, O05, O06 | A_FAZER | NAO_EXECUTADA | PENDENTE | NAO_PUBLICADO |
| U06 | Interface de auditoria | 06 | S08, O05, U01 | A_FAZER | NAO_EXECUTADA | PENDENTE | NAO_PUBLICADO |
| U07 | Configurações e manutenção | 06 | S02, O05, M03, M04, C02 | A_FAZER | NAO_EXECUTADA | PENDENTE | NAO_PUBLICADO |
| I01 | Consumo e infraestrutura | 07 | O06, M02, M03, U05, U07 | A_FAZER | NAO_EXECUTADA | PENDENTE | NAO_PUBLICADO |
| L01 | Ensaio e pacote técnico | 07 | S08, R03, R04, O05, O06, M04, C03, U03, U04, U05, U06, U07, I01 | A_FAZER | NAO_EXECUTADA | PENDENTE | NAO_PUBLICADO |
| L02 | Publicação autorizada | 07 | L01 | A_FAZER | NAO_EXECUTADA | PENDENTE | NAO_PUBLICADO |
| L03 | Piloto e venda | 07 | L02 | A_FAZER | NAO_EXECUTADA | PENDENTE | NAO_PUBLICADO |

## Registro por cartão

Acrescentar uma entrada ao concluir, bloquear ou interromper. Não apagar as tentativas anteriores relevantes.

    ID / data:
    Base e checkout:
    Resultado implementado:
    Arquivos alterados:
    Migração/configuração necessária (somente nomes):
    Teste/comando, ambiente, resultado e exit code:
    Evidência de aceitação:
    Revisão do diff e contraexemplos conferidos:
    Validação externa pendente:
    Risco ou bloqueio, evidência e ação mínima para destravar:
    Próxima ação concreta:
    Commit local, se houver:

## Decisões e desvios

Nenhum desvio no momento da criação. Registrar problema novo com evidência, impacto no contrato, menor solução e IDs afetados. Não reescrever silenciosamente o objetivo ou os critérios de aceite.

## Dependências operacionais para L02/L03

| Item | Estado inicial | O que desbloqueia |
| --- | --- | --- |
| Destino de publicação e candidato | Não autorizado por este pedido de planejamento | Pacote L01 e autorização concreta |
| Teste de WhatsApp/e-mail | Destinatários não definidos para envio | Conta/telefone/e-mail de teste e autorização |
| Drive | Conexão real a validar | Conta/pasta de teste e autorização da operação |
| Runtime RLS/worker | Metadados parciais | Configuração e acesso adequados, sem exportar segredos |
| Custos históricos e faturas | Incompletos | Valores/fontes fornecidos ou revisados pelo responsável |
| Piloto | Não iniciado | Equipe/empresa e ciclo de uso definidos |

## Saída final da execução técnica

Preencher após L01: cartões concluídos, bloqueados, testes, migrações, candidato revisável, pendências reais e próximo passo. Não declarar correções publicadas sem versão comprovada.

## Checkpoint do lote de segurança — 26/09

Código e testes estão no checkout acima, não em videoops. O preview visual permanece em evolução própria; não fazer merge cego. Consulte CONSOLIDACAO.md e MATRIZ-ACESSO.md.

F00: preservadas alterações de videoops e do preview. Baseline 591 testes/38 arquivos, auditores sem dívida. Quatro exports inválidos do Next presentes na base impediam build; correções já existentes no preview transportadas seletivamente (rótulos de eventos extraídos; outros helpers tornados locais).

F01: PostgreSQL descartável em 127.0.0.1:55439/nuflow_test, 24 migrations existentes aplicadas. Runner exige DATABASE_URL_TEST e valida host/porta/banco; não copia .env. Testes reais criam/removem organizações, identidades multiempresa, permissões, configuração, profissional e custo sintéticos. Verificador RLS cobre demandas e compartilhamento em transação com app_user. Falta ampliar fixtures para todos os papéis e mídia/fluxos posteriores antes de encerrar F01 integralmente.

S01: cookie e JWT precisam de vínculo atual, usuário ativo e organização ativa. Seleção inválida não cai silenciosamente em outra empresa. Erro de consulta de permissão não herda preset. Helper requireAcesso revalida capacidade organizacional. Teste de handler real comprova revogação sem mutação.

S02: configuração administrativa exige gerenciarConfig, respostas usam allowlist; patch de Drive preserva fiscal. Faturamento tem endpoint separado vinculado a custo próprio na empresa ativa. WhatsApp também deixa de retornar chave e webhookSecret. Cifra Drive e migração de legado são o próximo bloco S04; cartão ainda aberto.

S03: guard aplicado em custos, produção, relatórios, IA, configurações e administração de pessoas. Alterar custos exige papel gestor/admin além de verCustos. Produção com salário exige verCustos. Relatórios atuais misturam financeiro: exigem verRelatorios + verCustos até R02 separar DTOs. Identidade multiempresa e superadmin não podem ter senha/dados globais alterados por gestor local; alteração de papel deixa de escrever Usuario.tipo global. GET de permissões não cria linha persistente. Ainda revisar acesso positivo por papel, payloads, escopo das ferramentas S05 e Trello legado global; não considerar auditoria completa.

Provas locais ficam em /private/tmp/nuflow-melhorias-{unit,integracao,types,lint,build,rls,tenancy,perfil}.log. Não são provas de produção. Houve falha inicial por Prisma Client copiado de outra branch; regenerado a partir do schema correto e testes repetidos. Sem envio externo, consumo de IA, reconexão de Drive ou migração real.

Autoelevação por alteração do próprio papel/preset foi bloqueada; superadmin inativo também é negado. Matriz registra 53 fronteiras HTTP. CI passou a executar a integração em PostgreSQL efêmero. Nenhuma migration nova neste lote. OAuth S04 ainda não foi implementado: é a próxima fatia, junto da cifra Drive pendente de S02.

### Fechamento do checkpoint inicial

- 607 testes unitários em 40 arquivos: exit 0.
- 17 cenários de integração (incluem matriz de múltiplos handlers): exit 0, PostgreSQL sintético.
- TypeScript e build Next/webpack finais: exit 0. Aviso de dependência dinâmica de face-api permanece.
- ESLint dos arquivos alterados: exit 0, zero erros e 13 avisos em trechos existentes.
- Auditores tenancy/perfil e diff check: exit 0.
- Verificador RLS: exit 0 no banco descartável com SET LOCAL ROLE app_user; não certifica credencial do runtime publicado.
- Revisão própria do diff: nenhuma migration nova, segredo ou alteração do preview absorvida; tratamento de seleção inválida é intencionalmente 403. Exceção financeira temporária documentada na consolidação.
- CI remoto, navegador com login real e release não executados. Os cartões amplos permanecem EM_EXECUCAO até completar seus critérios; este é um checkpoint de implementação, não conclusão de F00–L01.
- Próxima ação: S04 — nonce OAuth persistente de uso único + cifra versionada de Drive, migrations e ensaio de concorrência local; concluir S02 e ampliar validação de S03. Trello global permanece risco conhecido a tratar, não integração homologada.

## Checkpoint S04 — 28/09

S04 implementado e revisado localmente sobre o commit 9f039f7. A fatia de configuração exigida por S04 já possui autorização, allowlist e preservação fiscal; isso não encerra todos os recortes de S02/S03. Cifra Drive pendente no checkpoint anterior agora está entregue. Operação, rotação e recuperação estão em S04-OPERACAO-DRIVE.md.

- OAuth exige ator/empresa/capacidade atuais, cookie e nonce persistido por hash, expiração e consumo atômico. Estado previsível legado é recusado. Dois callbacks com o mesmo estado produzem uma única troca de token; autorizações distintas da mesma empresa são serializadas.
- AES-256-GCM vinculado à empresa, chave/versionamento próprios, leitura transitória de legado e CLI por empresa com simulação padrão, paginação, bloqueio de linha, idempotência e rotação. Nenhuma credencial real migrada.
- Migração 20260928000000_oauth_drive_estado aplicada somente em 127.0.0.1:55439/nuflow_test; 25 migrations no ambiente descartável. Diff schema/banco: nenhuma diferença.
- 615 testes unitários/41 arquivos e 34 integrações/2 arquivos: exit 0. Integrações incluem expiração, troca de ator/empresa, revogação durante retorno, falha de provedor, preservação fiscal/token, concorrência e SET LOCAL ROLE app_user com negação entre empresas. Google simulado, banco real descartável.
- Build Next/webpack, tipos, auditores tenancy/perfil, RLS e diff check: exit 0. ESLint final dos arquivos alterados: zero erros e nove avisos preexistentes na tela de configurações. Aviso de dependência dinâmica de face-api permanece no build.
- CLI em simulação, chave sintética e empresa inexistente: exit 0. Logs locais em /private/tmp/nuflow-s04-*.log; não são evidências de produção.
- Tentativa inicial de integração revelou campos extras do objeto de acesso passados ao filtro Prisma; corrigido com seleção explícita de usuarioId/organizacaoId e suíte repetida com sucesso.
- Revisão própria: sem segredo em diff, sem alterações em preview/videoops, nenhum envio ou consumo de IA. Endpoint de teste Drive agora POST; mantém criação explícita de arquivo, ainda não executada contra Google.
- Validação externa pendente: conta/pasta Google, migração do legado real, configuração de chaves e role do runtime em L02. Sync Drive permanece M03.
- Próxima ação concreta: completar matriz positiva/payloads e isolamento Trello em S03, depois migrar todos os chamadores de ferramentas para contexto verificado S05. A fila restante não está concluída.

## Checkpoint S03/Trello e usuários — 28/09

- Sobre 0de0249, removido cache global do endpoint Trello. GET usa resolução por empresa, retorna somente board/estado e máscaras fixas; POST valida contrato estrito, testa a conexão, revalida autorização e persiste somente na empresa selecionada. Mapeamento de listas preservado ao atualizar credenciais do mesmo board e removido ao trocar de board, evitando destinos antigos. Escritas concorrentes da rota são serializadas por empresa; configurações duplicadas são recusadas.
- Máscaras/credenciais omitidas só reutilizam a configuração da própria empresa. O fallback legado por ambiente continua restrito ao dono declarado. Erro de banco não ativa fallback; configuração explicitamente desativada também não. Credenciais Trello continuam no formato legado da tabela (não confundir com a cifra Drive entregue em S04); ampliar cifra e preparar rotação antes de homologar a integração comercial.
- Erros HTTP, rede e JSON do helper Trello não propagam resposta externa nem URL com token. Nenhuma chamada real foi feita: adaptador Trello simulado na integração e fetch simulado nos testes do helper.
- GET de usuários calcula última atividade somente a partir de demandas da empresa selecionada, mesmo para pessoa com vínculos em A/B. Não depende de RLS habilitado para essa restrição.
- Matriz real de leitura de configuração, Trello e custos para todos os 12 papéis; cenários positivos de admin/gestor e negativos dos demais, além das exceções configuráveis cobertas no lote anterior. Isso não certifica todos os payloads das 53 fronteiras nem conclui S03 integralmente.
- 618 testes unitários/42 arquivos e 52 integrações/2 arquivos: exit 0. Banco descartável PostgreSQL local, sem credenciais reais. ESLint dos arquivos alterados sem avisos; tipos/build e auditores passaram. Logs /private/tmp/nuflow-s03-*.log.
- Tentativas corrigidas: fixture de revogação removia vínculo necessário ao grupo seguinte; restaurado no setup do grupo. Fixture de demanda exigia solicitanteId; preenchido antes da repetição bem-sucedida. Não eram falhas do provedor real.
- Sem migration, publicação ou alteração em outros checkouts. Trello não possui tela consumidora ativa encontrada na busca atual; o contrato HTTP foi preservado com máscaras fixas. Homologação de board real permanece pendente em L02.
- Próxima ação: S05 tem 18 ferramentas e chamadores em chat, agentes manuais, cron e webhook WhatsApp. Migrar em conjunto para contexto verificado, políticas por ferramenta, escopo de demandas e destinatário autorizado; não liberar ferramentas apenas pela permissão verIA. Permanecem payloads adicionais de S03 e criptografia de integrações legadas em S02.

## Checkpoint S05 — 28/09

- Base 095c97d; checkout e branch preservados. Implementadas políticas das 18 ferramentas; contrato e requisitos operacionais em S05-FERRAMENTAS.md. A dependência S01/S03 deste recorte tem revalidação e guard verIA comprovados; não encerra a revisão ampla dos demais handlers.
- Todos os chamadores migrados: chat, quatro agentes manuais, três execuções técnicas de cron e secretária WhatsApp. Executor não aceita mais string de empresa nem objeto serializado forjado. Contexto emitido pelo adaptador e capacidades relidas por execução; comOrg envolve autorização e operação.
- Consultas de demanda usam escopo próprio/verTodasDemandas. Custo exige verCustos; métricas/equipe omitem financeiro sem capacidade. Cron não recebe ferramenta de custos e não herda admin humano. Schemas estritos recusam campos extras, tipos inválidos e limites excessivos.
- WhatsApp identificado por telefone completo dentro da empresa; ambiguidades falham fechadas. Resposta da secretária só retorna ao remetente. Outros envios exigem gestor/participante da demanda verificada. Contato externo fornece somente pedido pendente e recebe resposta; não enumera pessoas, jobs, ideias ou finanças. Anexos exigem URL da mídia recebida e demanda acessível.
- Eliminado fallback inseguro de webhook sem segredo e associação LID por cache/sufixo/nome. Campo alternativo só é aceito no evento autenticado. SIM/NÃO exige um convite único atribuído e estado videomaker_notificado; atualização condicional e histórico na mesma transação.
- 620 unitários/43 arquivos e 76 integrações/3 arquivos: exit 0. Novos 24 cenários integrados cobrem autoridade, escopo, efeitos negados, permissões positivas, mídia, destinatários, revogação, webhook e concorrência. Banco PostgreSQL descartável; WhatsApp, storage e IA simulados. Nenhum envio real.
- Build webpack, TypeScript final, ESLint dos arquivos alterados, auditores tenancy/perfil e diff check: exit 0. Permanece aviso preexistente de dependência dinâmica face-api no build. Logs /private/tmp/nuflow-s05-*.log.
- O ensaio concorrente expôs unique constraint no cadastro auxiliar de contato via upsert; substituído por createMany com skipDuplicates, mantendo a transição de convite atômica. Suíte repetida sem a colisão. Fixtures são sintéticas e removidas ao final.
- Revisão própria: assinaturas antigas não existem entre chamadores; não há query de identidade por sufixo no webhook. Segredos/contextos não são incluídos no retorno das ferramentas. Sem schema novo ou alteração em outros checkouts.
- Pendências externas: segredo na configuração Evolution, evento direto/LID da versão implantada, número completo/vínculo ativo, teste autorizado com destinatários sintéticos e role do runtime. Não publicar este lote sem esse ensaio L02: ausência de segredo ou associação LID confiável passa a recusar entrada, intencionalmente.
- Limites: nenhuma transação única para uma conversa inteira; fila/inbox/outbox/recibos, índice de telefone canônico, limites de consumo IA e interface são O01–O06/U03. Não transformar este checkpoint em certificação geral do SaaS.
- Próximo cartão: S06, publicação explícita e proteção de mídia; em seguida S07, runtime RLS/pool. Seguem pendentes os recortes já registrados de S02/S03.


### S06 — biblioteca, portfólio e acesso ao objeto (28/09/2026)

- Contrato e roteiro de entrada: `S06-PUBLICACAO-MIDIA.md`. Sem deploy, envio externo ou consumo de IA. Publicação de portfólio foi testada somente com dados sintéticos locais.
- `Arquivo` recebe data/ator de publicação/revogação e snapshot das URLs. Migração `20260929000000_publicacao_arquivo` aplicada somente em 127.0.0.1:55439/nuflow_test (26 migrações); nenhuma publicação retroativa.
- Biblioteca audiovisual/Growth autenticada, com filtros de área/escopo, publicação explícita pela gestão e identificação de links legados. Growth passa a incluir finais sem linkFinal. Portfólio público conta arquivos, com ordem determinística; R04 ainda inclui revisão de outros consumidores.
- Mídia autoriza registro específico; token de uma demanda não abre outra, documento ou NF. Parceiros exigem parceria/aresta ativas. Miniatura Drive exige snapshot publicado e ID exato. Cobertura verifica vínculo do caminho antes de assinar.
- 630 testes unitários/44 arquivos e 90 integrações/4 arquivos. Assinador e Google simulados; PostgreSQL real descartável. Build webpack, TypeScript, lint dos arquivos alterados (zero erros; seis avisos preexistentes em galeria/Sidebar), auditores tenancy/perfil, RLS e diff check aprovados. Aviso preexistente de face-api permanece no build. Logs: /private/tmp/nuflow-s06-*.log.
- Script de inventário somente leitura executado em banco local, empresa inexistente (contagens zero), para validar SQL. Não houve inventário dos dados reais, ensaio visual autenticado ou verificação do bucket real.
- Limites: URLs assinadas antigas até 600s; links de buckets públicos/Drive exigem tratamento no provedor; arquivos sem registro e referências antigas precisam inventário. Não certificar acervo legado, M01–M04 ou prontidão comercial como resolvidos.
- Próximo cartão: S07 (runtime RLS/pool). Manter pendências S01/S02/S03, validações externas e L02 abertas.


### S07 — runtime e pool com logins restritos (28/09/2026)

- Roteiro: `S07-RUNTIME-RLS.md`. Runner e CI usam conexão direta de logins temporários sem superuser/bypass/ownership; administrador somente no preparo/limpeza local. Não houve troca de credenciais ou flag em produção.
- Extensão extraída e corrigida: SQL também recebe contexto; ausência de empresa declara vazio; callback não desativa a extensão do cliente global; lote mantém ordem/rollback. Prova com pool de duas conexões e resíduo numa conexão única.
- Conexões explícitas obrigatórias sob RLS, sem fallback de auth/admin para dono. Verificador somente leitura testado localmente com os roles restritos; administração técnica permanece atrás dos gates existentes de super-admin.
- Recuperação de senha falhou no primeiro ensaio restrito. Proposta de UPDATE direto foi rejeitada pela revisão automática e não aplicada. Alternativa implementada: função restrita a token válido de uso único, sem conceder UPDATE em usuários. Regressões de expiração, privilégio e concorrência passaram.
- Migração `20260929010000_auth_reset_por_token` aplicada somente em 127.0.0.1:55439/nuflow_test; 27 migrações. 635 unitários/45 arquivos, 90 integrações/4 arquivos, 16 runtime/1 arquivo; RLS SQL e diagnóstico de roles aprovados. Logs `/private/tmp/nuflow-s07-*.log`.
- Build webpack, TypeScript, lint (zero erros/avisos nos arquivos alterados), auditores tenancy/perfil, verificador RLS e diff check: aprovados. Schema migrado sem diferença frente ao Prisma; aviso preexistente de dependência face-api no build.
- Limites: provas de estado OAuth e identidade/login no banco, não login do navegador/Google real. Ainda faltam pool/conexões do provedor, ensaio HTTP de homologação e administração real. S08 deve trazer RLS próprio para a tabela central de auditoria. Não declarar L02 liberado.
- Próximo cartão: S08. Pendências anteriores de S01/S02/S03 e validações externas continuam abertas.

### S08 — ações sensíveis e retenção (28/09/2026)

- Base efc8495; contrato, cobertura por fluxo e operação em S08-AUDITORIA.md. Revisão própria; não representa auditoria externa independente. Cartões amplos S01/S02/S03 permanecem abertos.
- Evento separado de HistoricoStatus, organização/ator/correlação e payload allowlisted. Sucesso atômico com escrita; intenção/resultado para provedor. Configurações, permissões, pessoas, OAuth/Trello, publicação, backfills e ferramentas IA instrumentados no recorte descrito. Nenhum histórico inventado.
- Leitura administrativa por empresa, paginação estável e seletor de fonte na tela atual. Detalhes ocultos após 90 dias; CLI técnica remove payload vencido em lotes e registra a manutenção. Agendamento real e política de retenção do envelope/backups pendentes. U06 continua aberto.
- Duas migrações aplicadas somente no banco descartável: 20260929020000_eventos_auditoria e 20260929030000_auditoria_preservar_empresa; 29 ao todo. Role comum só insere/lê eventos próprios; não altera/apaga nem exclui a organização por cascata. Administração técnica continua privilegiada.
- 637 testes unitários/46 arquivos, 101 integrações/5 arquivos, 18 runtime/1 arquivo: aprovados. Provas de rollback, retry, dados sensíveis omitidos, concorrência, isolamento A/B, grants reais e retenção. OAuth, WhatsApp e IA simulados.
- Build webpack, TypeScript, ESLint dos arquivos alterados, auditores tenancy/perfil, RLS, diagnóstico de roles e diff check aprovados. Prisma sem diferença para banco migrado. Aviso preexistente de dependência dinâmica face-api permanece. Logs /private/tmp/nuflow-s08-final-*.log.
- Ensaio final encontrou conflito de inferência TEXT/VARCHAR nos parâmetros repetidos do INSERT da retenção; casts explícitos corrigidos e suíte integrada repetida com sucesso.
- Limites: resultado de envio é aceitação pelo provedor, não recibo de entrega. Correlação não substitui outbox/idempotência de envio. Negação identificável é best-effort; guard secundário e rotinas legadas não têm cobertura universal. Nenhum push, deploy, migração real ou mensagem enviada.
- Próxima ação: R01, adaptar relatórios antigos e validar novos escritores sem regenerar texto pago; conferir autorização/isolamento dos handlers envolvidos antes de alterar leitura.

### R01 — relatórios legados e contrato validado (28/09/2026)

- Base ca2c133; contrato e limites em R01-RELATORIOS.md. Corrigida divergência analise/resumo_executivo que deixava o semanal sem texto. Histórico não regravado nem regenerado.
- DTO validado, conteúdo textual/estruturado seguro e erro visível com referência. Campos ausentes não viram zero. Geração manual e cron usam envelope v1; snapshot manual preservado quando IA responde em formato inválido, sem repetição automática por formato.
- Consumidores Relatórios e Central de IA migrados juntos. Entrada da geração/listagem validada. Consulta de ideias recentes passa a exigir filtro da empresa. Mantido gate financeiro até R02.
- 653 unitários/47 arquivos e 107 integrações/6 arquivos aprovados; PostgreSQL local com IA simulada. Cobertura de HTML escapado, formato semanal sintético, campos ausentes/inválidos, snapshot, isolamento A/B e ausência de IA na leitura. Logs /private/tmp/nuflow-r01-*.log.
- Build webpack, TypeScript, ESLint (zero erros; seis avisos preexistentes nas telas), auditores tenancy/perfil e diff check aprovados. Aviso preexistente face-api no build. Revisão própria, sem avaliação independente ou ensaio visual autenticado.
- Sem migration, push/deploy, chamadas pagas ou mensagens externas. Não declarar indicadores reconciliados: semântica das métricas, períodos e Growth continua R02; cron/envios/consumo continuam nos cartões O.
- Próxima ação: R02 — serviço comum de métricas e recortes com testes de reabertura, fronteiras de datas e separação de áreas, sem recalcular snapshots antigos.

### R02 — métricas e recortes compartilhados (29/09/2026)

- Base eb24333; contrato, critérios e limitações em R02-METRICAS.md. Período brasileiro com fim exclusivo, alias Growth/design, datas/áreas rejeitadas quando inválidas. Conclusão exige estado final atual e data confiável; removida inferência por updatedAt nos consumidores cobertos.
- Contagem comum para dashboard, relatório, produção e resumo executivo/PDF. Arquivos finais deduplicados por identidade conhecida; link legado somente como fallback. Publicações usam data explícita ou Não medido. Manual permanece mensal/separado, sem total combinado potencialmente duplicado.
- Reabertura limpa finalizadaEm nos dois handlers de coluna/status sem apagar histórico; nova conclusão recebe data nova. Snapshot emitido continua intacto. Não executada correção retroativa em massa.
- Geração manual e cron semanal usam snapshot validado do mesmo serviço. verRelatorios não implica acesso financeiro; custos/diárias omitidos sem verCustos, tipos financeiros negados e histórico legado protegido. Testado valor sintético secreto fora do payload e do prompt.
- 666 unitários/48 arquivos, 114 integrações/7 arquivos e 18 runtime/1 arquivo aprovados, banco PostgreSQL descartável. Cron e IA simulados, notificações de transição suprimidas nos testes. Nenhum envio externo.
- Build webpack, TypeScript, lint (zero erros; dez avisos em trechos preexistentes), auditores tenancy/perfil e diff check aprovados. Aviso preexistente face-api permanece. Logs /private/tmp/nuflow-r02-*.log. Revisão própria; ensaio visual autenticado não realizado.
- Sem migration ou publicação. Custos sem vínculo não rateados, identidade de versões antigas depende M01, fechamento financeiro C01–C03 e instrumentos dos demais agentes O ainda pendentes. Recortes amplos S01/S02/S03 continuam abertos.
- Próxima ação: R03 — filtros combinados de custos com início inclusivo/fim exclusivo e compatibilidade de/ate.

### R03 — filtro de custos por período (29/09/2026)

- Base d580e5a; contrato e limite dos registros antigos em R03-CUSTOS-PERIODO.md. Eliminada sobrescrita do limite inicial pelo final. Ambos usam a conversão de calendário R02: gte no início e lt na meia-noite após ate.
- Preservados limites independentes, ausência de filtro e escopo financeiro/organizacional. Datas inválidas/invertidas retornam erro por campo. Lista/totais/grupo usam os mesmos registros; resposta no-store e desempate por ID.
- Tela com De/Até e limpeza do período. Novo custo com data simples passa a usar meia-noite brasileira para permanecer no dia selecionado. ISO com fuso conserva o instante; registros antigos não foram deslocados.
- 672 unitários/49 arquivos e 124 integrações/8 arquivos aprovados. Build webpack, TypeScript, lint dos arquivos alterados sem avisos, auditores tenancy/perfil e diff check aprovados. Aviso preexistente face-api permanece. Logs /private/tmp/nuflow-r03-*.log.
- Revisão própria. Sem migration, push/deploy, acesso ao banco real, IA ou mensagens externas. Dívida de datas antigas gravadas em UTC precisa inventário antes de correção histórica; custeio geral continua C01–C03.
- Próxima ação: R04 — ordenar e paginar galeria pela unidade entregável, mantendo publicação explícita S06 e isolamento.

### R04 — ordem e paginação da galeria (29/09/2026)

- Base 350f184; contrato, evidências e limites em R04-GALERIA.md.
- Bibliotecas e portfólio contam entregáveis; conclusão/anexação/atualização estimada e ID definem ordem estável. URLs canônicas duplicadas na mesma demanda não repetem o card.
- Preservados isolamento e publicação explícita. Falha de assinatura retorna 503 sem fallback privado; interface permite repetir a página.
- 674 unitários, 127 integrações, build/tipos, lint sem erros e auditores locais. Sem migração/deploy.
- Limite: índice completo do escopo em memória; sem benchmark de escala ou validação visual autenticada. Detalhes/assinaturas restritos à página.
- Próxima ação: O01 — fila durável; manter pendências S01/S02/S03.

### O01 — fila durável (29/09/2026)

- Base e384fbf; contrato de integração/limites em O01-FILA-DURAVEL.md.
- Jobs e eventos com RLS; intenção única por empresa/tipo/chave, claim atômico, limite de dois leases por empresa, renovação, backoff limitado, expiração, cancelamento e retomada.
- Efeito local e conclusão na mesma transação, com recusa de token antigo. Primeiro consumidor: recuperação de execuções interrompidas, agora dentro do escopo da empresa no cron.
- 674 unitários, 141 integrações, 19 testes runtime sem bypass, verificador de grants/RLS, build/tipos/lint e auditores aprovados.
- Migração 20260929040000_fila_duravel aplicada só no PostgreSQL descartável. Sem deploy, cron novo, IA paga ou mensagem real.
- Limite: rotinas de envio/IA ainda não migradas; estados de entrega/timeout ambíguo pertencem a O03. Não prometer exactly-once externo nem worker contínuo.
- Próxima ação: O02 — inbox WhatsApp persistida e autenticada, com contrato do provedor conferido.

### O02 — inbox WhatsApp (29/09/2026)

- Base 9bfe28e; contrato/limites em O02-INBOX-WHATSAPP.md. Instalação Evolution não confirmada; emissor oficial 2.3.7 é referência, não homologação.
- Inbox cifrada e job atômicos; chave própria por empresa/instância/ID, retorno 503 antes de persistir, descartes explícitos e bootstrap RLS restrito.
- Processamento local retomável de SIM/NÃO, revalidando convite/identidade/validade. Demais mensagens aguardam automação; respostas/download/transcrição/IA inline removidos deste caminho para não duplicar efeitos externos.
- Consumidor técnico sem IA, protegido por CRON_SECRET, paginado por empresa; after como otimização e cron existente como retomada. Sem agendamento novo; cadência/cursor em L02.
- Retenção de conteúdo de sete dias com limpeza em lotes; mantém chave. Job válido por 24h. Rejeição/expiração da fila não equivale a mensagem respondida.
- 677 unitários, 155 integrações, 20 testes runtime, build/tipos/lint e auditores locais. Migração 20260929050000_inbox_whatsapp só no banco descartável.
- NÃO publicar isoladamente: O03 precisa ligar confirmações/saída; conversa completa depende de O06/U03. Confirmar versão/payload real e ensaio L02. Sem mensagens ou chamadas pagas.
- Próxima ação: O03 — outbox, recibos e tratamento de resultado desconhecido.

### O03 — outbox e recibos (29/09/2026)

- Base 26422dc; contrato, operação e limites em O03-OUTBOX-WHATSAPP.md. Revisão própria, sem homologação externa.
- Intenção/job atômicos, tentativas filhas, checkpoint de incerteza antes da rede, backoff limitado e reenvio manual auditado. Confirmações locais da inbox participam da transação de negócio.
- Recibos autenticados e monotônicos; tela diferencia agendamento, aceitação, entrega e leitura. Histórico antigo preservado sem reenvio/reinterpretação. Retenção cifrada de sete dias.
- 677 unitários, 169 integrações, 21 runtime, verificador de grants/RLS, build/tipos, lint sem erros e auditores aprovados. Dez avisos preexistentes de lint nas telas e aviso face-api no build. Logs /private/tmp/nuflow-o03-*.log.
- Migração 20260929060000_outbox_whatsapp só no banco descartável. Sem publicação, registro remoto de webhook, mensagens ou chamadas pagas.
- Contrato Evolution real não confirmado; worker exige WHATSAPP_EVOLUTION_CONTRATO após homologação. Não configurar arbitrariamente. Resultado desconhecido sem ID continua bloqueado para reenvio e requer investigação no provedor.
- Adaptador legado ainda usa chave diária por conteúdo e não participa da transação original. O04 migra regras/chaves/contadores e remove LLM dessas rotinas. O05 completa a saúde; O06/U03 completam a conversa. Não declarar WhatsApp comercial homologado.
- Próxima ação: O04 — regras, lembretes e snapshots recorrentes determinísticos com produtor atômico.

### O04 — regras, lembretes e resumos (29/09/2026)

- Base 3b804ea; contrato, critérios e limites em O04-REGRAS-E-LEMBRETES.md. Revisão própria, sem homologação externa.
- Cron e quatro ações manuais de monitoramento substituídos por regras versionadas, sem LLM. Alertas únicos com resolução/reabertura, páginas de 100 e filtros combinados sem sobrescrever status. Cobrança restrita à NF pendente, não ao pagamento pelo prestador.
- notificarEm derivado pelo banco; cron atrasado ainda atende evento futuro. Intenção/job por regra na transação; alteração de horário/responsável, conclusão e pagamento invalidam antes da rede. Contadores antigos não são marcados como envio.
- Snapshot da semana anterior fechada por área, deduplicado e com zero tokens. Empresas inativas/de teste/sem atividade elegível não geram execução comercial. Ambiente de teste exige marcação explícita antes da publicação.
- Limpeza automática de links suspensa até M04; não apoiar exclusão em agendamento de aviso. Briefing simplificado para central de alertas; análises de capacidade/custo por IA removidas desses quatro comandos, sem prometer diagnósticos não implementados.
- 682 unitários, 179 integrações, 22 runtime, build/tipos, lint sem erros, grants/RLS e auditores aprovados. Um aviso preexistente de lint na tela IA e face-api no build. Logs /private/tmp/nuflow-o04-*.log.
- Migração 20260929070000_regras_deterministicas apenas no banco descartável. Sem deploy, mensagens ou chamadas pagas. Homologação Evolution, agendador seguindo cursor, benchmark de volume e interface de saúde pendentes. Demais produtores legados fora destas rotinas conservam limitações O03.
- Próxima ação: O05 — apresentar saúde por evidências e permitir ações individuais auditadas sobre saídas.

### O05 — saúde e ações auditadas (29/09/2026)

- Base e00b416; contrato e operação em O05-SAUDE-E-ALERTAS.md. Revisão própria, sem homologação externa.
- Conexão reportada, inbox, aceite, recibo correlacionado e fila separados. Polling local; erro não vira zero e silêncio não implica falha.
- Heartbeat técnico dos dois consumidores; resumo parcial inclui falha antes da rede. Atraso exige cadência real; sem registro/cadência são explícitos. Continuidade do cursor permanece L02.
- Pausa, retomada e cancelamento por intenção com lock compartilhado e auditoria atômica. Revisão evita worker antigo; nenhuma ação opera depois do checkpoint de envio. Reenvio conserva O03.
- Alertas com filtros, paginação e detalhes; inclui responsável externo. Leitura por capacidade/empresa/escopo e alterações auditadas. Erro de interface visível.
- 684 unitários, 190 integrações, 23 runtime, tipos, lint sem erros e auditores/grants aprovados. Nove avisos preexistentes de lint; face-api no build. Build inicial aprovado; build final e nova repetição de runtime impedidos por falta de disco (ENOSPC), mesmo após remover artefatos desta tarefa. Repetir após liberar espaço; configuração original de build restaurada. Logs /private/tmp/nuflow-o05-*.log.
- Migração 20260929080000_pausa_saida_whatsapp somente no banco descartável. Sem mensagens, IA paga, deploy ou cron novo. Cadência, Evolution, benchmark/retenção das batidas e ensaio visual pendentes.
- Próxima ação: liberar espaço e repetir validação final; depois O06 — limites concorrentes e medição de consumo de IA.


### O05 — recuperação da validação (29/09/2026)

- Build webpack com configuração original aprovado após recuperação de espaço.
- PostgreSQL descartável retomado na porta 55439; 23 runtime e verificação de grants/RLS aprovados novamente. Nenhum acesso ao banco de produção.
- Evidências: /private/tmp/nuflow-o05-build-recovery.log e /private/tmp/nuflow-o05-runtime-recovery.log. Encerrada a pendência local de ENOSPC; permanecem validações externas.

### O06 — primeiro recorte: sugestões sem chamada paga (29/09/2026)

- Base 29d8088; detalhes, limites e sequência em O06-LIMITES-IA.md.
- GET de sugestões não instancia provedor nem usa chave de API; orientação editorial por regras em todos os produtos retornados. Consulta direta corrige produto fora do top 10.
- Capacidade verProdutos, empresa revalidada, contexto explícito de banco, filtro de ativos, 404 uniforme e erro 503 legível. Tela informa origem por regras.
- 687 unitários e 195 integrações aprovados; build webpack final, tipos e auditores aprovados. Lint sem erros, um aviso preexistente na tela de produto.
- Sem migração, mensagem, IA paga ou deploy. O06 continua EM_EXECUCAO: ainda não existe teto agregado de IA nem medição central; demais caminhos pagos permanecem para o próximo recorte.


### O06 — segundo recorte: orçamento e relatórios protegidos (29/09/2026)

- Base 03a5282; contrato/limitações em O06-LIMITES-IA.md.
- Política por empresa com defaults finitos; reserva transacional, simultaneidade, checkpoint único, expiração apenas pré-envio e débito desconhecido mantido até conciliação. Uso de entrada/saída/cache separado; sem preço inventado.
- Adaptador de texto com contexto explícito, tamanho/saída limitados, timeout e sem retry automático. Primeiro consumidor: geração manual de relatórios; fallback conserva snapshot e informa indisponibilidade/consumo pendente.
- Central de IA mostra detalhe restrito a gerenciarConfig, com cobertura explicitamente parcial. Medido/reserva/desconhecido separados; erro não vira zero.
- 687 unitários, 212 integrações e 24 runtime; build webpack, grants/RLS, tipos, lint sem erros e auditores aprovados. Provedores falsos e banco descartável; sem IA paga, mensagem ou deploy.
- Migration 20260929090000_orcamento_ia somente no banco descartável. Persistência deve preceder futura publicação. Restante de chamadas, cache/opt-out, preços e edição auditada da política continuam pendentes; O06 permanece EM_EXECUCAO.
