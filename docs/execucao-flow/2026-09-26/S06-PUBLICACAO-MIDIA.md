# S06 — publicação e mídia privada

Implementado no checkout `nuflow-melhorias`, sem deploy. Não declarar o acervo de produção protegido antes do inventário e do ensaio de armazenamento abaixo.

## Comportamento entregue

- `/biblioteca` é autenticada; `/galeria-artes` usa a mesma interface com Growth selecionado. Ambas mostram finais internos, incluindo arquivos sem `linkFinal`. A biblioteca aplica capacidade da área e, sem `verTodasDemandas`, o vínculo da pessoa com a demanda.
- `/galeria` é o portfólio público. Apenas `Arquivo.final` com publicação explícita ativa aparece. Concluir um job não publica nada. A paginação pública conta arquivos e possui desempate por ID; a biblioteca pagina demandas e identifica essa unidade no contrato.
- Gestor/admin da empresa, com `editarDemanda`, pode publicar ou retirar um arquivo pela biblioteca. A ação diz que qualquer pessoa poderá ver. O servidor confere a empresa do arquivo; não permite publicar arquivo de parceiro.
- A publicação grava data, ator e snapshot da URL/miniatura. Trocar a URL do arquivo posteriormente não publica a nova versão: retirar e publicar novamente é necessário. Cada alteração efetiva registra histórico da demanda na mesma transação.
- Links legados sem registro `Arquivo` continuam visíveis internamente. Para publicar, registrar explicitamente o final na demanda. Não existe backfill que publique tudo.
- `/api/midia` exige objeto registrado e escopo autorizado. Uma sessão da empresa ou token válido não é suficiente por si só. Final público, acompanhamento, aprovação, NF e fornecedor têm regras separadas.
- O token de acompanhamento abre apenas finais/miniaturas da própria demanda. Aprovação abre o vídeo da aprovação e a versão anterior que a própria página apresenta. Expiração é conferida. NF abre somente o registro fiscal correspondente; o portal do fornecedor somente suas notas vinculadas.
- Parceiro precisa de parceria aceita não encerrada e aresta ativa para a demanda. Não recebe briefing nem NF por esse caminho. Empresa dona inativa interrompe acesso.
- O proxy público de miniatura Drive exige ID exato em URL oficial e snapshot publicado; nunca usa um ID encontrado por substring como autorização.
- Coberturas preservam o consentimento próprio (`linkDownloadPublico` e senha), mas conferem empresa, tipo e cobertura do caminho antes de assinar. Depoimentos ativos preservam a publicação própria já existente.
- Respostas que entregam mídia/assinaturas usam `private, no-store`. Caminhos recusam traversal, percent-encoding, barras invertidas, query/hash e segmentos vazios. Falha do storage não devolve a URL privada como fallback.

## Inventário e entrada em produção

1. Aplicar primeiro `20260929000000_publicacao_arquivo` no ambiente de homologação. Campos nascem nulos; nenhum conteúdo é publicado automaticamente. O schema precisa existir antes de subir o código.
2. Executar `scripts/inventariar-publicacao.mjs` com `DATABASE_URL_AUDITORIA` e `ORGANIZACAO_AUDITORIA` explícitos, uma empresa por execução. O script usa transação somente leitura, não carrega `.env` nem imprime links/tokens. Identifica arquivos por tipo/origem, finais sem registro, links ativos e referências fiscais em bucket público. Foi ensaiado apenas no banco local descartável.
3. Conferir também acessos já distribuídos por Drive, URLs externas e bucket `uploads`. As regras novas impedem novas divulgações pelo app, mas **não tornam privadas URLs antigas de provedores**. Inventário do provedor, cópia para bucket privado e revogação das permissões antigas pertencem a M01/M03; não apagar originais antes de validar as cópias.
4. Conferir no Supabase que `midia` é realmente privado. A helper de criação aceita bucket já existente; isso não comprova sua configuração. Testar acesso direto anônimo negado, assinatura autorizada, Range/stream de vídeo e expiração. Não foi feita chamada real ao storage neste lote.
5. A galeria pública ficará vazia até a gestão publicar os itens escolhidos. A biblioteca interna mantém o acesso autorizado. Comunicar a mudança aos responsáveis pelo portfólio; não restaurar publicação automática para preencher a vitrine.
6. Ensaiar em homologação: duas empresas, leitor limitado, gestor, parceiro ativo/revogado, aprovação atual/anterior/expirada, NF, fornecedor e cobertura com senha. Conferir a interface no navegador e os links legados antes do deploy.
7. Publicar somente no lote L02, junto das migrações anteriores e do runtime validado em S07.

## Revogação e limites reais

- Retirar do portfólio bloqueia novas assinaturas anônimas; pessoas com acesso interno ou token válido continuam usando suas autorizações próprias.
- URLs assinadas já emitidas podem funcionar por até 600 segundos. Downloads iniciados e cópias baixadas não são recolhidos. URLs/miniaturas diretamente públicas de provedores seguem as políticas desses provedores.
- Arquivos ainda não vinculados a um registro não são servidos pela rota. Pré-visualizações antes de salvar devem usar o arquivo local do navegador. A identidade completa e o ciclo do upload serão tratados em M01.
- Documentos legados recebidos por WhatsApp usam `docs/whatsapp`; exigem vinculação exata ao registro e escopo da demanda, mas ainda não têm identidade própria por upload.
- Esta entrega não implanta fila de transcode, sincronização Drive, deduplicação do acervo ou expiração fiscal nova. Não encerra M01–M04 nem a revisão integral de APIs S03.
- A trilha utiliza o histórico existente; o serviço central de auditoria continua em S08.

## Evidências locais

Testes unitários de caminhos e publicação; integração com PostgreSQL descartável e assinador/Google simulados. Cenários: privado por padrão, publicação seletiva, snapshot, retirada, publicação negada por papel/empresa/tipo, leitor limitado, objeto sem registro, caminho de outra demanda, tokens separados/expirados, parceiro revogado, empresa inativa, falha do assinador, paginação de múltiplos finais e Growth sem link legado. Ver contagens e resultados finais em `CONTROLE.md`.

Rollback de aplicação: preferir correção em frente. Voltar ao endpoint público antigo reabre divulgação automática e não é um rollback seguro de confidencialidade. Manter os campos adicionados; não requer apagar dados.
