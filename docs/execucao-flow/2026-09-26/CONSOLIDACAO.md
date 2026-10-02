# Consolidação das decisões anteriores

Execução: `melhorias/execucao-auditoria`, main 7750b33. Os planos são contratos e evidência histórica; suas afirmações de funcionamento não substituem teste atual.

## Fontes cruzadas

- PLANO-VIRADA-PRODUCAO.md, RLS-PLANO-DE-VOO.md, DIAGNOSTICO-SAAS.md, ESTADO-ATUAL.md e SEGURANCA.md.
- PLANO-ESPELHAMENTO-CROSS-TENANT.md; NUFLOW_JOB_WORKFLOW_CODEX_CLAUDE_v1.1.md prevalece sobre a versão v1.
- AUDITORIA-JOB-WORKFLOW.md e AUDITORIA-PERMISSOES.md do checkout original; docs/auditoria-upload-videos.md.
- Auditoria de 26/09 e pacote de sete cadernos de execução.
- Inventário, Kanban, dashboard, agenda/aprovações, pessoas/configurações, migração de layouts, protótipo v8, empresas/perfil e validação local do preview. Esse checkout continua recebendo trabalho: reconferir seu diff antes de transportar cada trecho.

## Regras preservadas

1. Job é Demanda; StatusInterno é fonte da verdade; JobPhase é derivada. Não criar outro fluxo concorrente. Cancelado/expirado/encerrado não vira entrega bem-sucedida só por estar fora da fila. Preservar Para Postar.
2. Parceria aceita permite novos compartilhamentos. Encerrar parceria não revoga automaticamente cards antigos: revogação é explícita por card. Empresa inativa não autoriza seus usuários. Ajustar leitura de U04/L01 a essa decisão anterior.
3. O endpoint de espelhamento é `espelhar`; `compartilhar` trata link público. Ownership permanece na origem; custos/fiscal não são compartilhados e métricas contam a origem uma vez.
4. Permissão explícita vence o preset. Ausência de linha herda papel do vínculo, sem backfill no GET. Falha de banco nunca equivale a ausência de restrição.
5. RLS usa contexto por transação; não criar pools por empresa. Não repetir a mudança de região já feita nem apagar o projeto antigo de Storage por suposta sobra.
6. Menu compacto atual do preview foi aprovado; preservar agrupamentos. Protótipo v8 orienta apresentação, não inventa métricas. Reaproveitar seletivamente Tabela/importação removidas, Hoje/Meu trabalho, detalhes, perfis e acessibilidade após compatibilizar contratos de API.
7. Upload direto e progresso real continuam objetivos; conversão pesada vai para worker, prévia MP4 H.264/AAC e original preservado. MP3 serve apenas para áudio.
8. Reusar notificações/alertas existentes. Regras e relatórios numéricos não precisam de LLM. IA fica para interpretação e sugestões autorizadas.
9. Publicação e migrações seguem preparação/ensaio antes do release. Não transferir segredos nem assumir que preview usa banco isolado.

## Achados adicionais durante implementação

- PATCH de parâmetros não tinha capacidade administrativa; corrigido nesta fatia.
- Configuração WhatsApp devolvia apiKey no POST e webhookSecret por spread no GET; corrigido com allowlist.
- GET de permissões materializava preset como exceção individual; removido efeito de escrita.
- Identidade global podia ser alterada por gestor de uma das empresas; nova barreira protege usuários multiempresa e superadmin. Contagem de vínculos para operação global não pode usar cliente filtrado pela RLS da empresa.
- Trello usa cache/env global em algumas rotas, com resposta de credenciais; precisa retirar ou migrar esse legado antes da certificação SaaS. O novo guard não resolve esse problema sozinho.
- Relatórios existentes misturam dados financeiros e operacionais: temporariamente exigem também verCustos. R02 deve separar apresentação autorizada sem esconder ausência como zero.
