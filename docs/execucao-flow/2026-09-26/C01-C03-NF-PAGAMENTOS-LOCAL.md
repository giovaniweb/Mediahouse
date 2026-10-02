# Bloco ampliado de notas fiscais e pagamentos — 02/10/2026

Base 677ff21; trabalho local na branch melhorias/execucao-auditoria. Não houve migração, publicação, envio de mensagem real ou operação em produção. Os 41 scripts de migração continuam inalterados.

## Comportamento entregue

- Aprovar/contestar pelo custo ou pelo job usa a mesma decisão transacional. Exige papel atual admin/gestor e verCustos; cargo antigo da sessão não autoriza. Consulta financeira por job também exige verCustos e não devolve PIX/diária cadastral anexados implicitamente.
- Aprovação exige NF recebida, documento associado, total conhecido e PIX decifrável da empresa. Zero legado sem confirmação não é gratuidade. A decisão é auditada junto da mudança; repetição não duplica decisão nem envio. Aprovar não marca pago.
- Havendo vários lançamentos no job, a rota genérica e o recebimento por token recusam escolher o último. A decisão financeira por custo específico continua disponível. Vincular NF a várias parcelas demanda fluxo explícito posterior.
- Pagamento registrado ou com estados divergentes não pode ser reaberto, editado ou apagado por estas rotas. Repetir marcar pago preserva a data original. Alterar valor/tipo de custo aprovado exige nova aprovação. Job não nasce pago por cadastro manual e exige aprovação antes de marcar pagamento; despesas sem job conservam registro manual de pagamento conhecido.
- Exclusão fica restrita a rascunho sem documento/origem, com auditoria na mesma transação. Correção de pagamento/lançamento com origem exige conciliação posterior; não se apaga a trilha para corrigir um número.
- Envio de NF por URL arbitrária e alteração de PIX através da rota antiga por job foram descontinuados com 410. O fluxo utilizado pela tela de Jobs permanece o formulário privado por token. Não existe consumidor ativo no código para o POST antigo enviar_nf.
- Emissão do token exige membership atual, empresa selecionada, vínculo ativo e autoria do job. Chamadas concorrentes retornam o mesmo registro. NF contestada permite nova submissão em outra linha, preservando o arquivo anterior.
- Link público revalida empresa ativa, profissional e atribuição. Recebimento revalida novamente após armazenar o arquivo. NF, custo, auditoria e alerta são confirmados juntos. Não atualiza todas as parcelas nem documento de custo pago. A entrega do material precisa estar registrada.
- Arquivos PDF/PNG/JPG precisam corresponder em extensão, MIME e assinatura inicial, com tamanho entre 1 byte e 20 MB. Isso não substitui antivírus. Caminho privado exclusivo por tentativa evita sobrescrever arquivo anterior; após upload seguido de rejeição/rollback, pode restar objeto privado sem vínculo, para política de retenção posterior.
- Aviso ao financeiro só registra emailFinanceiroAt se o provedor confirmou e a versão do custo ainda corresponde. Falha mantém a decisão e gera alerta sem expor resposta sensível do provedor. Repetição não dispara envio novamente. O envio de e-mail ainda não é uma outbox durável: interrupção entre commit e chamada externa exige conferência. Não prometer entrega exatamente uma vez.

## Interface

Na aba Externos e pagamentos, valor desconhecido aparece como “A confirmar”. “Informar valor” abre um formulário curto para o total do serviço, aceita vírgula decimal e exige informar zero explicitamente para gratuidade. Após confirmar, o usuário é orientado à NF/aprovação antes de pagar um job. Falhas da API são mostradas, em vez de ignoradas. Divergência de pagamento aparece como “Em conferência”. Valores desconhecidos não compõem o comparativo por profissional; título passa a “Gasto conhecido”. Mantido o visual de gestão já integrado.

Ensaio no navegador em localhost:60506/custos, organização visual-financeiro-outubro marcada ambienteTeste, profissional/job fictícios: abriu Informar valor, digitou 500,50, confirmou, viu R$ 500,50 e “Conferir NF e aprovação”. Nenhum pagamento realizado; fixture preservada para revisão.

## Validação

769 testes unitários aprovados. Suíte integrada completa com 386 casos aprovada; depois do ajuste final de valores desconhecidos, conjunto financeiro focado com 29 casos aprovado (inclui um novo caso, total distinto de 387). Testes de serviços financeiros usam login PostgreSQL restrito, NOBYPASSRLS, nas duas organizações fictícias. Testes HTTP revalidam permissão revogada, cargo global insuficiente, token de profissional, repetição e falha do provedor simulado.

Typescript, build webpack, lint dos arquivos alterados e auditores de tenancy/perfil global aprovados. Removida da allowlist a exceção antiga de nf-token, pois agora há escopo explícito. Sem mudança de schema/grants; ensaio completo de RLS do bloco anterior continua como referência, e os novos serviços foram exercitados sob RLS nesta etapa.

## Pendências e próximo bloco

C01/C02/C03 continuam em execução: não declarar financeiro ou sistema 100% concluído. Faltam condições contratuais completas/quantidade e total, caminhos de aceite legados, alocação de pessoal por competência, unidade de rateio, custo por entrega elegível e conciliação histórica assistida. Também faltam cancelamento/estorno rastreável para custos com origem e documentos, associação explícita de NF a múltiplas parcelas e e-mail durável com recuperação de resultados incertos.

Próximo bloco ampliado: total contratado/parcelas e alocação/rateio, com fluxo de revisão dos valores sem confirmação. Não preencher zeros nem meses passados pela diária/salário atuais. Eventos seguem em standby e expansão visual geral continua depois da simplificação funcional.
