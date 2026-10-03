# M03 — Cópia Drive: aceite local e homologação pendente

Data: 01/10/2026. Checkout `nuflow-melhorias`, branch `melhorias/execucao-auditoria`. Implementação local; nenhuma publicação, configuração de conta real ou cópia de mídia de cliente.

## Resultado do bloco

A sincronização administrativa deixou de fazer upload dentro da requisição e de sobrescrever `Arquivo.url`. Agora seleciona até 50 entregáveis por página, exige identidade da origem e vínculo com a demanda da empresa, persiste a intenção e devolve HTTP 202. O consumidor processa um arquivo por chamada. Original, prévia e `linkFinal` são preservados.

`CopiaDrive` registra empresa, arquivo/versão, origem, pasta/geração da conexão, ID remoto, hashes, tamanho, versão remota, estado e erro seguro. `JobAutomacao` e `EventoJob` conservam tentativas, leases, validade e histórico. A criação da cópia e do job é atômica. Chamadas repetidas e concorrentes reutilizam a mesma intenção.

O ID do Google é obtido com `files.generateIds` e salvo antes de criar o arquivo. O download do original ocorre em temporário privado, com limite real de bytes; SHA-256 e MD5 são persistidos antes da escrita remota. A cópia carrega uma chave em `appProperties`. Se o upload tiver terminado e a resposta se perder, a tentativa seguinte consulta o mesmo ID e reconcilia tamanho/MD5 sem reenviar nem duplicar. Conteúdo remoto divergente não é sobrescrito. O recibo local e a conclusão do job são gravados na mesma transação.

Não há chamadas à API de permissões. A cópia herda as permissões da pasta de destino: uma pasta já pública não se torna privada automaticamente. Não se afirma privacidade da conta inteira. A origem aceita somente o Storage configurado e a chave registrada, sem redirects. Sessões de upload exigem HTTPS, host oficial e o mesmo ID do arquivo. URLs de sessão e tokens não são persistidos nem devolvidos pelo painel de estado.

O worker usa OAuth da própria empresa, sem fallback para service account ou pasta global. Revogação pede reconexão; falta de acesso à pasta é erro explícito; 429/5xx/falhas transitórias entram no backoff da fila. Troca de fonte, pasta ou geração da conexão invalida a intenção antiga. A empresa piloto é escolhida no servidor, nunca na query do cron.

## Experiência e limites deliberados

- Configurações distingue conta/pasta configuradas, acesso verificado, itens enfileirados e cópias concluídas com recibo. A consulta de estado não executa uploads.
- “Verificar acesso à pasta” é leitura, sem criar arquivo. O POST legado que cria um arquivo de teste permanece uma operação separada; é bloqueado no piloto pelo guard de upload legado.
- Lotes têm checkpoint por ID. Arquivos sem identidade M01, links externos e arquivos sem registro `Arquivo` não são inferidos a partir da prévia; aparecem como inelegíveis. O inventário/backfill do acervo continua separado.
- Piloto inicial: originais de até 100 MiB; prazo de trabalho de 180 segundos, rota com teto de 300 segundos; lease renovado a cada 20 segundos, até cinco tentativas, validade de sete dias. Um job por chamada e concorrência limitada por empresa. Sem LLM.
- Retomada é por arquivo/ID, não por offset de bytes persistido. Upload incompleto pode reiniciar o conteúdo no mesmo ID. Upload já confirmado é reconciliado sem reenviar.
- No piloto, cópias são solicitadas manualmente na tela. Os três produtores legados de cópia após aprovação/status são bloqueados antes de baixar mídia; upload direto legado também é bloqueado. Fora do piloto, esses fluxos antigos ainda existem. A rota administrativa antiga foi substituída e fica indisponível até ativação do piloto.
- Repetir um lote não reabre jobs terminais. Após esgotar tentativas ou expirar, a retomada administrativa precisa de revisão operacional; não há botão que reinicie silenciosamente tentativas infinitas. Trocar pasta/conta/versão gera uma nova identidade e exige enfileirar novo lote.
- A saúde das automações inclui `drive-copias`; sem agendamento externo, itens ficam aguardando. A tela só consulta periodicamente enquanto há pendentes/executando.
- Interromper o processo entre criação remota e conclusão pode deixar um arquivo remoto identificável pelo ID persistido. Não há exclusão automática de arquivos remotos. Desligar o piloto impede novas operações; uma requisição já em trânsito pode terminar, mas o recibo não é concluído se a revalidação falhar.

