# O06 — limites e consumo de IA

**Diretriz vigente após a revisão do usuário:** [IA essencial](DECISAO-IA-ESSENCIAL.md). Central/chat/triagem/loops retirados; opt-in de relatórios implementado. Não executar a sequência histórica de migrar esses recursos removidos. O painel agora está em Relatórios.

Estado: EM_EXECUCAO. Primeiro recorte em 29/09/2026, base 29d8088. Segundo recorte na mesma data, base 03a5282: orçamento durável e geração de relatórios protegida. Não declarar o aceite global do card cumprido.

## Recorte concluído: sugestões de produtos

Antes, GET /api/produtos/sugestoes construía o ranking e chamava Anthropic automaticamente para os primeiros cinco produtos quando havia chave. Cada atualização podia gerar outra cobrança. A tela de detalhe consultava esse ranking: um produto fora dos dez primeiros nunca recebia sugestão.

Agora a consulta usa apenas regras locais: retomar demonstração quando o prazo é atingido, planejar resposta a dúvida antes dele. A orientação não inventa benefícios, dados técnicos ou desempenho do produto. A tela identifica a origem por regras e oferece Consultar. O parâmetro produtoId consulta diretamente um produto autorizado, independentemente do ranking.

Mantido o contrato sugestoes; acrescentado origem=regras-v1. Toda sugestão retornada tem texto. A regra usa ultimoConteudo, com fallback para createdAt; não representa auditoria da publicação real. Datas futuras não geram prioridade negativa, prazo zero não causa divisão por zero e empate tem ordem por ID. Não há cache de IA, armazenamento de prompt ou custo monetário estimado neste recorte.

Autorização: requireAcesso(verProdutos), empresa revalidada no servidor, comOrg e predicado organizacaoId. Produto de outra empresa, inativo ou ausente retorna o mesmo 404. Falha de consulta retorna 503 e é apresentada na tela. Resposta de sucesso private/no-store.

## Evidência local

- 687 unitários, incluindo prazo atingido, data futura, fallback e prazo zero.
- 195 integrações no PostgreSQL descartável, incluindo cinco casos novos: consulta repetida com chave sintética sem provedor/rede, produto fora do top 10, isolamento, ausência de permissão/vínculo e validação do filtro.
- Build webpack final, tipos e auditores de tenancy/perfil global aprovados. Permanece aviso preexistente de dependência dinâmica face-api no build. Lint sem erros; aviso preexistente de setState em effect na tela.
- O05 recuperada: build webpack e 23 provas runtime/grants aprovados após ENOSPC.
- Logs deste recorte: /private/tmp/nuflow-o06a-{unit,integration,types,build}.log.

Não houve migração, chamada paga ou publicação. A classificação geral ainda carrega os produtos ativos da empresa em memória; não é um benchmark de escala. A consulta individual lê somente o produto solicitado.

## Sequência original de implementação (situação atual abaixo)

1. Persistência de política de IA, reservas e consumo por organização, com migration, RLS e permissões mínimas. Separar entrada/saída/cache, modelo, finalidade, ator, tentativa, duração e resultado; não registrar conteúdo bruto. Defaults finitos e configuráveis.
2. Reserva transacional com lock por empresa antes da rede, limite de simultaneidade e teto por período. Reserva que ainda não enviou pode expirar; timeout após checkpoint de envio é resultado desconhecido, não devolução automática que permite gastar novamente sem controle. Conciliação idempotente com uso real.
3. Adaptador central obrigatório. Inventário atual: analisarComClaude em relatórios, eventos, coberturas, ideias individual/batch, triagem e análise de demanda; stream direto em api/ia/chat; SDK direto em api/coberturas/briefing. ExecutarAgenteComTools também precisa de limite mesmo sem consumidor atual. transcreverAudio não tem consumidor ativo encontrado, mas precisa exigir contexto/limites antes de ser reativado. SDKs sem retries invisíveis; tamanho de entrada, saída e loop limitados pelo servidor.
4. Testar concorrência real no PostgreSQL, reserva expirada antes/depois do envio, falha de persistência pós-provedor, consumo sem preço, outra organização, loop excedido e opt-out. Provedores sempre falsos nos testes.
5. Análise textual de relatório sob demanda/opt-in, snapshot pequeno e cache autorizado com TTL e invalidação. Chave inclui empresa, recorte e permissões pertinentes; cache não pode reapresentar custo privado a quem perdeu acesso. Relatório determinístico continua disponível se a IA for recusada.
6. Tabela de preço datada por modelo/categoria/moeda e painel técnico protegido. Ausência de preço = desconhecido; não estimar retroativamente os tokens históricos como valor exato. Separar medido, estimado e desconhecido.
7. Somente marcar O06 IMPLEMENTADO depois das provas de limite agregado, cobertura de todos os caminhos pagos e painel. Não basta remover uma chamada ou limitar tokens de uma requisição.

