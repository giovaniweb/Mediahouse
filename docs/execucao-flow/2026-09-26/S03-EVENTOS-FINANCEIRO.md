# S03/R03 — orçamento e lançamentos de eventos

29/09/2026; base 794e690. Recorte de segurança e apresentação financeira; não encerra a auditoria do módulo de eventos.

## Permissões aplicadas

- Leitura/lista/painel exigem vínculo atual e verEventos pelo requireAcesso. Não usam papel global da sessão como autorização financeira.
- Orçamento previsto/aprovado e lançamentos do evento exigem verFinanceiroEvento, permissão já existente e antes sem uso nas APIs. Ter verCustos sozinho não concede acesso ao orçamento do evento.
- No detalhe e resumo do evento, o agregado audiovisual exige adicionalmente verCustos. O gestor de eventos pode ver os lançamentos do evento sem ganhar acesso aos custos internos dos videomakers.
- POST/PATCH/DELETE de custos exigem verEventos + verFinanceiroEvento. PUT/POST de evento recusam valores financeiros sem a permissão; respostas de criação/edição passam a devolver apenas evento.id, suficiente para os consumidores encontrados.
- Dados estruturados não autorizados são omitidos da consulta/resposta. financeiro=null indica seção indisponível; não representa saldo zero. A lista também não expõe a contagem dos custos sem permissão.

## Cálculo e apresentação

- Previsto e realizado separados, sem fallback valorReal ?? valorPrevisto.
- Zero realizado/orçamento é zero, não ausência. Sem valor realizado informado, o total é null. Totais realizados parciais têm contagem de itens sem valor; a tela usa “Realizado informado”. Não é comprovação de pagamento.
- Retirado custoTotal/totalGasto que somava evento e audiovisual, pois podem existir lançamentos sobrepostos. Audiovisual fica separado no detalhe; dashboard mostra apenas lançamentos do evento.
- Detail/dashboard usam snapshot RepeatableRead. Consultas e agregados têm empresa explícita, incluindo organização da demanda e do custo audiovisual. Demanda de outra empresa vinculada incorretamente não entra no resumo nem no percentual.
- GET calcula conclusão a partir do snapshot, sem atualizar percentualConclusao/updatedAt. O valor persistido, usado pela lista, continua dependendo dos produtores de atualização existentes; não foi refeito o ciclo completo de conclusão neste recorte.
- Interface oculta aba/campos/cards financeiros quando não autorizados. Leitura do detalhe distingue erro de consulta de evento ausente. Respostas de leitura usam private/no-store.

## Compatibilidade

- Contrato de financeiro do detalhe não contém mais custoTotal; custoEventoPrevisto/Real podem ser null, custoAudiovisual só aparece com permissão adicional.
- Dashboard usa financeiro agrupado (ou null), com totalPrevisto, custosPrevistos, realizadoInformado, itensSemRealizado e pagamentosPendentes. Não há totalGasto.
- Telas da lista/detalhe e relatório factual atualizados no mesmo recorte. Clientes externos desconhecidos precisam adequar o contrato; não houve publicação.
- Nenhuma mudança de schema ou migration. Não altera dados de custos existentes. Escritas de orçamento/valor realizado aceitam zero e rejeitam valores negativos/não numéricos.

## Validação

687 testes unitários e 269 de integração aprovados. Oito provas novas: detalhe/lista/painel/resumo sem financeiro, separação entre permissões de evento e custos, previsto versus real/zero/ausente, isolamento de demandas/custos cruzados, GET sem escrita, bloqueio de mutações sem permissão e resposta de edição sem orçamento. Build webpack/tipos, lint sem erros/avisos nos arquivos alterados e auditores aprovados; aviso preexistente de face-api no build.

Logs /private/tmp/nuflow-eventos-fin-*.log. Banco descartável, sem rede externa, envio de mensagens, IA paga, migração de produção ou deploy. Ensaio visual autenticado e validação sob role runtime restrito deste novo recorte pendentes.

## Limites e próximo passo

Não declarar todo o financeiro confidencial: textos livres, documentos e links podem conter informações financeiras sem classificação confiável. As APIs próprias de documentos/aprovações ainda precisam da revisão de capacidade, classificação e mutações. Ocultar aprovações de orçamento/contrato no detalhe não protege sozinho seus endpoints. Esse recorte foi implementado em S03-DOCUMENTOS-APROVACOES.md; continuam as limitações de classificação de texto livre e compartilhamento externo ali descritas.

Também permanecem dívidas anteriores: criação do evento/checklist/demandas não atômica, registro de log de edição best-effort, validação completa de relações de fornecedores/produtos/responsáveis, exclusão do evento com guard legado, paginação e consistência do percentual persistido. Não foram silenciosamente declaradas resolvidas por remover quatro exceções do verificador estático: esse verificador reconhece requireAcesso por arquivo, não prova cada handler legado.
