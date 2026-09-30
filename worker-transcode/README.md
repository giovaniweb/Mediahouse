# Worker de mídia do Flow

## Estado da implementação

`index.mjs` é o servidor legado e ainda é o entrypoint do Docker. Ele assume o bucket público `uploads` e não tem lease persistido. **Não homologado para a nova fila privada.** O código é preservado até a substituição coordenada do consumidor/callback; copiar o motor novo para a imagem não ativa o fluxo v2.

`converter.mjs` é o motor v2 testado localmente, sem dependências npm. Usa Node 20.3+ (ou 22), ffmpeg e ffprobe. Não abre servidor, não cria fila em memória e não responde HTTP 202. A função `criarConversor(config)` devolve um executor com uma conversão simultânea; chamadas concorrentes recebem `worker_ocupado`.

## Contrato do motor v2

O servidor deve emitir este contrato **após reivindicar um job persistido e validar organização, arquivo e versão**:

- `jobId`, `leaseToken`, `organizacaoId`, `demandaId`, `arquivoId`, `fonteVersao`, `perfil: "h264-720p-v1"`;
- `bucket` e `objectKey` do original, extraídos da identidade persistida;
- `sourceUrl` de leitura assinada e `uploadUrl` de envio assinado, ambas temporárias e no host de storage configurado;
- `sha256` do original quando conhecido.

A configuração aceita `storageOrigin` (origem HTTPS sem caminho) e `tempRoot` opcional. Somente o teste local usa `permitirHttpLocal: true` com IP `127.0.0.1`. Esse parâmetro nunca deve vir do usuário. O motor não recebe service role nem escolhe destino externo.

Destino derivado, sempre no bucket privado `midia`:

`org/{org}/videos/{demanda}/previews/{arquivo}/{versao}/h264-720p-v1/{job}-{lease}.mp4`

O emissor deve criar uma assinatura de upload para esse caminho, sem sobrescrita. Tentativas diferentes produzem objetos diferentes; um worker antigo não sobrescreve o resultado novo. O callback deve conferir o lease e a versão antes de tornar a prévia visível. Uma saída órfã não pode ser apagada automaticamente.

## Processamento e limites do ensaio

- Entrada de até 100 MiB (também medidos durante streaming), duração de até 10 minutos; dimensão máxima de entrada 8192 px e 33.554.432 pixels.
- Download com timeout de 2 minutos e sem redirects; ffprobe limitado a 30 segundos; ffmpeg a 15 minutos. Listas de reprodução e protocolos de rede no ffmpeg são recusados.
- Perfil fixo v1: MP4/H.264, AAC 128 kbps se houver áudio, CRF 23, preset veryfast, yuv420p e faststart; no máximo 1280 px no maior lado, dimensões pares, sem ampliar. Entrada sem áudio gera saída sem áudio.
- Amostras com proporção de pixel não quadrada ou rotação não múltipla de 90° são recusadas explicitamente neste recorte.
- Saída limitada a 100 MiB, inspecionada novamente por ffprobe, enviada por stream. Checksum SHA-256 e tamanho do original e da prévia fazem parte do resultado; nenhuma modificação no original.
- Temporários ficam em diretório exclusivo e são limpos em sucesso, erro e aborto cooperativo. O controlador externo deve abortar o motor quando perder o lease. SIGKILL/reinício abrupto ainda exige reconciliação de diretórios e saída persistida pelo futuro consumidor.
- Não existe garantia de redução de tamanho. Este perfil prioriza reprodução; qualidade/HDR e desempenho em acervo real ainda precisam de homologação.

## Testar sem produção

```sh
npm test --prefix worker-transcode
```

A suíte gera clipes sintéticos, abre um storage simulado apenas em loopback, executa ffmpeg/ffprobe reais e limpa os arquivos. Cobre MOV/H.264, MOV/HEVC, MP4/HEVC, vertical, ausência de áudio, checksum, conteúdo inválido/playlist, tamanho/duração, storage indisponível, redirects, concorrência e aborto. Imprime medidas de tempo e tamanho; não mede o pico de memória dos subprocessos nem comprova reprodução em navegador. O CI inclui um job dedicado; execução remota ainda pendente.

## Pendências antes de ativar

Consumidor de `midia.converter`, renovação/aborto por lease, credenciais de curta duração, callback autenticado/idempotente, reconciliação após upload/crash, preservação e leitura autorizada de prévia no app, conciliação com transcode legado, limpeza pós-reinício e ensaio de navegador. Não publicar o Docker legado como se já fosse a versão durável privada.

Segredos devem ser gerados exclusivamente para o ambiente e guardados no provedor, nunca copiados de exemplos do repositório. O exemplo fixo anterior foi removido; se tiver sido usado em um ambiente real, sua substituição faz parte da preparação de publicação.
