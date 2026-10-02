# R01 — Leitura e contrato de relatórios

Base ca2c133. Implementação local, sem publicação, alteração de históricos reais, consumo de IA ou envio de mensagens.

## Problema e resultado

O cron semanal salvava `{ analise, auto: true }`, enquanto a tela procurava resumo_executivo e campos estruturados. Esse desacordo deixava relatórios sem conteúdo visível. O leitor agora transforma analise/resumo em texto legado e valida os campos estruturados conhecidos. Não cria zeros para campos ausentes e não interpreta HTML. Formato inválido ou versão desconhecida mostra aviso e ID para suporte; não dispara regeneração.

A tela usa apresentação validada em vez do JSON bruto do banco. Conteúdo estruturado aparece por seções e texto conserva quebras de linha. Campos desconhecidos são omitidos, sem alterar o original persistido. A Central de IA foi atualizada junto com o consumidor da página Relatórios.

## Contrato novo

src/lib/relatorio-contrato.ts é compartilhado pelos leitores e pelos dois escritores (geração manual e cron). Envelope v1 contém tipo, período, área explicitamente não separada, origem, momento de geração, limites conhecidos do recorte, snapshot numérico quando disponível e conteúdo textual/estruturado/inválido.

A geração manual preserva os números calculados antes da resposta da IA. JSON malformado ou estrutura inesperada recebe estado inválido com snapshot preservado; não há segunda chamada automática por falha de formato. Texto simples não vazio pode ser salvo como texto. A resposta inválida não sobrescreve relatórios anteriores. O cron textual não possui snapshot numérico independente: campo null, sem inventar métricas. Falha ao salvar o cron deixa de ser silenciosamente tratada como duplicata.

O contrato aceita campos estruturados suportados dos oito tipos atuais e valida números, listas e objetos internos antes da apresentação. Limites de tamanho e quantidade são intencionais; registros antigos fora deles continuam preservados no banco e aparecem com aviso para análise pelo suporte.

## Segurança e compatibilidade

GET/POST mantêm verRelatorios + verCustos enquanto os relatórios ainda misturam finanças. R02 deve separar métricas/DTOs antes de retirar esse gate. Listagem retorna apresentação em vez de conteudo bruto, com no-store, filtros validados e desempate por ID. Consumidores encontrados no repositório foram migrados juntos; integração externa não inventariada deve adaptar esse contrato antes de publicação.

Consulta de ideias recentes no gerador agora filtra organizacaoId explicitamente. Teste verifica que títulos da empresa B não aparecem no prompt de A. Nenhuma consulta à IA ocorre ao abrir histórico. Tipo/período inválidos são recusados antes de chamadas pagas.

## Limites e próximo cartão

Sem migration ou regravação retroativa. Os indicadores atuais ainda usam as definições antigas: demandas criadas no recorte, conclusão por status, tempo por updatedAt, sem separação de área e com consultas de universos distintos. O snapshot registra esse cálculo; não certifica sua equivalência com dashboard/exportação. R02 deve unificar definições, períodos, Growth/design, reabertura e fontes manuais. O início semanal manual passou a usar sete dias quando tipo=semanal; isso não resolve toda a semântica de períodos.

O cron continua podendo enviar WhatsApp conforme o fluxo anterior; nenhum cron real foi executado neste lote. Limites de custo, outbox/recibos e idempotência de geração permanecem nos cartões O. Nenhum novo agendamento foi criado.

## Validação

Fixtures sintéticas com formato semanal de 21/09, estrutura parcial, campos ausentes, JSON inesperado/malformado, versão desconhecida e HTML. Renderização React em teste comprova texto escapado e aviso com referência. Integração chama handlers reais com PostgreSQL descartável, sessão e IA simuladas: isolamento, acesso, entrada inválida, snapshot, chamada única e round-trip novo/histórico. Build/types/lint e auditores no checkpoint CONTROLE.md. Ensaio visual autenticado e homologação com dados reais seguem pendentes; teste de renderização não equivale a navegação real.
