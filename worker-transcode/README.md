# Worker de mídia do Flow

## Estado

O fluxo v2 está conectado localmente ao protocolo `/api/transcode/worker` e permanece **desligado por padrão**. `start.mjs` inicia o consumidor v2 somente com `MIDIA_WORKER_V2_ATIVO=sim`; do contrário preserva `index.mjs`, o servidor legado de bucket público. Não confundir um deploy do legado com o worker privado.

`consumer.mjs` reivindica trabalhos persistidos, renova o lease a cada 20 segundos e aborta o motor quando perde a autorização. `converter.mjs` executa uma conversão por instância com Node 20.3+ (ou 22), ffmpeg e ffprobe. Não aceita trabalhos só em memória após HTTP 202.

## Ativação coordenada (ainda não executada em produção)

Aplicar primeiro a migração aditiva de recibo da prévia e homologar uma empresa de teste. O primeiro rollout é intencionalmente restrito a **uma empresa-piloto por configuração do app**; não oferece credenciais por empresa para múltiplos workers SaaS ainda.

No app:

| Variável | Uso |
| --- | --- |
| `MIDIA_WORKER_V2_ATIVO=sim` | Habilita o protocolo e desliga disparos/callbacks legados na empresa configurada |
| `MIDIA_WORKER_ORGANIZACAO_ID` | Empresa autorizada, escolhida no servidor, nunca pelo payload |
| `MIDIA_WORKER_SECRET` | Segredo exclusivo deste protocolo; distinto de `TRANSCODE_SECRET` |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Configuração existente de storage usada somente no app para assinar |

No worker:

| Variável | Uso |
| --- | --- |
| `MIDIA_WORKER_V2_ATIVO=sim` | Seleciona o consumidor no entrypoint |
| `MIDIA_WORKER_API_URL` | URL HTTPS fixa terminando em `/api/transcode/worker`, sem query/credenciais |
| `MIDIA_WORKER_SECRET` | Mesmo segredo dedicado configurado no app |
| `SUPABASE_URL` | Origem HTTPS exata do storage, sem caminho |
| `MIDIA_WORKER_STATE_DIR` | Caminho absoluto em volume persistente para recibos de conclusão |

O v2 roda como processo de background, sem listener HTTP `/health`. Configuração de healthcheck HTTP do serviço legado precisa ser revisada na publicação. Não configurar service role no v2: ele recebe só URLs assinadas. Nenhuma destas variáveis foi ativada por esta implementação.

Antes de ativar, drenar/reconciliar conversões legadas em `processing`: a fila recusa iniciar outro processamento sobre elas. Legados `done`/`skipped` são considerados já tratados. Não há backfill automático de arquivos sem identidade. Jobs duram até 7 dias e têm no máximo 5 tentativas; históricos expirados exigem operação futura de recuperação, não são reabertos silenciosamente.

## Protocolo e persistência

- POST autenticado, JSON limitado a 8 KiB, `Cache-Control: no-store`; ações `reivindicar`, `renovar`, `concluir`, `falhar`.
- `reivindicar` prepara intenções locais e concede um job `midia.converter`. Teto inicial de um trabalho de mídia por empresa, inclusive com workers concorrentes; a fila compartilhada pode adiar a concessão se outro serviço estiver executando.
- Servidor valida empresa ativa, arquivo, versão/perfil, origem e estado legado; emite leitura temporária e assinatura de upload fora da transação e revalida o lease antes da resposta.
- Contrato: jobId, leaseToken, organizacaoId, demandaId, arquivoId, fonteVersao, perfil `h264-720p-v1`, bucket/objectKey, sourceUrl/uploadUrl e SHA-256 conhecido da fonte.
- Saída exclusiva da tentativa em `midia/org/{org}/videos/{demanda}/previews/{arquivo}/{versao}/h264-720p-v1/{job}-{lease}.mp4`. A assinatura usa upload sem sobrescrita. Não reutilizar o caminho do original.
- O motor retorna checksum/tamanho/codec/dimensões/duração. O consumidor persiste recibo com fsync e rename antes da confirmação; se perder a resposta, reenvia esse recibo, sem converter novamente no mesmo ciclo. Startup tenta os recibos antes de aceitar novos jobs.
- O app revalida lease/versão e verifica existência, MIME e tamanho do objeto por HEAD. Hash é atestado pelo worker autenticado; o app não baixa novamente toda a prévia para recalculá-lo. Atualiza Arquivo/link/aprovação pendente e conclui o job numa única transação. Fonte, original e snapshot público permanecem preservados.
- Repetição do callback após commit perdido confere o recibo persistido e retorna sucesso sem escrever novamente. Tentativa obsoleta não publica. Resposta 503 mantém o recibo para retry; 409 encerra o recibo local como obsoleto.
- Poll ocioso de 30 segundos; após conclusão, 1 segundo. Não registra cada poll vazio no log. Não usa IA.

