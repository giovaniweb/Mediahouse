# Caderno 2 — Relatórios e correções de dados

Objetivo: recuperar confiança sem regenerar textos pagos nem alterar históricos em massa. Dependências no CONTROLE.md; caminhos relativos à raiz escolhida em F00.

## R01 — Relatórios antigos legíveis e formato novo validado

**Achado R01. Arquivos:** api/cron/agentes/route.ts, api/relatorios/gerar/route.ts, api/relatorios/route.ts, app/(dashboard)/relatorios/page.tsx.

1. Definir schema versionado de leitura: metadados do período/área, números, texto e origem. Separar DTO de apresentação do JSON bruto persistido.
2. Adaptador legado: se houver analise, exibir como conteúdo textual legado; se já houver resumo_executivo/kpis, mapear os campos suportados. Nunca interpretar HTML arbitrário como seguro.
3. Conteúdo inválido apresenta erro recuperável e referência do relatório; não renderizar uma página vazia nem inventar KPIs como zero.
4. Escritores novos validam o contrato antes de persistir. Texto de IA inválido não apaga o snapshot nem cobra regenerações automáticas ilimitadas.
5. Usar fixture sintética com o mesmo formato do semanal de 21/09. Não copiar texto interno real para um teste público.

**Testes:** analise, formato estruturado, campo ausente, JSON inesperado e texto com HTML; relatório B não abre em A.

**Aceite:** histórico legado mostra conteúdo sem chamada à IA. Gravação e leitura novas compartilham schema; estado de erro é visível.

## R02 — Um recorte e uma definição para cada indicador

**Achados R02/R03. Arquivos:** api/relatorios/metricas/route.ts, gerar/route.ts, api/producao/route.ts, demandas/[id]/status/route.ts, src/lib/job-transicoes.ts, relatórios e dashboard.

1. Criar contrato de consulta: area (mapear Growth para o valor interno design), inicio inclusivo, fim exclusivo, fuso, tipo e versão das métricas. Validar intervalo e área; organização vem do contexto.
2. Regras da primeira versão:
   - Criadas: createdAt dentro do período.
   - Concluídas: estado atualmente finalizado e finalizadaEm dentro do período; demanda distinta.
   - Entregáveis: arquivos/links aprovados por tipo, com deduplicação de Arquivo e linkFinal que representam a mesma entrega.
   - Publicações: somente evento/registro explícito de publicação. Se não houver dado, mostrar “não medido”.
3. Centralizar transição de reabertura: limpar marcador de conclusão atual sem apagar HistoricoStatus. Nova conclusão ganha novo timestamp. Não criar rotina de alteração de todos os legados neste cartão.
4. Gerar relatório a partir do MESMO serviço de métricas usado na tela. Persistir snapshot, filtros, versão e momento de geração; IA só recebe snapshot autorizado.
5. Identificar lançamentos manuais separadamente, com fonte e período. Evitar duplicar os mesmos vídeos entre manual e automático; se não houver vínculo suficiente, declarar as fontes e limitação.

**Testes:** criado fora/concluído dentro; reaberto não conta em “atualmente concluídas”; mudança na meia-noite local; último dia do mês; area design não mistura audiovisual; múltiplos arquivos da mesma demanda; manual discriminado; A/B. Não congelar os totais reais 169/170 nos testes.

**Aceite:** dashboard, relatório e exportação concordam com a mesma fixture. Reabertura muda o resultado atual; snapshot de relatório emitido permanece rastreável e não é recalculado silenciosamente.

## R03 — Intervalo de custos correto

**Achado C02. Arquivo:** api/custos-videomaker/route.ts e consumidor da página custos.

1. Construir um único objeto dataReferencia com limites combinados, sem spreads que se sobrescrevem.
2. Converter filtro de calendário para o contrato inicio/fim exclusivo de R02. Manter compatibilidade com de/ate na borda, documentando que ate inclui o dia selecionado.
3. Rejeitar data inválida e intervalo invertido com erro de campo. Resolver fuso uma vez, sem depender do relógio/fuso da máquina.
4. Substituir o probe que espera gte ausente por teste de regressão que exige ambos os limites.

**Testes:** só de, só ate, ambos, anterior/dentro/posterior, fim de dia e data inválida.

**Aceite:** registros anteriores ao início não entram quando ambos os filtros são usados; filtros não alteram o escopo financeiro de S03.

## R04 — Galeria ordenada e paginada pela unidade correta

**Achado M03. Arquivos:** api/publico/galeria/route.ts, api/growth/galeria/route.ts, páginas galeria/galeria-artes.

1. Definir unidade de biblioteca como entregável (arquivo ou link externo canônico), não misturar paginação de demandas com total de arquivos.
2. Ordenação estável: data de conclusão quando conhecida; para legado, data de anexação do final; último fallback updatedAt com indicação de data estimada. ID como desempate. Se a correção imediata for nulls last, manter consistência até M01.
3. Aplicar os mesmos filtros à lista e ao total; Growth aceita Arquivo final quando linkFinal é nulo.
4. Manter filtro de publicação S06 na galeria pública; biblioteca privada tem escopo próprio. Não elevar acesso para preservar os 112 itens do contador antigo.

**Testes:** itens com datas de junho/setembro e nulos; empate de data; dois arquivos na mesma demanda; paginação sem duplicação/omissão; Growth sem link legado; privado fora da lista pública.

**Aceite:** mais recentes aparecem antes dos legados sem data; total corresponde à unidade exibida. Correção não exige regenerar mídia nem modificar todos os timestamps.
