# R03 — Filtro de período dos custos

Base d580e5a. Implementação e testes locais, sem publicação ou alteração de dados reais.

O GET /api/custos-videomaker construía dataReferencia duas vezes. Quando de e ate estavam presentes, o segundo objeto descartava gte. Agora há um único objeto com início inclusivo e fim exclusivo, usando o mesmo resolvedor IANA de R02. ate inclui todo o dia brasileiro, até a meia-noite seguinte. Só de, só ate e ausência de datas continuam permitidos. Data impossível, formato incorreto, valor vazio explícito e intervalo invertido retornam 400 com identificação do campo.

Listagem, totais e agrupamento por videomaker derivam do mesmo conjunto filtrado. Mantidos verCustos, organização ativa e filtros de profissional/demanda/pagamento. Ordenação com desempate por ID; resposta financeira privada sem cache.

A tela Custos ganhou De/Até, limpeza do período, indicação de fuso e mensagem de erro. A data de referência exibida usa America/Sao_Paulo independentemente do navegador. O POST aceita data de calendário ou timestamp ISO com fuso: uma data simples é gravada à meia-noite brasileira para que o novo lançamento apareça no mesmo dia do filtro; timestamp explícito mantém seu instante. Data inválida é rejeitada antes da escrita. Vencimento/pagamento não mudaram neste cartão.

## Limite do legado

Não foi feita conversão em massa. Registros antigos salvos como meia-noite UTC continuam com seu instante original; no Brasil podem pertencer ao dia anterior ao texto originalmente digitado. Sem identificar a origem, não é seguro deslocar todos os registros. A normalização do novo POST evita ampliar essa dívida; reconciliação histórica exige inventário e decisão própria nos cartões financeiros. Este lote não corrige custeio, competência, salários ou faturas.

## Evidências

Teste unitário exige ambos os limites e equivalência com R02; integração usa PostgreSQL descartável e handlers reais, verificando anterior/início/interior/último milissegundo/fim exclusivo, intervalo de um dia, limites independentes, lista/totais/grupo, filtros combinados, A/B, erros por campo e criação seguida de filtro. Asserts antigos que esperavam gte ausente não foram encontrados no checkout de execução; a regressão nova exige comportamento correto sobre registros persistidos.

672 unitários/49 arquivos e 124 integrações/8 arquivos aprovados. TypeScript, build webpack, lint dos arquivos alterados (zero erros/avisos), auditores tenancy/perfil e diff check aprovados. Aviso preexistente face-api no build. Logs /private/tmp/nuflow-r03-*.log. Nenhuma migration, chamada paga ou mensagem externa. Ensaio visual autenticado e publicação ainda pendentes.

Próximo cartão: R04 — ordenação e paginação da galeria por entregável.
