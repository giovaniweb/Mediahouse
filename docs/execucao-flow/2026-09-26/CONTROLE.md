# Controle da execução do Flow

Última atualização: 28/09/2026 — OAuth e cifra Drive implementados e testados localmente; nenhuma publicação.

## Checkpoint de retomada

- Tarefa em andamento: S04 concluído localmente; S01/S02/S03 permanecem abertos nos recortes indicados abaixo.
- Próxima tarefa: completar matriz positiva/payloads e Trello legado em S03; preparar contexto obrigatório das ferramentas S05.
- Checkout de execução: /Users/giovanigomes/MediaHouse/nuflow-melhorias; branch melhorias/execucao-auditoria.
- Fonte auditada: /Users/giovanigomes/MediaHouse/videoops; não pressupor árvore limpa.
- Base: origin/main 7750b33dae75cd0a742da02e37d58ac56fb06860; fetch conferido em 26/09.
- Última alteração: nonce OAuth persistente de uso único, vínculo ao navegador/ator/empresa, cifra versionada e migração gradual de credenciais Drive.
- Verificações: 615 unitários, 34 cenários integrados, RLS sintético e auditores; build e tipos passaram. Migração aditiva aplicada somente no banco descartável.
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
| S05 | Ferramentas autorizadas | 01 | S01, S03 | A_FAZER | NAO_EXECUTADA | PENDENTE | NAO_PUBLICADO |
| S06 | Publicação explícita | 01 | S01, S03 | A_FAZER | NAO_EXECUTADA | PENDENTE | NAO_PUBLICADO |
| S07 | RLS e pool | 01 | S01, S04, S06 | A_FAZER | NAO_EXECUTADA | PENDENTE | NAO_PUBLICADO |
| S08 | Serviço de auditoria | 01 | S02, S03, S04, S05, S06, S07 | A_FAZER | NAO_EXECUTADA | PENDENTE | NAO_PUBLICADO |
| R01 | Relatório legado | 02 | S03 | A_FAZER | NAO_EXECUTADA | PENDENTE | NAO_PUBLICADO |
| R02 | Métricas e recortes | 02 | R01, S01 | A_FAZER | NAO_EXECUTADA | PENDENTE | NAO_PUBLICADO |
| R03 | Filtro de custos | 02 | S03, R02 | A_FAZER | NAO_EXECUTADA | PENDENTE | NAO_PUBLICADO |
| R04 | Ordem e paginação de galeria | 02 | S06 | A_FAZER | NAO_EXECUTADA | PENDENTE | NAO_PUBLICADO |
| O01 | Fila durável | 03 | F01, S07, S08 | A_FAZER | NAO_EXECUTADA | PENDENTE | NAO_PUBLICADO |
| O02 | Inbox WhatsApp | 03 | O01, S05 | A_FAZER | NAO_EXECUTADA | PENDENTE | NAO_PUBLICADO |
| O03 | Outbox e recibos | 03 | O01, O02 | A_FAZER | NAO_EXECUTADA | PENDENTE | NAO_PUBLICADO |
| O04 | Regras e lembretes | 03 | O03, R01, R02 | A_FAZER | NAO_EXECUTADA | PENDENTE | NAO_PUBLICADO |
| O05 | Alertas e saúde | 03 | O02, O03, O04 | A_FAZER | NAO_EXECUTADA | PENDENTE | NAO_PUBLICADO |
| O06 | Limites e uso de IA | 03 | S03, S05, O01, R02 | A_FAZER | NAO_EXECUTADA | PENDENTE | NAO_PUBLICADO |
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
