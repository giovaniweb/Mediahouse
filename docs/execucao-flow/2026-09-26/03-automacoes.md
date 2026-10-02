# Caderno 3 — Automações, WhatsApp e custo de IA

O produto precisa comprovar o efeito de cada rotina. “Cron executou” não significa “mensagem entregue”. Caminhos relativos à raiz de F00; dependências no controle.

## O01 — Trabalho durável, reivindicação e recuperação

**Arquivos:** schema Prisma, api/cron/agentes/route.ts, serviços de automação. Criar uma fila pequena no Postgres; não introduzir framework distribuído, Redis ou Kubernetes.

1. Reutilizar estrutura equivalente se existir. Caso contrário criar job com: organização, tipo/versionamento, referência de negócio, chave idempotente, payload mínimo, estado, agendadoPara, expiraEm, tentativas, leaseAté, leaseToken/versão, erro sanitizado e timestamps. Constraint única (org, tipo, chave).
2. Estados de execução: pendente → executando → concluído; falha recuperável → pendente com próxima tentativa; final → falhou/cancelado/expirado. Estado do job não substitui estado de entrega da mensagem.
3. Reivindicar lote limitado atomicamente, com lock que evite dois workers consumirem a mesma versão. Rede fora da transação. Resultado só pode ser gravado por lease vigente; recomeço recupera leases vencidos.
4. Jobs longos renovam lease. Revalidar organização ativa, validade e estado do objeto antes do efeito. Colocar limite de trabalho por empresa para uma conta não bloquear as demais.
5. Gravação de intenção/outbox junto à mutação de negócio na mesma transação. Cancelamento do trabalho cancela efeitos ainda não enviados; não apagar logs.

**Testes obrigatórios em Postgres:** dois consumidores simultâneos, crash após claim, lease vencido e worker antigo, rollback do produtor, chave duplicada, empresa inativa e validade expirada.

**Aceite:** não há job perdido por reinício nem dois efeitos locais pela mesma chave. A resposta HTTP de aceitação só ocorre após persistir. Não prometer exactly-once do provedor.

## O02 — Entrada WhatsApp autenticada, identificada e retomável

**Achado W02. Arquivos:** api/whatsapp/webhook/route.ts, whatsapp-webhook.ts, helpers de número/LID, schema ConfigWhatsapp/MensagemWhatsapp.

1. Confirmar versão/contrato de eventos da Evolution usada; consultar documentação oficial correspondente antes de mudar nomes/payloads. Persistir fixtures sanitizadas/sintéticas dessa versão.
2. Autenticar segredo obrigatório antes de aceitar evento; vincular instância à empresa pelo servidor. Ausência de segredo não libera recebimento. Estado de instância e atualização de entrega também precisam dessa validação.
3. Persistir inbox com providerMessageId, instância, organização e constraint única, mantendo payload mínimo necessário com retenção definida. Repetição já persistida recebe confirmação sem recriar ação.
4. Responder sucesso após persistência, e processar em O01. Falha de banco antes disso deve permitir retry do provedor; falha de processamento fica no job. Prefixo de texto não é identificador.
5. Ignorar mensagens próprias/loops e eventos não suportados com resultado explícito. Número desconhecido não ganha acesso à empresa por estar na conversa.

**Testes:** segredo ausente/incorreto, instância forjada, duplicata simultânea, erro antes/depois de persistir, restart, áudio/anexo com metadados, mensagem própria, ID igual em instâncias distintas, LID ambíguo.

**Aceite:** retry retoma a entrada sem perder nem duplicar pedido/aceite. Teste real de recebimento reservado para L02 com destinatário definido.

## O03 — Saída, recibos, reenvio e resultado desconhecido

**Achado W01. Arquivos:** lib/whatsapp.ts, whatsapp-webhook.ts, api/whatsapp/enviar e páginas/APIs de mensagens falhadas; integração com email.ts quando compartilhar outbox.

1. Criar intenção com destinatário autorizado, motivo, objeto, validade e chave estável. Tentativas são filhas da intenção; histórico antigo permanece histórico, sem reenfileirar automaticamente.
2. Guardar providerMessageId e resposta normalizada. Estados de negócio: aguardando, aceito, entregue, lido, falhou, expirado, cancelado e desconhecido. Não reinterpretar “enviado” legado como entregue.
3. Assinar/processar eventos de status suportados. Receber status duplicado/fora de ordem sem regressão de lido para aceito; conservar evento e timestamp para reconciliação.
4. Falha permanente (ex.: destinatário inválido/400 contratual) não entra em loop. 429/5xx usam backoff limitado e Retry-After quando disponível. Proposta inicial: até cinco tentativas com espaçamento crescente, respeitando expiraEm.
5. Timeout após envio pode ter sido aceito pelo provedor. Usar idempotência real do provedor se disponível; senão marcar desconhecido e consultar recibo/estado antes de qualquer novo envio. Reenvio manual exige permissão, motivo e checagem de duplicidade.