Demais chamadas pagas continuam sem orçamento agregado até os passos acima; não vender este recorte como controle financeiro completo. Não alterar WhatsApp conversacional (U03) nem ativar transcrição por antecipação.


## Segundo recorte: orçamento durável e primeiro consumidor

Implementado em 29/09/2026, base 03a5282. Migration 20260929090000_orcamento_ia aplicada apenas ao PostgreSQL descartável. O código novo requer a migration antes de uma futura publicação.

### Contrato do orçamento

- PoliticaIA é por empresa; ausência usa defaults de engenharia finitos: 100.000 tokens por dia UTC, duas chamadas simultâneas, 32.768 bytes de entrada e 4.096 tokens de saída. Não são valores de plano comercial nem teto em reais/dólares.
- Há limites no schema para política: até 10 milhões de tokens/dia, quatro simultâneas, 65.536 bytes e 8.192 tokens de saída. tokensDia=0 bloqueia uso; habilitada=false também. Ainda não há tela/endpoint de edição da política; alteração operacional direta não é apresentada como ação auditada de produto.
- ConsumoIA registra empresa, ator, finalidade, modelo, tentativa única, entrada/saída/cache separados, reserva, débito, ID da resposta e duração até a conciliação. Não armazena prompt, resposta textual, chave do provedor ou erro bruto. Categorias não informadas pelo provedor permanecem null.
- Reserva, início e conciliação usam lock transacional por empresa. Verificam empresa ativa, fora de ambienteTeste e ator ativo com vínculo. Política e vínculo são revalidados antes da rede. Nenhuma transação fica aberta durante a chamada externa.
- Reserva estimada para texto: bytes UTF-8 do pedido completo + limite de saída + 1.024 de margem. Não é uma cotação monetária nem tokenização exata. Uso observado maior é contabilizado integralmente e reduz/bloqueia o saldo seguinte, nunca truncado ao teto.
- Reserva não iniciada vale 60 segundos. Expiração/liberação anterior ao checkpoint devolve saldo. Após iniciar, o prazo é 180 segundos; timeout/erro tem estado desconhecido, conserva débito e ocupa slot até esse prazo. Não equivale a cancelamento garantido no provedor.
- Incertezas continuam comprometendo orçamento mesmo na virada do dia. A competência é a data UTC da reserva; confirmação tardia permanece nessa competência. Limpeza é feita na próxima reserva, início ou consulta do resumo, sem cron adicional.
- Conciliação exige referência e token internos, pode confirmar enviando/desconhecido e é idempotente apenas para evidência idêntica. Divergência é recusada. Não existe endpoint para o navegador zerar ou liberar consumo desconhecido. Recuperação após perda da resposta ainda exige apuração operacional; não há consulta automática ao provedor neste recorte.
- RLS habilitada nas duas tabelas, app_auth sem acesso, app_user sem DELETE. Role restrito exercitado no teste runtime. A trilha é de consumo operacional, não substitui auditoria imutável de alterações de política.

### Adaptador e relatório

ia-analise.ts é o novo adaptador restrito a texto, três modelos permitidos, uma tentativa, timeout SDK de 90 segundos e maxRetries=0. Não recebe ferramentas, mídia ou fallback de modelo. A entrada inclui o system prompt na verificação de bytes. Seu limite de saída atual é 4.096; uma política menor recusa a solicitação em vez de ignorar o limite.

POST /api/relatorios/gerar usa o adaptador com empresa/usuário obtidos por requireAcesso e finalidade relatorio.<tipo>. Snapshots e permissão financeira R02/R03 continuam válidos. Esta é uma chamada manual sob demanda, sem nova varredura automática. Limite, ausência de chave, empresa de teste ou falha de provedor preservam o snapshot e gravam relatório regras-v1 com explicação da ausência de texto de IA. Falha inesperada de banco continua sendo erro; não se promete persistência sem banco.

No fallback, RelatorioIA.tokens=0 significa nenhum token confirmado anexado ao relatório. Não prova ausência de cobrança: consumo desconhecido permanece na tabela ConsumoIA, e o texto informa que a confirmação pode estar pendente. Não somar campos legados de relatórios como se fossem uma fatura.

GET /api/ia/consumo requer gerenciarConfig, retorna apenas agregados da empresa ativa e private/no-store; falha é 503, nunca saldo zero. Na Central de IA, detalhe recolhido “Uso de IA em relatórios” apresenta medido, reserva em andamento, reserva desconhecida e saldo. Custo monetário é null/desconhecido até existir tabela datada de preços. O painel declara que só cobre geração de relatórios; não inclui o chat exibido na mesma página.

