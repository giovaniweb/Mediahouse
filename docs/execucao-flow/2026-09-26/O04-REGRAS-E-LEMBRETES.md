# O04 — Regras, lembretes e relatórios sem LLM

Implementado em 29/09/2026 sobre `3b804ea`, no checkout `nuflow-melhorias`, branch `melhorias/execucao-auditoria`. Validação local isolada; sem deploy, mensagem real ou chamada paga.

## Comportamento entregue

O cron de agentes e as ações manuais Gerar Alertas, Monitor, Prazos e Vistoria usam agora o mesmo serviço determinístico. Não importam nem chamam o cliente de IA. Conversa, triagem assistida e geração textual sob demanda continuam em seus caminhos próprios e dependem de O06 para orçamento; não foram desativadas globalmente.

| Regra v1 | Condição | Resolução / validade |
| --- | --- | --- |
| Prazo vencido | Demanda aberta, data de calendário anterior ao dia brasileiro atual | Conclusão, encerramento ou alteração de prazo |
| Prazo próximo | Demanda aberta, prazo hoje ou amanhã | Prazo mudou, venceu ou demanda fechou |
| Sem movimento | Demanda aberta, sem atualização há pelo menos três dias | Atualização ou fechamento |
| Aprovação interna | Estado aguardando aprovação/urgência pendente | Saída desses estados |
| Sem arquivo final | Audiovisual finalizado, sem link final nem Arquivo final | Anexação de final, link ou reabertura; não aplica a Growth/design |
| Captação | Aberta, captação nas próximas 24 horas | Mudança de revisão, cancelamento, conclusão ou início |
| Lembrete de agenda | notificarEm vencido e evento ainda não começou; agendado/confirmado | Mudança de horário/responsável/conteúdo/status, cancelamento ou início |
| NF pendente | Custo não pago, pendente_nf, data de vencimento alcançada | NF recebida, pagamento, contestação ou alteração do registro |

Prazo próximo é uma janela por **dia de calendário**, não uma promessa de exatamente 24 horas. Captação usa intervalo de 24 horas. Lembrete de agenda usa minutos precisos.

Alertas têm chave única por empresa/demanda/regra/versão. Repetições não duplicam; condição resolvida fecha o alerta, e recorrência reabre o mesmo registro. Alertas ignorados continuam ignorados. O resolvedor legado não interfere nessas chaves; continua saneando tipos antigos, sem reinterpretar automaticamente todo o histórico como regras v1. Alertas antigos e novos podem coexistir durante a transição.

Demandas, eventos e custos são percorridos em páginas de 100, sem limite silencioso de 25. A ferramenta de busca assistida continua limitada pelo seu contrato de consulta, mas agora combina status, atraso e parada com AND. As regras não dependem dessa ferramenta nem de limites do modelo.

## Agenda e responsáveis

A migração adiciona `Evento.notificarEm`, recalcula os eventos existentes e instala trigger que sempre deriva `inicio - max(0, lembreteMinutos)`, inclusive para escritores legados e atualizações diretas. O serviço usa o horário vencido e consome atraso do cron enquanto o evento ainda não começou. Evento iniciado não dispara aviso tardio.

A revisão do lembrete é hash de horário, duração, minutos, responsáveis, status, título, local e privacidade. Uma revisão tem uma intenção por telefone, inclusive se atravessar a meia-noite. Alterar responsáveis/horário cancela intenções antigas aguardando envio. Os perfis explicitamente atribuídos de editor/videomaker são resolvidos dentro da empresa; sem esses perfis, usa o usuário responsável. Telefones iguais são deduplicados. Ausência de vínculo/número não vira sucesso: aparece em semDestinatario. Contato externo arbitrário não recebe autoridade.

`lembreteEnviado`, `ultimaCobrancaEm` e `qtdCobranças` antigos não são atualizados como se agendamento fosse entrega. Evidência atual mora nas intenções, tentativas e recibos de O03. A janela de ±15 minutos e a falsa marcação de envio sem telefone foram removidas.

## Envio e cobrança

Regra/intenção/job são gravados na mesma transação por objeto, com lock da empresa, chave persistida e contexto mínimo de revalidação. Antes da rede, o consumidor confere novamente condição, revisão, atividade da empresa e identidade do destinatário. Pagamento, conclusão ou alteração posterior anulam o aviso ainda não enviado. Não é possível desfazer uma chamada externa que já começou; a fronteira de revalidação é a preparação do envio, fora de transação de rede.

Prazos escolhem um aviso prioritário por demanda/dia/revisão (vencido, próximo, sem movimento), evitando três cobranças simultâneas pelo mesmo estado. Avisos de aprovação e falta de final ficam na central. Revisões de demandas e custos usam updatedAt, uma invalidação conservadora: alterações até não relacionadas exigem uma nova avaliação. Dia brasileiro participa da chave dos lembretes diários; o evento usa apenas sua revisão.

