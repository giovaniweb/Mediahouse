# O05 — Saúde, alertas e ações individuais

Base e00b416; checkout nuflow-melhorias, branch melhorias/execucao-auditoria. Implementação local, sem deploy ou mensagem real.

## Evidências na interface

Configurações e Saídas compartilham um painel: conexão reportada, última entrada persistida na inbox, aceitação pelo provedor, recibos de entrega/leitura e último trabalho encerrado na fila. Corpo, telefone, credenciais e tokens de lease não são devolvidos. Conexão reportada não garante sessão atual nem entrega. Ausência de tráfego não equivale a falha.

Aceitação usa tentativa aceita ou recibo correlacionado. Recibos precisam corresponder à empresa, instância, ID de mensagem e hash do destinatário da intenção. Recibo órfão ou de outra empresa não comprova entrega. A leitura do indicador lateral é local, sem polling da Evolution. Erro retorna indisponibilidade, não zero. Foram removidas afirmações não comprovadas sobre reinícios e perda de mensagens.

Detalhes de cada saída mostram origem, tipo de destinatário, referência de suporte e até cinco tentativas normalizadas. Os detalhes não expõem conteúdo sensível. Interface autenticada não foi ensaiada visualmente; estados de API foram exercitados por testes.

## Heartbeat e atraso

Os crons agentes e whatsapp-inbox registram início/término por empresa em AgenteExecucao, prefixo heartbeat:. Registro técnico separado da execução comercial O04. Contadores de etapas concluídas, falhas e jobs pendentes não são contagem de mensagens entregues. Falha é sanitizada; exceção não deixa sucesso falso. Falha parcial inclui bloqueio antes da rede, como contrato de envio não homologado. Um banco indisponível pode impedir a própria batida; monitor externo continua L02.

`AUTOMACOES_CADENCIAS_MINUTOS` aceita JSON com minutos inteiros de 1 a 10080 por consumidor. Chaves: whatsapp-inbox e agentes:alertas/monitor/prazos/lembretes/cobranca/briefing/vistoria/limpeza. Preencher conforme o agendamento real; não foi configurado aqui. Sem configuração, atraso não é avaliado. Mais de dois intervalos desde o início indica atraso; execução aberta há mais de dez minutos indica possível interrupção. Sem batida, mostrar sem registro, sem inventar histórico.

Aviso de atraso é calculado no painel, sem IA ou mensagens externas. Heartbeat comprova invocação, não entrega ou efeito comercial. Limpeza continua suspensa até M04. Agendador precisa continuar nextCursor; nenhum cron foi criado. Volume e retenção de AgenteExecucao precisam medição em L01/L02.

## Ações individuais

- Pausar: aguardando, dentro da validade; não interrompe rede iniciada.
- Retomar: aguardando/pausada e válida; nova revisão/job, conservando backoff. Repetição concorrente não duplica envio.
- Cancelar: aguardando ou falha, individualmente; preserva trilha.
- Tentar novamente: conserva permissão, motivo, limite, validade e destinatário de O03. Desconhecido/aceito/entregue/lido não permitem reenvio.

As ações novas exigem gerenciarConfig. Lock da empresa é compartilhado com a preparação do worker; pausa invalida revisão antiga. Após checkpoint de envio, estado desconhecido impede intervenção. Ação e auditoria são atômicas. Pausa não prorroga validade; cancelamento vale para aquela intenção, não desativa regra futura.

Migração 20260929080000_pausa_saida_whatsapp: coluna pausada default false, sem alterar enum ou grants. Aplicada apenas no PostgreSQL descartável.

## Alertas e autorização

Leitura exige verAlertas, empresa atual, escopo de demandas próprias e áreas quando aplicável. Filtros de tipo, responsável e idade combinados com AND; páginas de 50, cursor por ID. Responsável pode ser membro, editor ou videomaker externo vinculado, com IDs distintos. Seletores só mostram nomes da empresa, sem dados de contato; visão restrita conserva escopo de leitura.

Cartão mostra problema/próxima ação; detalhe mostra origem, data, responsável, demanda e ações. Resolver/ignorar/silenciar exigem também gerenciarConfig e o mesmo escopo. Snooze limitado a intervalos conhecidos; mutações auditadas. Regra ainda verdadeira pode reabrir alerta resolvido no próximo ciclo (O04); ignorar suprime aquela chave. Ordenação é estável por ID, não um ranking global de gravidade.

Erro de carregamento não vira Tudo certo. Vazio significa apenas ausência de alertas naquele filtro. Consulta de saúde completa exige gerenciarConfig; indicador básico exige vínculo autenticado. APIs retornam no-store.

## Validação

- 684 unitários/53 arquivos; 190 integrações/14 arquivos; 23 runtime sem bypass: aprovados.
- Conexão sem tráfego, aceite sem recibo, recibo órfão/outra empresa, erro 503, heartbeat parcial/erro/cadência, pausa concorrente, retomada sem duplicidade, cancelamento, validade, auditoria, permissões, filtros, paginação e responsável externo.
- Runtime: leitura de recibos correlacionados, pausa auditada e isolamento de heartbeat. WhatsApp simulado, nenhuma chamada real.
- TypeScript, lint sem erros, auditores tenancy/perfil, grants/RLS e diff check aprovados. Nove avisos preexistentes em Configurações; face-api preexistente no build.
- Build inicial passou com cache webpack temporariamente desabilitado. Repetições finais atingiram ENOSPC ao gravar .tsbuildinfo e criar .next/static, mesmo após remover os artefatos locais. **Build final pendente até liberar espaço.** Nova repetição de runtime também não iniciou a suíte; a prova anterior de 23 testes permanece registrada nesta tarefa. next.config.ts foi restaurado, sem alteração no commit. Só caches/artefatos gerados desta tarefa foram removidos. Logs /private/tmp/nuflow-o05-*.log.

Próximo: O06 — limites concorrentes e medição de IA por empresa/operação. Pendências: Evolution real, agendador/cadência, benchmark e retenção das batidas, ensaio visual e recortes S01/S02/S03.
