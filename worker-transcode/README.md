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

Perfil: MP4 H.264/AAC 128 kbps se houver áudio, CRF 23, veryfast, yuv420p, faststart, maior dimensão até 1280 px sem ampliar. Pixel não quadrado e rotação não múltipla de 90° são recusados neste recorte. Saída até 100 MiB e validação por ffprobe antes do upload. Não existe garantia de redução de tamanho; qualidade/HDR e custo real continuam a homologar.

Temporários ficam em `MIDIA_WORKER_STATE_DIR/temporarios`, isolados por conversão, e são limpos em sucesso, erro e aborto cooperativo. Na inicialização, o consumidor remove somente diretórios marcados como seguros cujo PID já não existe. Marcadores inválidos, symlinks, PIDs vivos/reutilizados e fases com possível subprocesso são preservados. Use volume exclusivo por instância; a identificação por PID pressupõe o mesmo namespace de processos, não coordena máquinas/containers compartilhando volume. `subprocesso.mjs` supervisiona cada ffmpeg/ffprobe por IPC: perda do worker encerra somente o filho criado pelo supervisor e aguarda `close` antes de marcar o temporário como seguro. Aborto e timeout também passam pelo supervisor. Morte simultânea do supervisor/worker ou queda antes de iniciar a supervisão ainda pode deixar temporários; saída remota órfã também permanece: **não há limpeza automática de acervo**. Um crash após upload e antes de persistir recibo, ou reinício após expiração do lease, pode exigir nova conversão; efeitos de conclusão são idempotentes, processamento computacional não é exactly-once. Recibos com lease vencido não autorizam publicação e são descartados localmente após 409. Volume perdido também perde recibos locais, mas o job continua no banco. Limpeza de órfãos remotos, queda do container inteiro e reconciliação administrativa ainda são pendências.

## Testes locais

```sh
npm test --prefix worker-transcode
```

20 testes: SIGKILL durante FFmpeg com encerramento do filho e nova conversão, amostragem de RSS, limpeza conservadora (inclusive symlinks/processo vivo), motor ffmpeg real com clipes sintéticos/storage loopback, formatos/codecs, vertical/sem áudio, conteúdo inválido, limites, checksum, falha de storage, redirects, concorrência/cancelamento; consumidor com API simulada para perda de resposta, reinício com recibo, lease perdido e falha permanente.

Suíte do app: integração com PostgreSQL sintético testa protocolo/callback/concorrência/versão/legado; runtime prova conclusão e isolamento sob RLS sem bypass. O ensaio `tests/integration/midia-processo.spec.ts` usa as rotas reais em um adaptador HTTP de teste, PostgreSQL e worker/ffmpeg em processos filhos. Interrompe o worker com SIGKILL após upload e após commit antes da resposta: comprova nova tentativa, rejeição do lease anterior, recuperação do recibo sem novo upload, hash da prévia, acesso com token e revogação. Assinaturas/storage e sessão anônima são simulados; o banco dessa suíte usa login administrativo, portanto não substitui a suíte runtime/RLS. Requer ffmpeg/ffprobe instalados e roda em `npm run test:integration` com `DATABASE_URL_TEST` explicitamente local. A expiração do lease é acelerada apenas na fixture.

São provas complementares: ainda não houve ensaio de ponta a ponta com processo Next, worker e storage real juntos, nem validação de navegador, Docker/Railway ou limites de memória sob carga. CI remoto permanece pendente.

Segredos devem ser exclusivos por ambiente e nunca copiados de exemplos antigos. Um exemplo fixo anterior foi removido; se tiver sido usado em ambiente real, sua substituição pertence à preparação de publicação.

## Ensaio de supervisão e memória — 30/09/2026

Teste local em macOS: clipe sintético H.264, 1920×1080, 30 fps, 8 segundos, sem áudio. A morte do worker por SIGKILL durante FFmpeg encerrou o conversor pelo supervisor; nenhum upload foi realizado nessa tentativa. O marcador só se tornou seguro após o filho terminar. Limpeza e nova conversão passaram.

Pico RSS **amostrado de 294 MiB**, somando worker Node, supervisor Node e FFmpeg/FFprobe; 13 amostras, intervalo mínimo de 25 ms acrescido do custo de `ps`. Uma repetição após o ajuste de inicialização registrou 283 MiB em 12 amostras. Não é pico exato, medição de cgroup nem limite imposto. Não extrapolar para 4K/8K, 10 minutos, outros codecs, simultaneidade ou memória do container. O supervisor acrescenta um processo Node por subprocesso, de forma sequencial. São 20 testes worker e 13 integrações focadas aprovados nesta etapa.

Próxima prova de navegador: iniciar Next completo com logins sintéticos restritos e storage local, converter fixture, abrir o link autorizado e observar metadados/reprodução/seek; repetir sem token, com token de outra demanda e após revogação. Verificar o GET de autorização separadamente de uma URL já assinada, que continua válida até expirar. Nenhuma mídia real ou configuração de produção deve ser necessária.
