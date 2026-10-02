# R04 — ordenação e paginação da galeria

Implementado localmente em 29/09/2026, sobre 350f184. Sem migração, deploy ou alteração de dados reais.

## Comportamento

Bibliotecas audiovisual/Growth e portfólio público paginam entregáveis, com total calculado sobre a mesma seleção usada na lista. Dois arquivos finais distintos da mesma demanda ocupam duas posições. URLs canônicas equivalentes são deduplicadas dentro da demanda, sem juntar trabalhos de demandas diferentes.

Ordem decrescente pela conclusão; na ausência dela, data de anexação; para link legado sem ambas, atualização da demanda com indicação visual de data estimada. ID desempata datas iguais. Nenhuma data histórica é reescrita. Growth inclui arquivo final mesmo sem linkFinal. Links legados são alternativa quando não há arquivo final com URL preenchida.

Escopo de empresa, capacidade e próprias demandas permanece aplicado antes da contagem. No público, continuam obrigatórios snapshot de publicação, ausência de revogação e URL permitida. Referências inválidas são retiradas antes da paginação; nada privado é publicado automaticamente. Falha em liberar uma mídia da página retorna 503 sem URL privada ou página parcial. A interface mostra erro e oferece nova tentativa, avançando a página somente no sucesso.

## Verificação

- 674 testes unitários em 50 arquivos.
- 127 testes de integração em 9 arquivos, PostgreSQL local descartável.
- Casos: junho/setembro, datas ausentes/estimadas, empate, múltiplos arquivos, URLs repetidas, busca, página vazia, Growth sem link legado, isolamento e revogação.
- Regressão S06: assinatura indisponível continua sem fallback privado; agora responde 503 explicitamente.
- Build webpack com tipos, ESLint sem erros e auditores de tenancy/perfil global.
- Avisos existentes de React/imagens/links e dependência dinâmica face-api permanecem.

## Limites e retomada

A transação RepeatableRead mantém índice e detalhes consistentes dentro de cada requisição. Alterações entre requisições ainda podem mudar as páginas; não há cursor congelado.

O índice de metadados de todos os entregáveis elegíveis do escopo é carregado para ordenação/deduplicação em memória. Apenas detalhes e assinatura de URLs são limitados à página. Não houve benchmark de biblioteca grande; M01/M04 devem avaliar índice persistido e paginação no banco antes de alegar escala.

Identidade usa URL canônica, não hash do conteúdo; arquivos físicos duplicados com URLs diferentes continuam distintos. Data estimada não comprova conclusão. Não houve validação visual autenticada em navegador nem validação de disponibilidade real dos provedores.

Próximo cartão: O01 — fila durável, preservando as pendências S01/S02/S03 registradas no controle.
