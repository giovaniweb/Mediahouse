# R02 — Critérios comuns para indicadores

Implementação local sobre eb24333; sem deploy, migration, regravação histórica, chamadas pagas ou envio real. Recorte validado em metricas-recorte.ts; métricas operacionais em metricas-operacionais.ts; complemento autorizado em metricas-relatorio.ts.

## Contrato das métricas, versão 1

- Organização vem do contexto autorizado. Área audiovisual ou design; growth é alias de design. Área desconhecida é erro, sem fallback silencioso. Eventos têm painel próprio e não entram nesse contrato.
- Datas de calendário válidas entre 2000–2099; intervalo máximo de cinco anos. Fuso IANA America/Sao_Paulo, início inclusivo e fim exclusivo. O parâmetro ate inclui o dia selecionado; resposta contém de/ate de calendário e inicio/fim em instantes UTC. Semana são sete dias de calendário até hoje; 3meses são 90 dias; mes/ano começam no primeiro dia; mes=YYYY-MM inclui o mês inteiro.
- Criadas: createdAt dentro do intervalo. Concluídas: statusVisivel atualmente finalizado E finalizadaEm dentro do intervalo. Não há fallback por updatedAt. Finalizadas sem data confiável ficam fora da contagem e são informadas separadamente, sem tentar alocá-las a um período.
- Entregáveis: Arquivo de tipo final das demandas concluídas. Deduplicação por URL canônica, ID Drive e alias originalUrl conhecido. linkFinal é fallback somente quando não há Arquivo final; nunca é somado cegamente a arquivos migrados. URLs distintas sem alias comprovado não são fundidas por nome. A última aprovação conhecida por URL pendente/reprovada exclui esse material; sem aprovação registrada, a conclusão da demanda é a evidência operacional do aceite. Reconciliação de identidade e versões físicas permanece M01.
- Publicações: demandas com dataPostagem explícita no intervalo. Status postado sozinho não basta. Sem nenhum registro de data na área, retorna null e mostra Não medido. Não representa quantidade de posts por canal nem publicação no portfólio S06; ausência de cobertura histórica não é reconstruída.
- Tempo médio: criação até conclusão, excluindo intervalos negativos. Sem amostra, null. Prazo: compara o dia de conclusão no Brasil com a data de calendário do prazo. Sem prazos, null.
- Produção manual: fonte mensal separada, com competência/grupo/categoria/quantidade. Intervalos parciais incluem os lançamentos dos meses abrangidos e exibem essa limitação. Sem vínculo por mídia não há deduplicação possível: totalCombinado/totalGeral null, sem somar manual + automático. Frentes presenciais continuam separadas.

## Consumidores e snapshots

Dashboard mensal, métricas dos relatórios, produção, resumo executivo público/PDF e geração IA reutilizam as regras. A impressão usa os mesmos dados da tela. Aliases antigos de nomes como concluidas30d/totalMes seguem para compatibilidade, mas refletem o intervalo retornado. Tendência divide o intervalo em quatro faixas, não promete semanas de calendário.

A geração manual e a vistoria semanal automática salvam recorte, versão, geradoEm e snapshot autorizado dentro do envelope de relatório. A IA interpreta esse snapshot; não busca uma segunda versão dos indicadores. Na vistoria, ferramentas ficam restritas a listar gestores/enviar, mantendo autorização S05. Outros agentes operacionais e sua reorganização permanecem nos cartões O.

Relatórios emitidos não são recalculados na leitura. O schema aceita os envelopes R01 antigos e os campos opcionais novos. Sem migration. Banco de ideias ainda não possui área própria: seus contadores são identificados como empresa_sem_separacao_de_area, sem enviar títulos/descritivos à IA. Equipe informa carga ativa ou concluída no período, não ranking financeiro individual inventado.

## Finanças e acesso

verRelatorios permite métricas operacionais; sem verCustos, o serviço não consulta custos/diárias e omite esses campos da resposta. Snapshot grava custos null. Tipos financeiros exigem verCustos. Histórico sem essa capacidade só devolve snapshots operacionais validados com custos ausentes; conteúdo legado ou financeiro segue protegido. A listagem ainda é limitada, sem paginação por cursor: filtro posterior pode produzir página menor.

Custos agregados abrangem lançamentos vinculados a demandas da área, no período de dataReferencia; custos sem demanda não são arbitrariamente rateados. Custo por entregável usa esse total dividido pelos entregáveis do período, null sem entregas; não é custeio reconciliado por arquivo. O valor de referência de R$200 permanece índice ilustrativo, não receita, salário ou lucro. C01–C03 devem substituir a análise econômica simplificada, inclusive comparações antigas da tela Produção.

## Reabertura

marcadorConclusao em job-transicoes.ts é usado pelo PATCH de status e pelo PUT legado de coluna. Sair de finalizado limpa finalizadaEm; entrar novamente marca a nova data; mudanças entre estados finais preservam a data existente, inclusive null legado. HistoricoStatus permanece. Escrita condicional usa o estado lido para evitar sobrescrever uma atualização concorrente. Revisão ampla de autorização do PUT legado continua S03; R02 não certifica todos os caminhos antigos de mutação.

## Evidências e limites

Fixtures cobrem criação anterior/conclusão no período, reaberto com marcador antigo, legado sem data, meia-noite Brasil, último milissegundo do mês, fim exclusivo, Growth, duas empresas, vários arquivos, deduplicação, fontes manuais, datas inválidas, publicação sem inferência, custo sintético oculto, snapshot após reabertura e cron com ferramentas/IA simuladas. O mesmo cenário reconcilia dashboard, produção e exportação.

Verificações finais no CONTROLE.md. Homologação visual autenticada, revisão dos dados reais e serviços externos continuam pendentes. Consultas vivas não constituem um fechamento contábil nem uma transação única de todos os indicadores; alterações concorrentes podem mudar a leitura seguinte. Sem conciliação ou correção de milhares de registros antigos neste lote.

Próxima tarefa R03: corrigir o intervalo combinado do endpoint de custos usando este contrato, com regressões de datas.