## Provas locais

| Cenário | Evidência |
| --- | --- |
| Deduplicação concorrente; original e prévia preservados | integração PostgreSQL com login `NOBYPASSRLS`, Google simulado |
| Queda após upload, antes da confirmação local | uma criação/um upload; retry conclui pelo mesmo ID |
| Origem privada e uploads públicos legados identificados | download autorizado e checksum conferido |
| Origem externa/sem identidade | ignorada, sem download arbitrário |
| Troca de conta, pasta ou versão; troca durante download | intenção rejeitada antes da escrita remota |
| 401, 403, 429; refresh token revogado | diagnóstico seguro e retry limitado conforme categoria |
| Empresa B lendo ou vinculando arquivo de A | banco restringe leitura e rejeita escrita cruzada |
| Sessão maliciosa; pasta/conteúdo remoto alterado | envio recusado; token não redirecionado |
| Arquivo acima do limite, com e sem Content-Length | limite aplicado ao stream; limpeza de temporário |
| Rota sem permissão, JSON inválido, falha de consulta, cron sem segredo | rejeição segura; falha não vira contador zero |
| Verificação de pasta | somente OAuth + leitura de metadados, sem criar arquivo |

Comandos: `npm test` (738 testes); `npm run test:integration` (341); `npm run test:runtime` (26 + verificador de grants); `npx tsc --noEmit --incremental false`; ESLint dos arquivos alterados (sem erros, avisos preexistentes nos arquivos legados); auditores de tenancy/perfil global; build webpack; `prisma migrate diff` sem divergência. Testes Drive adicionados: 20 unitários e 15 integrações. Não houve ensaio visual da tela nem chamada a Google real neste bloco.

O ensaio da migração detectou e corrigiu nome de índice truncado e privilégio DELETE herdado dos grants padrão. A migração ainda inédita foi reaplicada somente na tabela vazia do banco sintético e o verificador inclui a nova tabela. O papel da aplicação pode ler/inserir/atualizar cópias sob RLS; não excluir. O papel de autenticação não acessa a tabela.

O cluster temporário anterior em `55439` perdeu `global/pg_filenode.map` durante a última checagem. A validação foi repetida em um cluster sintético novo, `/private/tmp/nuflow-drive-20261001-pg`, porta `55449`, banco `nuflow_test`, após aplicar as 38 migrações do zero. O cluster antigo não foi reparado nem reutilizado.

## Preparação para L02: não executada em ambiente externo

1. Aplicar a migração aditiva `20260930020000_copias_drive` no ambiente de homologação escolhido e conferir o verificador de runtime com credenciais restritas.
2. Conectar uma conta Google de teste via OAuth S04, configurar pasta de teste e verificar o acesso. Conservar `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e a configuração versionada de cifra S04 no servidor.
3. Ativar `DRIVE_SYNC_V2_ATIVO=sim` e definir `DRIVE_SYNC_ORGANIZACAO_ID` para uma única empresa de homologação. Flags ausentes mantêm o novo consumidor desligado.
4. Agendar GET `/api/cron/drive` com `Authorization: Bearer <CRON_SECRET>`, sem expor o segredo ao browser. Definir a cadência correspondente em `AUTOMACOES_CADENCIAS_MINUTOS` para o consumidor `drive-copias`. Nenhum agendamento foi criado neste bloco.
5. Enfileirar mídia sintética identificada até 100 MiB. Exercitar repetição, perda de resposta e troca de pasta. Conferir arquivo no Drive, tamanho/MD5/versão e reprodução/original preservados no Flow. Verificar permissões herdadas da pasta e limites reais da conta/provedor, incluindo eventual Shared Drive.
6. Só ampliar tamanho, automatizar produtores ou liberar outras empresas após medição e aceite externo. Rollback operacional: desligar a flag; preservar filas e recibos para diagnóstico, sem apagar originais.

Referências de protocolo: [IDs pré-gerados](https://developers.google.com/workspace/drive/api/guides/create-file), [generateIds](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/generateIds), [uploads retomáveis](https://developers.google.com/workspace/drive/api/guides/manage-uploads). Essas referências não substituem o ensaio com a conta real.
