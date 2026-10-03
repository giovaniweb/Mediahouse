# O02 — entrada WhatsApp durável

Implementação local em 29/09/2026, base 9bfe28e. Migração 20260929050000_inbox_whatsapp aplicada apenas no PostgreSQL descartável. Nenhum envio real, chamada paga, configuração remota ou deploy.

**Não publicar este cartão isoladamente:** o webhook legado executava conversa, downloads, transcrição, ferramentas de IA e envio inline. Esse caminho foi substituído por persistência e processamento local seguro. SIM/NÃO mantém a transição autorizada; confirmações, consultas conversacionais, cadastro guiado e respostas por IA ainda precisam de O03/O06/U03. Áudio/anexo fica com metadados, sem download/transcrição. Mensagens gerais ficam em aguardando_automacao, e não são fingidas como atendidas. O código anterior pode ser consultado na base 9bfe28e, sem religá-lo em paralelo.

## Contrato do provedor e pendência externa

A versão instalada da Evolution não foi identificada no repositório nem confirmada pelo usuário neste checkpoint. O registrador antigo contém compatibilidade alegada com v1.8/v2; isso não prova a versão em uso.

Referência primária consultada: [emissor oficial Evolution 2.3.7](https://raw.githubusercontent.com/EvolutionAPI/evolution-api/2.3.7/src/api/integrations/event/webhook/webhook.controller.ts). Ele forma envelope com event, instance, data e date_time e pode incluir apikey. Seu retry trata alguns erros 4xx como permanentes e tenta novamente erros transitórios. Não houve alteração do registrador nem das assinaturas remotas.

Fixture sintética: tests/fixtures/whatsapp/evolution-envelope-v1.json. Contrato interno evolution-envelope-v1 é a versão do nosso normalizador, NÃO declaração de versão do servidor. Campos de mensagens mantêm os caminhos usados anteriormente: data.key.id/remoteJid/fromMe, mensagem simples/estendida, respostas selecionadas e mídia. remoteJidAlt só é considerado dentro do evento autenticado; LID sem par permanece em revisão. Não inventar associação por nome/sufixo.

Antes da publicação: confirmar versão/imagem efetiva, exemplo sanitizado de evento direto e LID, conexões e retries. O limite do corpo é 2 MiB; ajustar o provedor para envio de metadados sem base64 depois de conferir seu contrato real. Payload maior retorna 413. Não considerar recepção real homologada.

## Recebimento

- Segredo obrigatório por x-webhook-secret ou ?s=, validado em tempo constante contra valor cifrado. Instância desconhecida, ambígua, segredo ausente/errado e empresa inativa falham fechadas.
- Bootstrap RLS usa whatsapp_instancia_org: função restrita que retorna só IDs de configuração/empresa. Não concede leitura global de credenciais. Após descobrir o escopo, o cliente normal lê a configuração e valida o segredo. Instância/empresa não são aceitas do corpo como autoridade.
- InboxWhatsapp possui unique (organização, instanceId canônico, providerMessageId). O alias instanceName resolve ao mesmo instanceId. A chave do job O01 é hash da instância/ID; não é prefixo no texto.
- Inbox e job whatsapp.entrada/v1 nascem na mesma transação. Duplicata devolve sucesso sem nova ação, conteúdo ou job. Erro de banco antes do commit responde 503 para permitir retry.
- HTTP 200 significa persistido/duplicado ou descarte explícito de evento não suportado/próprio/grupo. JSON ou mensagem inválida retorna 400; falha de autenticação retorna 401. Nenhuma exception bruta ou segredo é retornado.
- O payload normalizado da inbox é cifrado usando o mecanismo existente. Apenas texto limitado, remetente, par alternativo, nome e metadados mínimos de mídia; não copia apikey, URLs de mídia, base64, mediaKey ou envelope bruto.
- Connection.update exige a mesma autenticação e date_time válido. Atualização/alerta ficam na mesma transação e o timestamp impede regressão por evento atrasado. Recibos messages.update passam pela autenticação, mas são explicitamente não processados até O03.

## Processamento e retomada

- after() agenda tentativa após a resposta como otimização. A durabilidade vem do job, não da sobrevivência do callback.
- processarInbox reivindica até dois trabalhos por chamada respeitando o teto O01 por empresa. Usa concluirLocal: histórico, transição, resultado da inbox e conclusão ficam no mesmo commit.
- Antes do efeito: revalida organização (fila), configuração/instância, validade, identidade/vínculo atual e objeto. SIM/NÃO exige exatamente um convite pendente do videomaker; atualização condicional e histórico são atômicos.
- Não escolher convite criado/alterado depois do recebimento ou da data informada da mensagem. Timestamp do provedor, quando presente, limita o efeito; mensagem com mais de 24h ou excessivamente futura não aciona comando. Na ausência do timestamp, usa recebimento local (compatibilidade legada; não comprova data de envio).
- Número desconhecido não ganha usuário, vínculo, acesso a custos ou criação de demanda. LID sem telefone verificado fica em revisao. Não existe cache de associação confiado cegamente.
- Generalidades e mídia ficam em aguardando_automacao. O02 não abre pedidos por IA nem envia confirmação. O03 deve criar intenção de resposta idempotente junto ao efeito local, sem repetir comandos já concluídos.
- Novo GET /api/cron/whatsapp-inbox exige CRON_SECRET e processa sem IA ou rede externa. Até 20 empresas por chamada, cursor por ID e nextCursor na resposta; agendador deve percorrer páginas até null.
- O cron de agentes existente também tenta drenar a inbox por empresa ativa. Não foi criado agendamento novo no vercel.json. Configurar cadência e paginação do consumidor técnico em L02; os crons atuais diários não garantem atendimento em tempo real.
- Job expira após 24h, conteúdo após sete dias. Estado da inbox sozinho não representa saúde da fila: O05 precisa cruzar job/referência, tentativas e expiração.

## Retenção e dados legados

limparConteudoInbox remove, em lotes de 100 por empresa, o cifrado vencido e o conteúdo/telefone/metadados da cópia correspondente em MensagemWhatsapp. Mantém IDs/chave, resultado e vínculo de negócio para deduplicação. O consumidor técnico faz limpeza também de empresas pausadas; o cron legado percorre só ativas. Limpeza física depende de execução periódica: prazo define elegibilidade, não garantia de apagamento no segundo exato.

MensagemWhatsapp.inboxId associa unicamente novas entradas à inbox. Histórico antigo não foi reenfileirado, corrigido ou marcado como entregue. Texto da cópia de histórico permanece no formato existente enquanto dentro da retenção, protegido pelo escopo da empresa; somente o payload da inbox usa a cifra explícita.

A chave de cifra deve permanecer disponível na retomada. Seu mecanismo existente usa EMAIL_ENCRYPTION_KEY ou NEXTAUTH_SECRET; rotação exige procedimento de recifragem, não trocar variável e ignorar conteúdo ilegível.

## Evidências

- 677 testes unitários em 51 arquivos.
- 155 integrações em 11 arquivos, incluindo 14 cenários específicos da inbox.
- 20 testes de runtime com login sem bypass, mais gate de grants/RLS incluindo inbox/função de bootstrap.
- Build webpack/TypeScript, lint dos arquivos tocados e auditores de tenancy/perfil global.
- Segredo ausente/errado, conexão e recibo não autenticados, instância forjada/ambígua, inativa, duplicata simultânea, rollback inbox+fila, falha de processamento e retomada, mesmo ID em outra instância, própria/grupo, áudio/metadados, LID solto, desconhecido sem poderes, sinal de conexão atrasado, conteúdo expirado, mensagem antiga, consumidor técnico e limites de corpo.
- S05 continua provando SIM concorrente com uma única transição e recusa de convite ambíguo. A suíte de runtime prova descoberta antes do contexto e bloqueio cruzado/auth/delete.
- Eventos sintéticos; nenhum destinatário real. after é substituído por stub nos testes; o consumidor é executado explicitamente. Não houve ensaio de callback no ambiente Vercel nem reinício real do provedor.
- Aviso preexistente face-api no build; pg avisa sobre consultas concorrentes no cliente durante testes. Não há falha associada nos testes.

## Próximo passo: O03

Implementar outbox, tentativas, providerMessageId de saída e recibos. Criar intenção atômica no processamento da inbox, chave por inbox/ação/destinatário, sem reenviar histórico. Timeout ambíguo exige estado desconhecido/reconciliação. Manter confirmação de recebimento, conclusão de job e entrega da resposta separados. Depois ligar conversa e IA sob limites de O06/U03. Publicação exige também confirmação do contrato Evolution e ensaio L02.