## Conversão e limites

Entrada até 100 MiB, inclusive sem Content-Length, e até 10 minutos; dimensões de entrada até 8192 px e 33.554.432 pixels. Download/upload por stream, com 2 minutos de timeout, sem redirects. ffprobe até 30 segundos e ffmpeg até 15 minutos; duas threads, protocolos de rede/listas de reprodução recusados.

Perfil de recodificação: MP4 H.264/AAC 128 kbps se houver áudio, CRF 23, veryfast, yuv420p, faststart, maior dimensão até 1280 px sem ampliar. Fontes H.264/yuv420p já compatíveis (Baseline/Main/High até nível 4.1, até 1280 px, sem rotação, sem áudio ou AAC-LC até estéreo em 32/44,1/48 kHz) usam remux com cópia dos pacotes e faststart. Remux preserva o bitrate original; não aplica CRF nem promete redução de tamanho. Pixel não quadrado e rotação não múltipla de 90° são recusados neste recorte. Saída até 100 MiB e validação por ffprobe antes do upload. Não existe garantia de redução de tamanho; qualidade/HDR e custo real continuam a homologar.

Temporários ficam em `MIDIA_WORKER_STATE_DIR/temporarios`, isolados por conversão, e são limpos em sucesso, erro e aborto cooperativo. Na inicialização, o consumidor remove somente diretórios marcados como seguros cujo PID já não existe. Marcadores inválidos, symlinks, PIDs vivos/reutilizados e fases com possível subprocesso são preservados. Use volume exclusivo por instância; a identificação por PID pressupõe o mesmo namespace de processos, não coordena máquinas/containers compartilhando volume. `subprocesso.mjs` supervisiona cada ffmpeg/ffprobe por IPC: perda do worker encerra somente o filho criado pelo supervisor e aguarda `close` antes de marcar o temporário como seguro. Aborto e timeout também passam pelo supervisor. Morte simultânea do supervisor/worker ou queda antes de iniciar a supervisão ainda pode deixar temporários; saída remota órfã também permanece: **não há limpeza automática de acervo**. Um crash após upload e antes de persistir recibo, ou reinício após expiração do lease, pode exigir nova conversão; efeitos de conclusão são idempotentes, processamento computacional não é exactly-once. Recibos com lease vencido não autorizam publicação e são descartados localmente após 409. Volume perdido também perde recibos locais, mas o job continua no banco. Limpeza de órfãos remotos, queda do container inteiro e reconciliação administrativa ainda são pendências.

## Testes locais

```sh
npm test --prefix worker-transcode
```

20 testes: SIGKILL durante FFmpeg com encerramento do filho e nova conversão, amostragem de RSS, limpeza conservadora (inclusive symlinks/processo vivo), motor ffmpeg real com clipes sintéticos/storage loopback, formatos/codecs, vertical/sem áudio, conteúdo inválido, limites, checksum, falha de storage, redirects, concorrência/cancelamento; consumidor com API simulada para perda de resposta, reinício com recibo, lease perdido e falha permanente.

