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

Revisão seguinte, base b6bf7f2: retiradas a recomendação automática de aprovação de demanda e a pontuação de ideias, individual e em lote. Cadastro, revisão humana, status e conversão de ideias continuam. Os três endpoints antigos exigem sessão/capacidade e retornam 410 sem chamar modelo ou alterar registros.

As notas deixam de aparecer como critério principal dos cards e da ordenação da interface. Análises salvas ficam recolhidas no detalhe como referência histórica; sem apagar campos. Conversão em demanda não aplica mais sugestaoTipo/sugestaoPrioridade antigos: respeita o tipo explícito ou social_media e inicia com prioridade normal, ajustável no fluxo humano.

Ainda existem três caminhos pagos de eventos/coberturas: importação de briefing, relatório de evento e relatório de cobertura. São candidatos a permanecer por reduzirem leitura/digitação e sintetizarem um trabalho concluído; não foram homologados nem migrados ao orçamento neste recorte. Próxima ação: verificar autorização/dados/finalidade, consolidar o que for duplicado, manter geração determinística por padrão e usar IA opcional apenas onde agregar. A importação de documento exige limites próprios; não enviar mídia pelo adaptador atual de texto.

Não reconstruir chat/agentes ou notas automáticas. Cache, preços datados e política auditada O06 continuam pendentes para os caminhos que permanecerem. Sem telemetria real, a avaliação é de responsabilidade no fluxo, não de popularidade medida.

Secretária conversacional, planejamento por WhatsApp e agentes que escolhem ações ficam como evolução futura sujeita a necessidade validada. Entrada durável, aceite SIM/NÃO e saída WhatsApp já implementados não foram removidos.

## Validação local

- 687 unitários, 215 integrações e build webpack aprovados; tipos/lint sem erros e auditores de escopo aprovados.
- Novas provas: sem opt-in e opt-out explícito não reservam/chamam provedor; chat/triagem encerrados não criam execução nem consumo; monitor opera sem verIA, exige capacidade operacional e não envia mensagens.
- Provas O04 existentes preservam cron, deduplicação, alertas e relatórios determinísticos. Nenhuma migration nova; nenhuma exclusão de dados.
- Logs /private/tmp/nuflow-simplificar-ia-*.log. Lint conserva avisos preexistentes nas telas; face-api conserva aviso no build. Sem ensaio visual autenticado, tráfego de produção, mensagem, chamada paga ou deploy.

O06 e U01 continuam parciais; esta decisão não encerra a auditoria inteira.


## Validação da retirada contextual — 29/09/2026

- Base b6bf7f2; 687 unitários e 217 integrações aprovados, incluindo retirada sem consumo, histórico preservado/legível, conversão sem herdar sugestão antiga e gates 401/403.
- Build webpack/tipos, lint sem erros e auditores de escopo aprovados. Dez avisos preexistentes nas telas e aviso face-api no build. Sem ensaio visual autenticado.
- Logs /private/tmp/nuflow-ia-contexto-*.log. Sem migration, exclusão de registros, mensagem, IA paga ou deploy.
- O06/U01 permanecem parciais. A conversão de ideias mantém questões anteriores (alocação de código e atomicidade), fora deste recorte; este teste prova o caminho simples, não concorrência da conversão.