**Testes:** 400, 429, 5xx, timeout ambíguo, recibo atrasado, recibo repetido, destinatário alterado, trabalho já concluído, duas tentativas simultâneas e pausa da empresa.

**Aceite:** contador distingue intenções de tentativas. UI mostra causa/última tentativa/próxima ação sem corpo sensível. Falha/sem_config não pode ser contada como mensagem enviada com sucesso.

## O04 — Regras para alerta, cobrança, pipeline e lembretes

**Achados A01/W03. Arquivos:** cron/agentes/route.ts, ia-tools-executor.ts, schema Evento/AlertaIA/CustoVideomaker, serviços novos de regras.

1. Extrair funções puras para prazo vencido, sem movimento, pendência de aprovação, ausência de final aplicável e cobrança válida. Cada regra tem versão, chave de deduplicação, fato, responsável e condição de resolução.
2. Consultas processam todos os registros elegíveis em páginas/cursor, sem limite silencioso de 25. Combinar filtros com AND; não sobrescrever status.
3. Lembrete deriva de inicio - lembreteMinutos e revisão do evento. Consumir notificarEm vencido ainda válido; cancelar lembrete antigo quando horário/responsável mudar. Resolver destinatário interno/externo sem presumir telefone externo.
4. Registrar intenção em O01/O03. Atualizar “aceito/entregue” a partir do estado real; não incrementar sucesso só porque sendWhatsappMessage foi chamado.
5. Suspender chamadas LLM dessas regras ao ativar o substituto. Teste com adaptador de IA que lança erro se invocado. Empresas inativas, de teste ou sem atividade elegível não geram execução comercial.
6. Relatórios recorrentes gravam snapshot determinístico R01/R02, com chave por organização/área/período/versão. A vistoria antiga não continua gerando texto pago em paralelo. Análise textual opcional só pode ser ligada depois dos limites de O06.

**Testes:** evento às 8h, 14h e 22h; cron atrasado; alteração/cancelamento; responsável interno; nenhuma cobrança após pagamento; duas execuções da regra; alerta resolvido/reaberto; mais de 25 demandas; filtros combinados.

**Aceite:** um fato produz um alerta e a resolução correta; lembretes não dependem de janela diária de duas horas; zero chamadas de IA nessas rotinas. Cadência real do cron é configurada em L02 conforme o plano contratado.

## O05 — Saúde e Alertas que explicam o problema

**Arquivos:** app/(dashboard)/alertas, mensagens-falhadas, Configurações WhatsApp, WhatsAppStatus, APIs correspondentes.

1. Mostrar separadamente conexão, última entrada, última saída aceita, recibo de entrega e último processamento da fila. “Sem tráfego” é diferente de “falhou”.
2. Alertas com filtros por tipo/responsável/idade; painel de detalhe mostra origem, tentativa e ação permitida. Não despejar logs técnicos na primeira tela.
3. Tratar cron com sucesso parcial explicitamente: resumo de empresas/jobs concluídos, falhos e pendentes; heartbeat de execução e alerta de atraso sem IA.
4. Ações pausar, tentar novamente e cancelar operam sobre intenção/job permitido, são auditadas e não reenviam toda a base.

**Testes:** empresa conectada sem entrada; tentativa aceita sem recibo; falha recorrente; status parcial; destinatário expirado; usuário sem capacidade; troca de organização; erro de carregamento não vira zero.

**Aceite:** usuário encontra causa e próxima ação em até um detalhe; status apresentado corresponde aos registros, sem afirmar “entregue” por HTTP 200.

## O06 — Orçamento e uso de IA por empresa/operação

**Arquivos:** claude.ts, api/ia/**, relatorios/gerar, transcrição, schema/serviço de consumo e módulos de organização.

1. Centralizar chamadas em um adaptador com finalidade, empresa, ator, modelo e limite de saída. Separar input, output, cache quando disponível, duração, resultado e tentativa.
2. Reservar atomicamente orçamento antes de chamadas concorrentes; reconciliar uso depois e liberar reserva expirada. Não confiar em contador somente em memória.
3. Definir limites configuráveis e defaults conservadores de engenharia: tamanho de entrada, chamadas simultâneas, tentativas e loops de ferramentas. Limite atingido gera resposta legível e fallback determinístico, sem trocar para outro modelo ilimitadamente.
4. Preço é tabela datada por modelo/categoria/moeda; custo ausente é desconhecido. Não converter os 4,45 milhões de tokens antigos num valor exato inventado.
5. Desativar varredura LLM de empresa vazia/teste por padrão. Análise textual de relatório é sob demanda ou opt-in, com snapshot pequeno, prazo de cache e invalidação explícita.

**Testes:** dois pedidos concorrentes próximos ao limite; timeout com reconciliação; consumo sem preço; empresa diferente; loop de ferramenta que excede teto; texto duplicado reutiliza snapshot permitido; opt-out efetivo.

**Aceite:** painel técnico mostra gasto medido/estimado/desconhecido separadamente e limites são aplicados no servidor. Valores monetários de plano comercial serão definidos pelo responsável; ausência deles não implica orçamento infinito.