Suíte do app: integração com PostgreSQL sintético testa protocolo/callback/concorrência/versão/legado; runtime prova conclusão e isolamento sob RLS sem bypass. O ensaio `tests/integration/midia-processo.spec.ts` usa as rotas reais em um adaptador HTTP de teste, PostgreSQL e worker/ffmpeg em processos filhos. Interrompe o worker com SIGKILL após upload e após commit antes da resposta: comprova nova tentativa, rejeição do lease anterior, recuperação do recibo sem novo upload, hash da prévia, acesso com token e revogação. Assinaturas/storage e sessão anônima são simulados; o banco dessa suíte usa login administrativo, portanto não substitui a suíte runtime/RLS. Requer ffmpeg/ffprobe instalados e roda em `npm run test:integration` com `DATABASE_URL_TEST` explicitamente local. A expiração do lease é acelerada apenas na fixture.

São provas complementares: Next dev completo e navegador foram ensaiados posteriormente (abaixo), com storage simulado. Storage real, Docker/Railway, limites de memória sob carga e CI remoto permanecem pendentes.

Segredos devem ser exclusivos por ambiente e nunca copiados de exemplos antigos. Um exemplo fixo anterior foi removido; se tiver sido usado em ambiente real, sua substituição pertence à preparação de publicação.

## Ensaio de supervisão e memória — 30/09/2026

Teste local em macOS: clipe sintético H.264, 1920×1080, 30 fps, 8 segundos, sem áudio. A morte do worker por SIGKILL durante FFmpeg encerrou o conversor pelo supervisor; nenhum upload foi realizado nessa tentativa. O marcador só se tornou seguro após o filho terminar. Limpeza e nova conversão passaram.

Pico RSS **amostrado de 294 MiB**, somando worker Node, supervisor Node e FFmpeg/FFprobe; 13 amostras, intervalo mínimo de 25 ms acrescido do custo de `ps`. Uma repetição após o ajuste de inicialização registrou 283 MiB em 12 amostras. Não é pico exato, medição de cgroup nem limite imposto. Não extrapolar para 4K/8K, 10 minutos, outros codecs, simultaneidade ou memória do container. O supervisor acrescenta um processo Node por subprocesso, de forma sequencial. São 20 testes worker e 13 integrações focadas aprovados nesta etapa.

Roteiro de navegador executado no recorte seguinte: iniciar Next completo com logins sintéticos restritos e storage local, converter fixture, abrir o link autorizado e observar metadados/reprodução/seek; repetir sem token, com token de outra demanda e após revogação. Verificar o GET de autorização separadamente de uma URL já assinada, que continua válida até expirar. Nenhuma mídia real ou configuração de produção deve ser necessária.

## Next completo e navegador — 30/09/2026

Ensaio reproduzível (requer PostgreSQL sintético já migrado, ffmpeg/ffprobe, dependências do app instaladas e checkout sem .env):

```sh
DATABASE_URL_TEST=postgresql://postgres@127.0.0.1:55439/nuflow_test node scripts/ensaio-midia/next-local.mjs
```

O comando inicia Next **dev/webpack**, cria logins sem bypass e dados descartáveis, executa worker real e testa autorização HTTP. Imprime duas URLs locais: página pública real do Flow e player de medição do harness para seek/reprodução. Mantém o ambiente por até 15 minutos; SIGTERM/SIGINT após `ENSAIO_PRONTO` encerra e limpa fixtures/roles. `--verificar` executa apenas as verificações HTTP e encerra automaticamente. Usa `.next/dev` do checkout; não executar junto de outro Next dev neste checkout.

Comprovados localmente: conversão MOV/HEVC com áudio, prévia 640×360/6 s, checksum, token válido, recusa sem token/com token de outra demanda/revogado. Browser IAB abriu link do card real; player de medição fez seek em 3 s e terminou em 6 s sem erro. Simulador registrou três pedidos Range. A expiração foi acelerada no simulador; não é homologação do Supabase real.

