# M04 — Biblioteca, recuperação assistida e retenção

01/10/2026. Base `5dcb7a4`, branch `melhorias/execucao-auditoria`. Implementação e ensaio locais; nenhuma alteração no acervo real, publicação ou configuração externa.

## Entrega do bloco

A biblioteca reúne arquivos finais, artes e referências aprovadas. Filtros por área, tipo, projeto e pessoa são aplicados dentro do escopo autorizado. Aprovações usam a decisão mais recente por identidade; referências de original e prévia já vinculadas não geram outra entrega. O portfólio público continua dependendo de autorização explícita, sem publicação automática durante recuperação.

A tela distingue prévia em processamento, com falha, não verificada e com recibo da versão atual. “Verificada” exige identidade, versão e recibo local; não equivale a testar a disponibilidade remota a cada acesso. A ação de revisão abre a demanda. Links inseguros ou privados fora do vínculo esperado não entram na listagem.

“Entregas sem vídeo” deixou o menu de relatórios. O endereço antigo redireciona para o filtro de qualidade da biblioteca. O filtro considera somente tipos com obrigação conhecida de arquivo; Growth administrativo, campanhas e tipos sem peça visual não recebem acusação de vídeo ausente. Tipos desconhecidos permanecem para revisão. A API antiga conserva o guard de relatórios e aplica também o escopo da biblioteca.

Audiovisual e Growth usam consulta de fila com paginação de 100 demandas. Concluídos com 30 dias ou mais saem da consulta do quadro, sem alterar registros ou custos. Conclusão sem data permanece identificada como legado; não recebe hoje nem `updatedAt` como data de conclusão. Reabertos continuam na fila; o serviço de transições já preserva o histórico e reinicia o marcador de conclusão. A página Histórico continua mostrando concluídos independentemente da presença de arquivo, com acesso à demanda e seus registros autorizados. Filtros por data de conclusão não incluem datas legadas desconhecidas.

## Recuperação por lote

A rota antiga de backfill e seu helper deixam de permitir criação automática de arquivos. Configurações aponta para `/biblioteca/acervo`.

1. Administração com `gerenciarConfig`, `editarDemanda` e `verTodasDemandas` solicita simulação. Não basta papel global ou acesso às próprias demandas.
2. Cada simulação cobre até 25 demandas, com cursor. Persiste lote, operador, validade de uma hora, classificação, motivo, confiança e hash das pré-condições. A simulação grava apenas o diagnóstico e sua auditoria, sem criar arquivos de negócio.
3. Classificações: final já vinculado, referência final não vinculada, entrega externa, tipo sem obrigação de arquivo, legado sem dado ou revisão manual. Não há busca por nome/tamanho nem promoção de bruto. Referência registrada como bruto é recusada, inclusive com URLs equivalentes.
4. São elegíveis referências finais explícitas ou uma referência aprovada inequívoca quando não há final. Aprovações posteriores não aprovadas impedem recuperação daquela referência. Acima do limite de 20 aprovações, a recuperação é recusada para revisão, inclusive quando existe link final explícito; uma decisão antiga não carregada não pode ser presumida.
5. O operador aplica o lote revisado. Transação serializável, lock e revalidação do hash impedem aplicar um plano antigo sobre dados modificados. Conflito concorrente pode responder 409 e pedir nova tentativa/revisão; não duplica o final. Lote aplicado devolve o relatório já persistido.
6. Aplicação registra antes/depois dos vínculos finais válidos, resultado por demanda, arquivo criado e auditoria na mesma transação. Não altera `linkFinal`, original, prévia, custo ou consentimento público. Nenhum download é necessário para recuperar a referência.
7. A tela permite retomar as últimas dez simulações/relatórios do próprio operador. Lotes de outro operador ou empresa não podem ser aplicados. O papel de runtime não tem DELETE na tabela de lotes; o papel de autenticação não tem acesso.

## Retenção e limites

A política inicial preserva separadamente original, prévia e final. Exclusão automática permanece desligada. Carência preparada de 48 horas é somente parâmetro conservador para futura política, não prazo para apagar. Nenhuma limpeza é habilitada pelo cron e a mensagem deixou de sugerir liberação automática após M04.

A simulação trabalha com referências do banco, não faz inventário remoto. Não comprova existência de bytes, recuperação física ou economia de GB. O coletor de inventário anterior permanece separado; cobertura global, recibos de armazenamento e eventual exclusão dependem de M01 e de política de negócio/operação autorizada.

O índice de entregáveis da biblioteca continua usando o mecanismo R04 de ordenação/deduplicação em memória após filtro de empresa. Não é uma alegação de desempenho para acervo arbitrariamente grande. Fila e simulação têm limites/paginação próprios. Nenhum backfill em produção foi executado. O cadastro de custos legado não foi alterado e será tratado em C01–C03.

## Evidências

- 748 testes unitários, 353 integrações e 26 runtime/RLS aprovados; verificador confirma grants dos lotes e isolamento. Provas novas incluem 29/30/31 dias, data nula, reabertura, Growth sem peça, recuperação sem Storage, repetição, concorrência, expiração, alteração de pré-condição, operador/tenant indevido, filtros e revogação de acesso à biblioteca.
- Migração aditiva `20261001000000_lotes_acervo` aplicada somente no PostgreSQL sintético local (`55449`, banco `nuflow_test`). 39 migrações; `prisma migrate diff` sem divergência.
- Tipos, ESLint dos arquivos alterados sem erros (avisos legados), auditores de tenancy/perfil global e build webpack aprovados. Teste ampliado de links aprovados junto a arquivos passou sem duplicar original/prévia.
- Não houve ensaio visual no navegador neste bloco, nem homologação com Storage/Drive reais. Antes de publicar: revisar as telas com a equipe e aplicar migração/validar papéis no ambiente escolhido. Não ativar exclusão automática.

Próximo bloco: C01–C03, contratos/aceites de profissionais, competência e custo do setor, preservando dados históricos e impedindo inferência pela diária atual.
