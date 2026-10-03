# O01 — fila durável de automações

Implementada localmente em 29/09/2026, sobre e384fbf. Migração 20260929040000_fila_duravel aplicada SOMENTE no PostgreSQL descartável. Sem deploy, tráfego externo ou mensagem real.

## Problema e comportamento entregue

O processo de cron podia morrer no meio da execução sem preservar um trabalho retomável. A recuperação das execuções antigas também era uma atualização global antes do laço de empresas, incompatível com o escopo RLS normal.

Agora há uma fila pequena no Postgres, sem serviço adicional: JobAutomacao guarda intenção, referência, versão, chave, payload mínimo, agenda, validade, tentativa e lease. EventoJob guarda as transições sem corpo de mensagem, credencial ou erro bruto. Unique (organização, tipo, chave) impede duas intenções iguais. Duplicata retorna a intenção original sem alterar seus dados; revisão de negócio exige nova chave.

Estados: pendente → executando → concluido; falha recuperável volta a pendente com agenda; estados terminais falhou/cancelado/expirado. Conclusão é conclusão do trabalho local, não confirmação de entrega no WhatsApp.

Primeiro consumidor real: execucoes.recuperar, versão 1, acionado pelo cron de agentes após autenticação. Uma intenção por empresa/hora, validade de uma hora, um trabalho por chamada. Revalida execuções ainda executando há mais de 30 minutos e marca interrupção no mesmo commit da conclusão do job. Não reexecuta IA nem mensagem. Registros históricos sem empresa não são atribuídos nem alterados por inferência.

## Contrato para as próximas implementações

Código central: src/lib/fila-duravel.ts. Consumidor inicial: src/lib/fila-manutencao.ts.

1. O servidor resolve organização e autorização. O serviço é interno: não publicar seus métodos recebendo organização/token diretamente de usuário ou webhook.
2. Dentro de comOrg e de uma transação, fazer a alteração de negócio e chamar enfileirar(tx, entrada). Só responder aceitação após COMMIT. A API atual do cron continua respondendo sobre sua execução; não foi criado endpoint genérico de aceitação.
3. Tipo tem versão explícita; referência identifica o objeto a revalidar. Chave deve incluir revisão/período quando aplicável. Payload aceita objeto reduzido de primitivas (máximo 2 KiB), strings de até 128 caracteres: usar IDs/revisões, jamais tokens, corpo de mensagem ou dados pessoais. O produtor específico deve validar seus próprios campos.
4. criarFila(prisma).reivindicar(org, limite, tipos) reivindica atomicamente. Consumidores devem filtrar seus tipos; o consumidor de manutenção não rouba jobs de outros handlers.
5. Guardar id, organização e leaseToken retornados. Toda confirmação, falha ou renovação exige o token vigente. Nunca buscar o token novo para continuar um worker antigo.
6. concluirLocal(lease, callback) aceita SOMENTE escrita local no tx recebido. O handler valida versão/referência/estado atual do objeto antes da escrita. Rede/LLM não podem ocorrer nesse callback. Escrita e conclusão ficam no mesmo commit; erro ou prazo vencido desfazem ambas.
7. Para trabalho externo/mais longo, renovar antes de vencer o lease; retorno false exige parar. A parte de rede fica fora da transação. O03 ainda precisa definir resultado desconhecido e reconciliação antes de ligar retries de envio: a fila NÃO garante exactly-once do provedor.
8. falhar recebe código controlado, nunca exception.message. Falhas recuperáveis esperam 30, 60, 120 e 240 segundos, com até cinco tentativas totais; não agenda além da validade. Falha permanente termina imediatamente. Crash também consome tentativa.
9. cancelar conserva job e eventos e impede efeitos locais ainda não confirmados. Ações de usuário, autorização, ator e interface de cancelamento/reenvio são O05; este método não é endpoint público.

## Concorrência e isolamento

- Lock da organização serializa claim/cancelamento/conclusão local e estabiliza a situação ativa da empresa durante a escrita. Não manter esse lock durante chamadas externas. Transações locais seguem timeout curto do Prisma.
- Claim usa SELECT FOR UPDATE SKIP LOCKED e novo token aleatório. Há no máximo dois leases vigentes por empresa, somando tipos/consumidores, e lote máximo de dois.
- Relógio do PostgreSQL em UTC define agenda efetiva/lease; validade de 60 segundos, renovação limitada à expiração.
- Manutenção de até 50 jobs por claim cancela empresa inativa, expira validade e recupera leases vencidos; esgotamento termina em falhou. Próximas invocações drenam o restante.
- Empresa pausada depois da enumeração do cron é revalidada antes do efeito. Empresas já inativas não são percorridas pelo cron atual: seus registros podem permanecer pendentes até uma manutenção/claim, mas não são executados.
- RLS nas duas tabelas. Runtime não apaga jobs e só insere/lê eventos; app_auth não acessa a fila. O verificador de runtime passa a conferir também essas permissões e políticas.
- Nenhum log é apagado por cancelamento. Política futura de retenção e manutenção administrativa deve preservar evidência e não apagar chave idempotente de trabalho ainda repetível.

## Evidências locais

- 674 testes unitários, 50 arquivos.
- 141 testes de integração, 10 arquivos, incluindo 14 testes da fila em PostgreSQL.
- 19 testes usando login runtime sem bypass, mais verificação de grants/RLS.
- Build webpack e TypeScript aprovados; lint dos arquivos alterados sem erros/avisos; auditores de tenancy/perfil global aprovados. Permanece aviso existente de dependência dinâmica face-api no build.
- Concorrência de consumidores e limite por empresa; duplicata simultânea; rollback do produtor; retomada de crash simulada por lease vencido e novo consumidor; recusa de worker antigo; efeito local único com conclusões simultâneas; rollback após erro e após vencimento durante escrita; empresa inativa; expiração; renovação; cancelamento; backoff/esgotamento; isolamento da manutenção real.
- Casos sintéticos sem chamadas externas; sem afirmar que um processo real foi morto ou que o provedor entregou mensagens.

## Implantação e limites

Aplicar a migração antes de publicar código dependente e conferir runtime com as credenciais de aplicação. Não aplicado em produção neste cartão. Não há novo cron registrado nem novo custo de infraestrutura; a rotina inicial usa o cron existente. Sua cadência real será validada em L02.

Somente a recuperação de execuções interrompidas foi migrada. Rotinas antigas de IA, lembretes e envio seguem seu caminho atual até O02/O03/O04/O06; não colocá-las automaticamente sob retry para aparentar cobertura. A fila depende de invocações futuras do consumidor para retomar; persistência não cria um worker permanente.

Não houve benchmark de grande volume. O limite por empresa controla trabalho reivindicado; a distribuição global/cadência e a saúde operacional são O05/L02. Jobs vencidos não são reanimados: precisam de nova intenção de negócio quando isso ainda fizer sentido.

Próximo cartão: O02 — inbox WhatsApp persistida e autenticada. Usar esta fila e validar o contrato da versão real do provedor antes de alterar eventos.