### Validação e limites

- 687 unitários; 212 integrações, incluindo 17 provas novas de orçamento/adaptador/rotas.
- 24 runtime com role sem bypass e verificador de grants/RLS.
- Build webpack, tipos, lint sem erros e auditores locais aprovados. Aviso preexistente Date.now na Central de IA e aviso face-api no build.
- Provedores sintéticos: concorrência próxima ao teto, simultaneidade, outro tenant, checkpoint único, reserva expirada, timeout de dia anterior, conciliação repetida/divergente, medição sem preço, excesso real, empresa inativa/teste, opt-out, mudança de política, tamanho, modelo, SDK sem retries e falha de persistência após provedor.
- Rotas testadas com adaptador real e SDK falso: relatório com consumo registrado, fallback com snapshot, timeout sem reenvio e painel autorizado/isolado. Sem ensaio visual autenticado, benchmark de escala ou chamada paga.
- Logs: /private/tmp/nuflow-o06b-{migration,unit,integration,runtime,types,lint,build}.log.

### Próximo recorte obrigatório — revisado pelo usuário

1. Análises de demanda e pontuação de ideias foram retiradas no servidor e nas telas; referências antigas preservadas. Relatórios de eventos/coberturas agora usam regras sem IA. Briefing PDF agora passa por orçamento, limites próprios de documento e validação de saída, incluindo consumidores de eventos, coberturas e campo. Homologação real permanece pendente. Ver DECISAO-IA-ESSENCIAL.md.
2. Chat, triagem autônoma e loops foram retirados. A prova aplicável é ausência de chamada/efeito em endpoint aposentado, não implementar limites para reativá-los.
3. Opt-in textual dos relatórios concluído. Edição auditada da política concluída no painel recolhido de consumo. Cache autorizado/TTL e preço datado seguem pendentes, sem exigir nova Central.
4. Manter transcrição sem consumidor ativo. Conversa/secretária de WhatsApp é futura e depende de necessidade validada.
5. Conferir cobertura dos caminhos pagos realmente mantidos antes de concluir O06; demais pendências de U01 continuam no controle.


### Briefing protegido — 29/09/2026

- Base b00bc17. Detalhes/limitações em DECISAO-IA-ESSENCIAL.md. Sonnet existente preservado, sem novo modelo nem dependência.
- Reserva documental interna acrescenta limiteEntradaTokens, validado entre 1 e 32.768; não é entrada controlada pelo navegador. No briefing é fixo 24.000. entradaBytes representa apenas prompt textual (mesma política); binário tem limite próprio 3 MiB. Sem alteração de schema.
- SDK sem retries, contagem até 15 s e geração até 35 s; maxDuration de 60 s. Contagem excessiva/recusada não gera mensagem. Estimativa não garante teto absoluto de cobrança; reconciliação registra o uso real.
- Consumo central agora declara relatórios e briefing; orçamento diário/concorrência são compartilhados. Chamadas LLM ativas encontradas em src: ia-analise e ia-briefing. Transcrição segue sem consumidor ativo.
- 687 unitários; suíte completa com 243 integrações e recorte final com 21 provas de briefing (duas adicionais, 245 integrações distintas). Build webpack/tipos, lint sem erros e auditores aprovados; 11 avisos preexistentes em campo e aviso face-api no build. Logs /private/tmp/nuflow-briefing-*.log.
- Sem migration nova, produção, mensagem, chamada paga ou deploy. Não conclui O06: cache/TTL, preço datado, política auditada e homologação dos caminhos mantidos seguem pendentes.


### Política editável e auditada — 29/09/2026

- Base 1ce2f47; controles e semântica em DECISAO-IA-ESSENCIAL.md. Só três opções editáveis no painel existente; limites técnicos preservados.
- Autorização por gerenciarConfig/empresa, validação estrita, lock compartilhado com orçamento e auditoria atômica. Edições concorrentes divergentes não sobrescrevem silenciosamente; repetição sem mudança é idempotente.
- 687 unitários e 261 integrações aprovados, incluindo 16 novas provas de política/isolamento/rollback/concorrência/efeito no orçamento. Build webpack/tipos e auditores aprovados; lint dos arquivos alterados sem erros/avisos. Face-api mantém aviso anterior no build. Logs /private/tmp/nuflow-politica-*.log.
- Sem schema/migração nova, IA paga, produção ou deploy. O06 segue parcial por cache/TTL, preços datados e homologação. Próxima correção prioritária: dívida S03/R03 do acesso financeiro no GET de eventos, antes de ampliar ferramentas.
