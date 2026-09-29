# O03 — Outbox, tentativas e recibos do WhatsApp

Implementado em 29/09/2026 sobre `26422dc`, no checkout `nuflow-melhorias`, branch `melhorias/execucao-auditoria`. Validação local isolada; nenhuma publicação ou mensagem real.

## Comportamento

- Uma intenção identifica empresa, origem, referência, destinatário, validade e chave única. Tentativas são filhas e não aumentam o contador de intenções. Corpo e telefone ficam cifrados por sete dias; a limpeza conserva chaves, tentativas e recibos. A limpeza depende da execução do consumidor, inclusive para empresas pausadas.
- Criação da intenção e do job é atômica. As respostas locais de SIM/NÃO da inbox são criadas na mesma transação que processa o convite. Outras conversas continuam aguardando O06/U03; isto não restaura a secretária completa.
- Envio manual exige `gerenciarConfig`, destinatário vinculado e UUID reaproveitado pelo cliente ao repetir o mesmo pedido. HTTP 202 confirma persistência, não entrega. Alterar número/texto gera uma nova chave.
- Antes da rede, o consumidor revalida empresa, versão, validade, configuração e destinatário, grava tentativa e marca resultado desconhecido. A chamada externa acontece fora da transação. Só o lease vigente pode registrar a resposta. Uma retomada não repete envio já iniciado.
- Até cinco tentativas por intenção. HTTP 400 e demais recusas permanentes encerram a tentativa; 429/5xx sem ID usam backoff exponencial, Retry-After limitado a 24 horas e validade. Não se alterna o nono dígito depois de erro. Timeout, erro de rede ou sucesso sem ID ficam desconhecidos e não permitem reenvio pelo botão.
- Aceitação com ID, entrega e leitura são estados distintos. Recibos autenticados usam empresa + instância + ID do provedor + hash do telefone. Recebimento anterior à resposta HTTP, repetição e ordem invertida não regridem leitura. Estados suportados: SERVER_ACK, DELIVERY_ACK, READ e PLAYED. Outros formatos/status são ignorados explicitamente.
- Nova tentativa manual exige motivo controlado, permissão, validade, vínculo atual e limite disponível; registra auditoria. Não reenvia histórico legado nem resultados desconhecidos. O histórico antigo não vira prova de entrega.
- Tela de saídas exibe contadores separados, estado, causa, última tentativa, HTTP e próxima tentativa, sem conteúdo sensível. Erro de carregamento não aparece como lista vazia. Detalhamento de origem/destinatário e painel de saúde completo continuam O05.

## Contrato e ativação

Referência de implementação: Evolution API **2.3.7**, não a versão comprovada da instalação real. Conferidos o [DTO oficial de envio](https://raw.githubusercontent.com/EvolutionAPI/evolution-api/2.3.7/src/api/dto/sendMessage.dto.ts) e o [emissor oficial de recibos](https://raw.githubusercontent.com/EvolutionAPI/evolution-api/2.3.7/src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts). O envio usa number/text; o recibo usa keyId/remoteJid/fromMe/status. Não foi identificado um contrato de idempotência do provedor no DTO consultado.

O worker exige `WHATSAPP_EVOLUTION_CONTRATO=2.3.7`. **Não definir em produção apenas para liberar o envio:** primeiro confirmar instalação e payloads sanitizados e realizar ensaio autorizado L02. Se a versão instalada diferir, adaptar e testar o contrato correspondente. Sem essa configuração a intenção falha com `contrato_nao_validado`, sem chamada externa, podendo ser retomada dentro da validade após correção.

Migração nova: `20260929060000_outbox_whatsapp`, aplicada somente no PostgreSQL descartável. RLS nas três tabelas; runtime sem DELETE de saídas/tentativas e recibos append-only. Perfil de autenticação não acessa essas tabelas. Configuração do webhook passa a incluir MESSAGES_UPDATE; registro no provedor ainda não executado.

O consumidor técnico existente processa uma saída por empresa/chamada, com limite global de dois leases por empresa herdado de O01. A rota paginada tem orçamento de início de 20 segundos e retorna nextCursor; o agendador deve continuar até null e repetir ciclos. `after` é apenas aceleração. Não foi criado agendamento real; frequência, volume e acompanhamento operacional devem ser validados em L02.

## Limites que o próximo executor precisa preservar

1. O adaptador legado `sendWhatsappMessage` deduplica por conteúdo/número/referência/dia UTC, mas sua intenção não é atômica com as mutações originais. Isto não substitui chave por fato/revisão. **O04 deve migrar produtores e contadores**, inclusive textos legados que ainda chamam agendamento de envio. Para avisos ligados a demanda, mudança posterior em updatedAt cancela conservadoramente a saída; regras específicas de cancelamento/resolução pertencem a O04.
2. Destinatários manuais/legados precisam de identidade vinculada à empresa. Resposta de inbox só usa número e instância da entrada autenticada, sem conceder acesso a dados. Contatos externos sem vínculo não passam pelo adaptador genérico; seus produtores precisam autorização explícita.
3. Crash após preparação ou lease vencido pode deixar resultado desconhecido mesmo sem envio efetivo. Se a resposta tardia com ID não puder ser gravada, não há correlação automática por conteúdo/telefone. Preservar bloqueio de reenvio e investigar no provedor; consulta/reconciliação manual sem ID não foi implementada.
4. Não existe promessa de exactly-once externo. Retry de 5xx segue a política do plano, mas depende do comportamento do provedor. Recibos com ID conhecido podem resolver uma resposta inconclusiva; sem ID não se presume entrega ou falha.
5. E-mail não compartilha esta outbox. Não ativar isoladamente sem revisar as dependências O04/O06/U03 e os recortes abertos S01/S02/S03. Segredos/configuração existentes não foram exportados.

## Evidências locais

- 677 testes unitários; 169 integrações em 12 arquivos, incluindo 14 provas da outbox; 21 testes runtime com login sem bypass.
- Cobertura de rollback, duplicidade concorrente, 400, 429/Retry-After/limite, 503, timeout, falta de ID, bloqueio de contrato, recibo tardio/pré-resposta/repetido/fora de ordem, destinatário alterado, empresa pausada, validade e configuração ausente.
- Reenvio concorrente com auditoria única, APIs sem conteúdo sensível, resposta da inbox e isolamento/grants reais no PostgreSQL descartável.
- Build webpack, TypeScript, lint sem erros, auditores de tenancy/perfil e diff check. Dez avisos de lint em trechos preexistentes das telas de configuração/IA; aviso preexistente de dependência dinâmica face-api no build.
- Sem ensaio visual autenticado, acesso ao banco real, chamadas pagas ou envio externo. Logs locais `/private/tmp/nuflow-o03-*.log`.

Próximo cartão: **O04 — regras determinísticas, lembretes e relatórios recorrentes sem IA nas verificações**. Utilizar criarSaida na mesma transação do fato com chave de regra/revisão, preservar revalidação de objeto e não tratar agendamento como mensagem entregue.