O ensaio revelou contexto de empresa diferente entre bundles Next com Prisma compartilhado: corrigido em `org-contexto.ts` compartilhando a instância de AsyncLocalStorage, sem compartilhar o valor de cada requisição. Teste unitário intercala contextos e recarrega módulos. Produção em container, memória sob carga, coleta de órfãos e rollout seguem pendentes.

## Container com recursos limitados — preparado, execução pendente

```sh
node scripts/ensaio-midia/container.mjs
```

Requer Docker com daemon acessível e cgroup v2 que exponha `memory.max`, `memory.peak` e `memory.events`. Neste computador Docker/Podman não estão disponíveis: o comando encerrou com código 2, sem produzir medição. Não houve build de imagem, execução de container nem validação remota de CI nesta etapa.

O script constrói a imagem atual do worker e uma imagem derivada de ensaio com `procps`/testes. A construção baixa imagem/pacotes públicos; a execução usa `--network=none`, usuário `node`, filesystem somente leitura, sem volumes do host, sem capabilities e sem novas permissões. Usa init para recolher processos encerrados. Limites iniciais **de teste**, não dimensionamento aprovado: 768 MiB de memória e swap total (sem swap adicional), 2 CPUs, 256 processos, `/tmp` em tmpfs de 192 MiB contabilizado na memória do container. Os testes rodam sequencialmente, pois o worker processa uma conversão por instância.

`CGROUP_SINTETICO` registra o pico do cgroup e deltas de eventos OOM/oom_kill; qualquer OOM ou falha de teste reprova. `ESTADO_CONTAINER` registra também o estado final do Docker, inclusive quando o processo de medição é morto. Ausência de cgroup/limite reprova, nunca retorna aprovação baseada só em RSS. O script remove apenas seu container e tags aleatórias de ensaio; não executa prune. O contexto Docker tem allowlist, evitando enviar `.env`, recibos ou vídeos locais ao builder.

Job `worker-container` adicionado ao CI, separado dos testes locais já existentes. Não prova crash do container inteiro, persistência de volume após recriação, entrada 4K/8K/10 minutos, carga de produção ou Railway. O entrypoint de produção e a ativação do piloto permanecem inalterados.

## Critérios de inventário de órfãos (somente leitura)

Há classificador offline de snapshots (abaixo); não há coletor remoto, exclusão automática nem inventário real executado. A análise deverá ser restrita ao bucket privado e ao padrão de **prévias v2**, com organização conferida no banco; nunca tratar ausência de vínculo na amostra como prova de ausência no acervo.

| Situação encontrada | Classificação conservadora |
| --- | --- |
| Referência de fonte/original, URL atual, snapshot publicado, thumbnail, link de demanda ou aprovação, inclusive anterior | Preservar: ainda referenciado |
| Job ativo, tentativa/recibo ainda em reconciliação, inventário incompleto, acesso negado ou vínculo desconhecido | Preservar: inconclusivo |
| Objeto fora do padrão de prévia v2 ou pertencente a outra organização | Fora do escopo |
| Tentativa antiga sem referências em inventário completo e consistente | Candidato à revisão humana; não equivale a autorização para excluir |

O relatório deverá registrar empresa, bucket/chave, versão, job/tentativa, bytes, datas observadas e motivos, sem guardar URLs assinadas. Requer paginação completa tanto no storage quanto no banco e evidência de que não houve mudanças relevantes durante a análise. Falha em qualquer página torna o inventário inconclusivo. Antes de uma futura exclusão, serão necessárias política de retenção/carência aprovada, consideração do maior TTL de assinatura, nova conferência dos vínculos e lote auditável. Limpar um recibo local obsoleto não autoriza apagar o objeto remoto.

## Relatório offline de inventário — primeiro recorte

```sh
npm run midia:inventario -- snapshot.json relatorio.json
npm run test:inventario
```

