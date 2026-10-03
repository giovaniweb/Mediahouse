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

Relatórios de eventos e coberturas agora são resumos determinísticos, sem chamada paga: checklist, demandas e documentos no evento; arquivos por pessoa/dia na cobertura. Contagens não geram notas de desempenho, qualidade ou retorno. O helper legado analisarComClaude, sem consumidores, foi removido.

O resumo de evento separa previsão, realizado informado e custos audiovisuais; não soma registros potencialmente sobrepostos nem interpreta ausência como zero. Só consulta/exibe financeiro com verFinanceiroEvento; o agregado audiovisual exige adicionalmente verCustos. O recorte S03-EVENTOS-FINANCEIRO.md agora aplica a mesma separação ao detalhe/lista/painel e protege orçamento/custos. Documentos, aprovações e outras dívidas do módulo continuam explicitamente pendentes.

A cobertura mantém histórico em RelatorioIA com modelo regras-v1, tokens zero e categoria legada semanal/periodo cobertura-ID. O histórico genérico preserva o JSON, mas não apresenta todos os novos campos e mantém sua restrição anterior para usuários sem verCustos. O evento mantém resposta e log de geração, sem persistir o corpo do resumo.

A importação de briefing permanece opcional, agora pelo adaptador ia-briefing.ts e pelo orçamento central. Exige vínculo ativo e verEventos ou verCoberturas conforme o destino; o destino não escolhe empresa. Arquivo até 3 MiB e corpo multipart até 3 MiB + 64 KiB, verificados na leitura real. Antes da rede reserva 29.120 tokens (24.000 entrada + 4.096 saída + 1.024 margem); conta o pedido completo e só gera com estimativa até 20.000 tokens de entrada. Não confundir bytes binários com tokens. EntradaBytes da política/consumo mede o prompt textual; limite binário é separado e fixo no adaptador.

A contagem não é uma geração paga e sua estimativa pode diferir do uso real. A reserva antecede a contagem para proteger simultaneidade e opt-out. Falha/excesso antes do checkpoint libera reserva; falha após checkpoint conserva débito desconhecido. Sem retry automático nem fallback de modelo. O uso real, inclusive acima da reserva, é contabilizado integralmente. Schema valida datas reais/período, enums, tamanhos e listas; saída truncada ou inválida não preenche formulário nem dispara segunda chamada. Dados continuam sujeitos a revisão humana, sem criar evento automaticamente.

Consumidores de eventos, coberturas e campo informam 3 MB e revisão; campo permite preenchimento manual em qualquer erro. PDF e resposta bruta não são gravados nos logs de consumo. O PDF é transmitido ao provedor na contagem e na geração. Não há parser local nem limite próprio de páginas: estrutura/criptografia são avaliadas pelo provedor, e o teto de conteúdo é por tokens estimados. Homologação com PDF real, qualidade de extração/OCR e ensaio visual autenticado pendentes; os testes usam provedor falso.

Referência técnica consultada: [contagem de tokens da Anthropic](https://platform.claude.com/docs/en/build-with-claude/token-counting), suporte a PDF e estimativa anterior à geração. Os limites acima são decisões do produto, não limites oficiais do provedor.

Não reconstruir chat/agentes ou notas automáticas. Cache e preços datados O06 continuam pendentes para os caminhos que permanecerem. A política já pode ser ajustada com auditoria no painel de consumo existente. Sem telemetria real, a avaliação é de responsabilidade no fluxo, não de popularidade medida.

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


## Ajuste simples dos limites — 29/09/2026

- Base 1ce2f47. Em Relatórios > Consumo de IA > Ajustar limites: habilitada, tokens por dia UTC (0–1.000.000) e simultaneidade (1–5). Sem página ou agente novo; parâmetros técnicos de entrada/saída preservados.
- PATCH /api/ia/politica exige gerenciarConfig e vínculo atual. Empresa/ator vêm da sessão; body estrito não aceita organização, usuário, saldos ou campos técnicos.
- Lock da organização compartilhado com reserva/checkpoint; antes/depois e ator registrados em configuracao.alterada / politica_ia na mesma transação. Falha de auditoria reverte a edição. Payload numérico permitido explicitamente; retenção segue a auditoria existente, sem promessa de armazenamento imutável/perpétuo.
- Cliente envia valores anteriores: se política efetiva divergir, retorna 409 e exige reabrir edição com dados atuais. Repetição que já coincide com os valores atuais não grava evento duplicado. É comparação de valores efetivos, não versionamento de cada edição intermediária.
- Desativar impede reservas/checkpoints futuros; envio já iniciado pode concluir. Reduzir abaixo do gasto mantém consumo e reservas, bloqueando novas chamadas. Não zera débitos desconhecidos. Tokens não equivalem a teto monetário exato.
- 687 unitários, 261 integrações, build webpack/tipos, lint sem avisos nos arquivos alterados e auditores aprovados. Sem migração nova, IA paga, produção ou deploy. Ensaio visual autenticado pendente.
