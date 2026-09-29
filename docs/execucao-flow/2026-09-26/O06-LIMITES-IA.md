# O06 — limites e consumo de IA

Estado: EM_EXECUCAO. Primeiro recorte em 29/09/2026, base 29d8088. Não declarar o aceite global do card cumprido.

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

## Próxima implementação, na ordem

1. Persistência de política de IA, reservas e consumo por organização, com migration, RLS e permissões mínimas. Separar entrada/saída/cache, modelo, finalidade, ator, tentativa, duração e resultado; não registrar conteúdo bruto. Defaults finitos e configuráveis.
2. Reserva transacional com lock por empresa antes da rede, limite de simultaneidade e teto por período. Reserva que ainda não enviou pode expirar; timeout após checkpoint de envio é resultado desconhecido, não devolução automática que permite gastar novamente sem controle. Conciliação idempotente com uso real.
3. Adaptador central obrigatório. Inventário atual: analisarComClaude em relatórios, eventos, coberturas, ideias individual/batch, triagem e análise de demanda; stream direto em api/ia/chat; SDK direto em api/coberturas/briefing. ExecutarAgenteComTools também precisa de limite mesmo sem consumidor atual. transcreverAudio não tem consumidor ativo encontrado, mas precisa exigir contexto/limites antes de ser reativado. SDKs sem retries invisíveis; tamanho de entrada, saída e loop limitados pelo servidor.
4. Testar concorrência real no PostgreSQL, reserva expirada antes/depois do envio, falha de persistência pós-provedor, consumo sem preço, outra organização, loop excedido e opt-out. Provedores sempre falsos nos testes.
5. Análise textual de relatório sob demanda/opt-in, snapshot pequeno e cache autorizado com TTL e invalidação. Chave inclui empresa, recorte e permissões pertinentes; cache não pode reapresentar custo privado a quem perdeu acesso. Relatório determinístico continua disponível se a IA for recusada.
6. Tabela de preço datada por modelo/categoria/moeda e painel técnico protegido. Ausência de preço = desconhecido; não estimar retroativamente os tokens históricos como valor exato. Separar medido, estimado e desconhecido.
7. Somente marcar O06 IMPLEMENTADO depois das provas de limite agregado, cobertura de todos os caminhos pagos e painel. Não basta remover uma chamada ou limitar tokens de uma requisição.

Demais chamadas pagas continuam sem orçamento agregado até os passos acima; não vender este recorte como controle financeiro completo. Não alterar WhatsApp conversacional (U03) nem ativar transcrição por antecipação.