Contrato v1 em `scripts/lib/inventario-midia.mjs` e exemplo inteiramente sintético em `docs/execucao-flow/2026-09-26/inventario-exemplo-sintetico.json`. A entrada contém organização, instante observado, carência explícita (mínimo técnico de 24 h, não política de retenção aprovada), objetos com bytes/datas, referências canônicas, vínculos de arquivos e jobs de conversão. `encerradoEm` deve vir do `finishedAt` do job, nunca da data de exportação. O CLI lê JSON local de até 32 MiB, recusa campos desconhecidos/URLs assinadas e gera arquivo novo com permissão 0600; não sobrescreve arquivos e não conecta a provedores/banco.

As cinco evidências de coleta completa/consistente e recibos conciliados são **declarações da origem do snapshot**. O classificador não prova essas condições. O coletor futuro deverá produzi-las com paginação, consistência e reconciliação verificáveis; exportação parcial deve marcá-las como falsas. Não usar o exemplo como evidência sobre dados reais.

Saída: `preservar`, `inconclusivo`, `fora_escopo` ou `revisar`, com motivo e contagem/bytes por classe. Bytes são strings decimais para evitar perda de precisão na soma; duplicatas de objetos não são somadas duas vezes e ficam inconclusivas. Totais não representam espaço recuperável. `autorizaExclusao` é sempre falso. Arquivo ausente, job desconhecido/ambíguo, lease ainda registrado, data futura ou ausência de encerramento impedem revisão como candidato. Nomes de jobs com hífens são conferidos contra o snapshot, não adivinhados.

Doze testes incluem referências de publicação/aprovação, organização divergente, coleta incompleta, job ativo, carência, duplicatas, ambiguidade, rejeição de tokens e execução real do CLI sem sobrescrita. A coleta automática e a interface administrativa continuam pendentes.

## Coleta operacional paginada — bloco consolidado

```sh
npm run midia:coletar -- ID_DA_EMPRESA 48 relatorio-novo.json
```

Requer `INVENTARIO_DATABASE_URL` (login app_user sem superuser/bypass/dono), `INVENTARIO_SUPABASE_URL` (origem HTTPS) e `INVENTARIO_STORAGE_KEY` para leitura/listagem. O comando não lê .env nem usa DATABASE_URL como fallback. Não colocar credenciais em argumentos/relatórios. Só faz consultas SELECT em transação READ ONLY e listagem de objetos; não escreve no banco/storage. Destino é arquivo novo 0600, sem sobrescrita.

Banco pagina por id em REPEATABLE READ; storage percorre pastas e páginas com ordem por nome, recusa repetição/traversal/metadados inválidos e limita orçamento. Duas passagens do banco/storage geram diagnósticos de estabilidade e cobertura, **não provam snapshot atômico entre serviços**. Referências das duas leituras são reunidas para preservar objetos ainda vistos em uso. Prazo global de 2 minutos para a listagem e limites/timeout de consulta; coleta interrompida não deve ser interpretada como inventário completo.

A cobertura atual inclui campos operacionais de Arquivo, Demanda e Aprovação (incluindo antiga) e jobs midia.converter. Não cobre todos os módulos/JSON, nem inspeciona os volumes de recibos dos workers. As flags de cobertura global, consistência e recibos permanecem falsas. Logo, objetos sem referência ficam inconclusivos; este comando não promove candidatos à exclusão nem mede economia de storage. Coleta real/provedor ainda não executada.

Provas adicionais: sete testes puros de paginação/instabilidade/falha e três integrações com PostgreSQL local, login restrito e SDK real contra HTTP loopback. Worker tem 21 testes, incluindo igualdade do hash dos pacotes de vídeo no remux e timeout independente. `next-local.mjs --h264` permite repetir a prova de navegador do remux. Aceite local de M02 e limites de homologação estão em `docs/execucao-flow/2026-09-26/M02-ACEITE-LOCAL.md`.

Na coleta, `leaseToken` do snapshot vale apenas `presente` ou null: o token de autorização real não é exportado. Qualquer lease ainda registrado impede classificar uma tentativa terminal como candidata.