**Correção de domínio:** CustoVideomaker representa obrigação da empresa com o prestador. A rotina não pede ao videomaker que pague essa dívida. Ela solicita apenas a NF pendente, sem valor ou detalhes financeiros no WhatsApp. Pagamento/nota recebida/contestação bloqueiam o aviso. Escalada financeira e conciliação pertencem a C01–C03.

O briefing avisa gestores/admins ativos sobre a quantidade de alertas e remete à central. Não expõe valores, nomes ou detalhes em resumo genérico. Vínculo de gestor é revalidado antes do envio. Ações manuais globais exigem verIA + gerenciarConfig; Vistoria exige também verRelatorios. VerIA isoladamente não concede disparos sobre toda a empresa.

## Relatórios e custo

A vistoria recorrente grava dois snapshots operacionais R01/R02, audiovisual e design, para a **semana anterior fechada (segunda a domingo, São Paulo)**. Chave: empresa/área/início/fim/versão. Repetição ou concorrência não recria relatório nem aviso. Snapshot preservado, tokens zero, modelo regras-v1. O texto é um resumo dos números, sem análise inventada e sem custos financeiros. A criação do relatório e da intenção de avisar os gestores participa da mesma transação.

Empresas inativas ou `Organizacao.ambienteTeste=true` não executam regras comerciais. Sem objetos elegíveis ou pendências a encerrar, a rotina retorna sem_atividade e não cria AgenteExecucao. O campo ambienteTeste é novo, false por padrão: identificar e marcar explicitamente empresas de teste na preparação L02; não deduzir pelo nome/slug. O04 não mede preço de IA; reduz chamadas dessas rotinas a zero. O06 continua responsável pelas demais chamadas.

## Limpeza e operação

A antiga rotina limpeza removia referência de brutos baseada em aviso sem comprovação. Foi suspensa com retorno explícito limpeza_automatica_suspensa_ate_M04. Nenhum arquivo ou link histórico foi removido nesta etapa. Definição de retenção, biblioteca e arquivamento de 30 dias continua M04; este cartão não presume autorização para eliminar mídia.

Cron aceita apenas as rotinas conhecidas e retorna erros locais sanitizados, estado parcial e nextCursor. Empresas são paginadas em lotes de dez; o agendador deve continuar o cursor e repetir ciclos. Cada empresa percorre suas páginas até o fim; não há checkpoint durável de cursor interno. Interrupção pode exigir nova varredura, com efeitos deduplicados por chave. Benchmark de volume/cadência e retomada operacional do agendador permanecem L01/L02. Nenhum cron novo foi configurado.

O03 ainda exige homologação do contrato Evolution real antes de liberar envios. Esta etapa não confirma conexão, recebimento ou entrega no provedor. O05 fará a apresentação completa de saúde, falhas parciais e origem das intenções. Não há promessa de exactly-once externo.

## Migração e evidências

Migração `20260929070000_regras_deterministicas`: campos de chave nos alertas/relatórios, contexto de regra na saída, campo de empresa de teste e horário derivado/índice/trigger na agenda. Usa RLS/grants já existentes; nenhuma permissão de tabela nova. Aplicada somente no PostgreSQL descartável `127.0.0.1:55439/nuflow_test`.

- 682 unitários em 52 arquivos: regras de calendário/horário, eventos às 8h, 14h e 22h, cron atrasado, cancelamento, ausência de final aplicável e NF.
- 179 integrações em 13 arquivos: 103 demandas atravessando páginas, duas execuções simultâneas, resolução/reabertura, horário/responsável alterado, ausência de responsável, custo pago antes do envio, conclusão antes da rede, snapshots por área deduplicados, autorização e filtros combinados.
- Falha sintética ao cifrar comprovou rollback de alerta/intenção e retomada. Adaptador de IA lança erro se invocado nos testes das regras; nenhuma chamada ocorreu.
- 22 runtime sob login sem bypass: trigger de notificarEm, rejeição de horário derivado adulterado, intenção por regra e isolamento entre empresas. Verificador de grants/RLS aprovado.
- Build webpack, TypeScript, lint sem erros, auditores tenancy/perfil e diff check. Um aviso de lint preexistente na tela de IA; aviso face-api preexistente no build. Revisão própria, sem ensaio visual autenticado. Logs /private/tmp/nuflow-o04-*.log.

Próximo cartão: **O05 — saúde e alertas**, mostrando conexão, entrada, intenção, aceitação e recibo como fatos distintos, além de ações auditadas sobre a intenção individual.
