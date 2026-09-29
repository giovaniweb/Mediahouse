# Decisão de produto — IA essencial, 29/09/2026

Diretriz explícita do responsável: simplificar antes de investir em mais agentes. Esta decisão substitui a proposta de migrar chat/triagem autônoma/loops para o novo orçamento. Não reativar esses recursos apenas para concluir itens antigos de O06 ou U03.

## O que permanece

| Necessidade | Solução |
| --- | --- |
| Saber o que atrasou, parou ou aguarda aprovação | Regras determinísticas, exibidas em Alertas e ligadas à demanda |
| Conferir pendências agora | Uma ação Verificar pendências em Alertas, para quem administra a empresa |
| Lembretes e acompanhamento do fluxo | Rotinas O04 existentes, sem LLM; saúde e saída acompanhadas pelos registros O05 |
| Consultar resultados | Indicadores e snapshots sem IA por padrão, resumos semanal/mensal |
| Interpretar um relatório quando necessário | Opt-in explícito por geração, com orçamento e consumo O06 |

IA deve ajudar a interpretar, não ser necessária para saber datas, status, responsáveis, totais ou pendências.

## Retirado neste recorte

- Central IA sai do menu; /ia redireciona para Alertas, com a capacidade de leitura do destino.
- Chat geral, streaming e vitrine de agentes removidos da página. POST /api/ia/chat mantém autenticação/capacidade e responde 410 para clientes antigos; não chama modelo nem ferramentas.
- Testar Secretária IA eliminado: apenas repetia o monitor, não testava uma secretária conversacional.
- Triagem autônoma /api/ia/agentes/triagem encerrada com 410, sem criar execução. Não havia consumidor na interface encontrado no código. Isso não é uma medição de uso de produção.
- Loop executarAgenteComTools, catálogo de ferramentas e prompts de secretária sem consumidores ativos removidos de claude.ts. Serviços de autorização/execução de ferramentas e testes S05 permanecem como base existente; não há agente LLM ativo chamando-os.
- Quatro atalhos de relatórios especializados retirados da geração principal; ficam semanal e mensal. Histórico e tipos antigos continuam legíveis, sem apagar registros.
- Nomes de Alertas deixam de sugerir uso de IA. O monitor manual usa verAlertas + gerenciarConfig, sem exigir permissão da antiga Central.

## Relatórios sem dependência de IA

analiseIA é booleano, false por padrão e exigido como true para chamar o adaptador. Não há reserva de tokens no caminho padrão. A caixa opcional vale para a próxima geração e é desmarcada após a tentativa. Um cliente antigo que não envia o campo recebe relatório determinístico, não chamada paga implícita.

O painel de consumo sai da Central e fica recolhido em Relatórios, com gerenciarConfig e cobertura parcial explícita. As regras continuam no cron existente, sujeito à validação operacional L02; nenhuma nova agenda externa foi configurada.

## Ainda avaliar antes de manter ou ampliar

Análise pontual de demanda possui botões no detalhe/aprovações; ideias individual/lote, briefing e relatórios de eventos/coberturas também têm caminhos próprios. Permanecem nesta revisão para preservar esses fluxos enquanto se decide seu valor. Ter consumidor no código não comprova frequência real de uso.

Próximo recorte: inventariar esses pontos no contexto de trabalho e decidir retirar, substituir por regra ou manter como ação opcional. Só os mantidos devem migrar ao orçamento. Não construir um novo chat nem um painel de agentes para substituir o removido. Cache, preços datados e política auditada O06 continuam pendentes para os caminhos que permanecerem.

Secretária conversacional, planejamento por WhatsApp e agentes que escolhem ações ficam como evolução futura sujeita a necessidade validada. Entrada durável, aceite SIM/NÃO e saída WhatsApp já implementados não foram removidos.

## Validação local

- 687 unitários, 215 integrações e build webpack aprovados; tipos/lint sem erros e auditores de escopo aprovados.
- Novas provas: sem opt-in e opt-out explícito não reservam/chamam provedor; chat/triagem encerrados não criam execução nem consumo; monitor opera sem verIA, exige capacidade operacional e não envia mensagens.
- Provas O04 existentes preservam cron, deduplicação, alertas e relatórios determinísticos. Nenhuma migration nova; nenhuma exclusão de dados.
- Logs /private/tmp/nuflow-simplificar-ia-*.log. Lint conserva avisos preexistentes nas telas; face-api conserva aviso no build. Sem ensaio visual autenticado, tráfego de produção, mensagem, chamada paga ou deploy.

O06 e U01 continuam parciais; esta decisão não encerra a auditoria inteira.
