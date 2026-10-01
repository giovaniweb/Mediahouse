# Base financeira por competência — 01/10/2026

Base: aba3cfd, branch melhorias/execucao-auditoria. Implementação local, sem publicação, valores reais, mensagens externas ou alteração de credenciais.

## Entrega integrada

- A aba inicial de Custos passa a ser Visão do setor, com mês, total conhecido/parcial, quatro categorias e detalhes recolhidos. Externos e pagamentos permanecem na aba própria. Consultas antigas só são carregadas ao abrir essa aba.
- Livro complementar `LancamentoSetor`: pessoas internas, infraestrutura e outros; valor Decimal(14,2), BRL, competência, fonte, origem única, pessoa opcional validada na empresa, operador e auditoria. Zero explícito é distinto de valor desconhecido. Não espelha CustoVideomaker nem usa salários atuais para preencher meses antigos.
- Fato repetido, inclusive concorrente, retorna o mesmo registro; reutilização da origem com valores diferentes é recusada. Diárias/parcelas diferentes têm origens distintas. Valores e fontes são imutáveis no banco; cancelamento preserva registro e exige novo lançamento para correção. Aplicação sem DELETE, autenticação sem acesso e RLS forçada.
- O resumo lê livro e custos externos numa transação REPEATABLE READ; inclui custos externos sem demanda, mantém períodos de São Paulo e distingue conflitos entre `pago` e `statusPagamento`. Positivos legados entram como valores já registrados, sem atestar documento. Zero legado exige confirmação. Pagamento conflituoso não entra nos totais pago/pendente.
- Pendências: valores desconhecidos, zeros legados, estados de pagamento divergentes e até 100 serviços concluídos sem custo, com indicação de excedente. Fontes e registros são visíveis ao financeiro. A lista de categorias não atesta cobertura completa.
- Novo custo externo grava confirmação de valor e estado de pagamento coerente. Tela envia chave idempotente, preservada em falha; API protege concorrência e recusa origem reutilizada com dados diferentes. Consumidores antigos sem chave continuam compatíveis, sem garantia de deduplicação desses clientes. PATCH usa versão (`updatedAt`) e auditoria para evitar sobrescrever edição concorrente.
- Aprovação externa exige NF recebida e transição condicional; custo pago não volta para aguardando pagamento pela aprovação/contestação. Envio de e-mail não altera pagamento e só registra data de envio se o serviço responder sucesso. Retry durável de e-mail permanece pendente.
- Caminho de geração retroativa automática é bloqueado na API e no serviço; Configurações direciona para conferência. Nenhum valor passado é inferido da diária atual ou de updatedAt.
- Removidos da tela e das respostas novas os cálculos fixos de R$ 200 por entrega e comparativos “se pagou”. `/api/producao` mantém indicadores operacionais, sem estimar receita/salário. Snapshots já emitidos permanecem preservados.

## Limites explícitos e continuação

C02 e C03 continuam EM_EXECUCAO. C01 não foi implementado neste bloco. Não confundir esta base utilizável com aceite integral dos três cartões.

1. C01: serviço único de convite/aceite UI+WhatsApp, snapshot das condições, concorrência da vaga, outbox/auditoria e ciclo financeiro vinculado ao contrato. As rotas legadas de convite ainda precisam desse trabalho.
2. C02: fator de alocação estruturado por pessoa/competência; associação à pessoa na interface; revisão por lote persistido com simulação/assinatura/aplicação explícita de custos históricos. A geração insegura foi retirada, mas não substituída por aplicação em lote. Revisão humana dos 50 zeros reais não foi executada. Externos legados continuam em Float; o novo livro e o cálculo mensal usam Decimal, sem regravar esses valores antigos.
3. C03: custo por entrega continua null/“sem base”. É preciso escolher unidade e rateio de custos por vídeo/arte/texto, testar denominadores e comparação entre pessoas. Não dividir todo o setor por uma soma de unidades diferentes. A fixture 3600/10=360 será aceita apenas após implementar alocação comprovável; neste bloco o teste exige null.
4. Cobertura de encargos/benefícios/equipamentos e salários ausentes não pode ser inferida dos registros existentes. Total permanece parcial mesmo sem pendência cadastrada. Não há fechamento contábil ou cálculo de lucro.
5. Revisão de rotas financeiras legadas adicionais (NF, aprovação por demanda, exclusões), observabilidade/retentativa do e-mail, paginação completa das pendências e histórico de cancelamentos na interface permanecem pendentes.
6. U01/novo visual: o protótipo em nuflow-kanban-preview continua separado. Esta tela reaproveita componentes/estilos do checkout atual com organização simplificada. Não é migração integral do visual aprovado. Homologação visual desktop/mobile com equipe ainda pendente.

## Provas locais

761 testes unitários, 363 integrações e 26 runtime + verificador de grants/RLS. Banco sintético PostgreSQL 17, migração aditiva 20261001010000_custos_setor. Novos testes de serviço usam login NOBYPASSRLS membro de app_user. Sem chamadas externas.

Casos: soma 3000+500+100 com desconhecido, repetição concorrente, conflito de origem, meses independentes, soma Decimal 0,10+0,20, zero explícito/legado, pagamento divergente, cancelamento idempotente, proteção contra UPDATE/DELETE, organização cruzada, pessoa fora da empresa, bloqueio do retroativo e reabertura sem alterar gasto pago. Fronteira HTTP verifica verCustos, sessão, competência, repetição de externo e coerência dos estados de pagamento.

Types, build, lint dos arquivos alterados, auditores de tenancy/perfis e schema diff são os verificadores complementares. Lint mantém avisos legados; nenhum teste visual no navegador foi executado neste bloco.
