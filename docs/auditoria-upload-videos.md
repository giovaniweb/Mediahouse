# Auditoria de Upload de Videos do NuFlow

## Contexto

O upload de videos do NuFlow esta demorando muito e, em alguns fluxos, o usuario nao recebe feedback claro de progresso. A auditoria identificou que o gargalo principal nao parece ser apenas velocidade de internet, mas uma combinacao de:

- upload sem barra real de progresso;
- fluxo inconsistente entre Supabase e Google Drive;
- rota antiga que ainda permite upload pesado passando pelo servidor;
- estados visuais pouco claros durante registro, geracao de link, envio de WhatsApp e transcode.

Este plano deve ser executado depois, com cuidado para nao quebrar o fluxo audiovisual existente.

## Achados Principais

### P1 - Upload principal de aprovacao sem progresso real

Arquivo:

`src/components/demandas/DemandaModal.tsx`

Problema:

O envio principal para aprovacao usa `fetch(uploadUrl, { body: file })`. O browser nao expoe progresso de upload via `fetch`, entao `uploadProgress` nunca atualiza de verdade.

Efeito:

O usuario ve "Finalizando..." ou spinner, mas nao sabe se o upload esta andando, travou ou caiu.

Observacao:

O proprio `DemandaModal.tsx` ja tem um fluxo melhor em `handleAdicionarVideo`, usando `XMLHttpRequest` e `xhr.upload.onprogress`. Esse padrao deve ser reaproveitado.

### P1 - Tela detalhada promete Google Drive, mas usa Supabase

Arquivo:

`src/app/(dashboard)/demandas/[id]/page.tsx`

Problema:

Existe a funcao `uploadParaDrive()` com upload em chunks e progresso, mas o fluxo real de envio final chama `uploadPresigned()`, que sobe para Supabase.

Efeito:

A UI diz "via Google Drive · sem limite de tamanho", mas o upload real pode estar limitado pelo Supabase/local. Isso cria expectativa errada e pode gerar a sensacao de travamento.

### P2 - Rota antiga faz upload pesado pelo servidor

Arquivo:

`src/app/api/demandas/[id]/upload-video/route.ts`

Problema:

O metodo `POST` ainda usa `req.formData()` e `file.arrayBuffer()`, carregando o arquivo inteiro no servidor antes de enviar para o Supabase.

Efeito:

Para video grande, isso pode estourar limite de ambiente serverless, consumir memoria e deixar o fluxo lento ou instavel.

Direcao:

Manter apenas o fluxo moderno: browser sobe direto para storage via URL assinada; depois o servidor registra a URL via `PATCH`.

### P2 - Bucket e verificado/criado em toda URL de upload

Arquivo:

`src/app/api/demandas/[id]/upload-url/route.ts`

Problema:

A rota tenta criar o bucket `uploads` em toda requisicao de URL assinada.

Efeito:

Adiciona chamada extra e latencia antes de cada upload.

Direcao:

Criar/verificar bucket em setup, seed, script admin ou cache em memoria por instancia.

### P2 - Transcode precisa de estado visual

Arquivo:

`src/lib/transcode.ts`

Problema:

Videos `.mov` e `.qt` podem ser enviados corretamente, mas ainda precisar de conversao para tocar bem no navegador.

Efeito:

O usuario pode achar que o upload falhou quando, na verdade, o arquivo esta aguardando/rodando transcode.

Direcao:

Mostrar estado depois do upload: "Upload concluido. Convertendo para reproducao...".

## Decisao Recomendada

Para a proxima implementacao, a recomendacao e:

1. Manter Supabase direto para o upload inicial de aprovacao.
2. Adicionar progresso real usando `XMLHttpRequest`.
3. Registrar a URL no NuFlow via `PATCH`.
4. Gerar link de aprovacao.
5. Enviar notificacao/WhatsApp.
6. Depois, se necessario, copiar/arquivar no Google Drive em background.

Motivo:

Esse caminho tende a ser mais rapido e mais estavel para o usuario do que enviar video grande pelo proxy do Drive no momento da acao.

## Plano de Execucao

### 1. Criar helper de upload com progresso

Criar um helper reutilizavel, por exemplo:

`src/lib/upload-with-progress.ts`

Com uma funcao parecida com:

```ts
uploadWithProgress(uploadUrl, file, contentType, onProgress)
```

Requisitos:

- usar `XMLHttpRequest`;
- atualizar progresso real de 0 a 100;
- tratar erro HTTP;
- tratar falha de conexao;
- permitir reuso em demandas, coberturas, campo e depoimentos no futuro.

### 2. Corrigir upload principal no `DemandaModal`

Arquivo:

`src/components/demandas/DemandaModal.tsx`

Trocar o `fetch(uploadUrl, { method: "PUT", body: file })` por `uploadWithProgress`.

Estados recomendados:

- `Preparando upload...`
- `Enviando 0-100%`
- `Registrando video...`
- `Gerando link de aprovacao...`
- `Enviando notificacao...`
- `Concluido`

### 3. Corrigir pagina completa da demanda

Arquivo:

`src/app/(dashboard)/demandas/[id]/page.tsx`

Aplicar o mesmo helper no `uploadPresigned()`.

Tambem corrigir a linguagem:

- se usar Supabase: nao escrever "Google Drive sem limite";
- se usar Drive: chamar `uploadParaDrive()` de fato.

### 4. Decidir destino do video final

Opcao recomendada para agora:

- Upload final para Supabase com progresso real.
- Link de aprovacao usa Supabase.
- Arquivamento no Drive pode acontecer depois, em background.

Opcao alternativa:

- Upload final direto para Drive usando `uploadParaDrive()`.
- Nesse caso, manter a mensagem "Google Drive sem limite", mas aceitar que sera mais lento por passar em chunks pelo servidor.

### 5. Desativar rota antiga de POST pesado

Arquivo:

`src/app/api/demandas/[id]/upload-video/route.ts`

Direcao:

- manter `PATCH` para registrar URL;
- remover, bloquear ou limitar fortemente `POST`;
- se bloquear, retornar `405` ou mensagem clara para nao usar upload server-side para videos.

### 6. Otimizar criacao de bucket

Arquivo:

`src/app/api/demandas/[id]/upload-url/route.ts`

Direcao:

- remover `createBucket` por requisicao;
- criar bucket em script/setup;
- ou cachear verificacao em memoria.

### 7. Melhorar feedback de transcode

Quando `transcodeStatus = processing`, mostrar no card/modal:

- "Video enviado";
- "Convertendo para reproducao";
- "Disponivel em breve";
- se falhar, mostrar "Conversao falhou, arquivo original disponivel".

## Criterios de Aceite

- Upload principal de aprovacao mostra barra real de 0 a 100%.
- Usuario sabe em qual etapa esta: preparando, enviando, registrando, gerando link, notificando.
- Upload adicional e upload principal usam o mesmo helper.
- Tela detalhada nao promete Google Drive se o arquivo estiver indo para Supabase.
- Upload de video grande nao passa inteiro pelo servidor.
- Rota antiga de POST nao vira gargalo silencioso.
- Coberturas e campo continuam funcionando.
- `tsc --noEmit` e `npm run build` passam.

## Prompt Para Executar Depois

```text
Quero corrigir e otimizar o fluxo de upload de videos do NuFlow, sem quebrar o audiovisual existente.

Contexto:
O upload de video esta demorando e a UI nao mostra progresso confiavel. A auditoria apontou que alguns fluxos usam fetch para enviar arquivo para URL assinada, entao nao existe progresso real. Outros fluxos, como cobertura/campo, ja usam XMLHttpRequest com xhr.upload.onprogress e funcionam melhor.

Objetivo:
Padronizar o upload de demandas com progresso real, estados claros e sem upload pesado passando pelo servidor.

Escopo:

1. Criar helper reutilizavel de upload com progresso.
   - Usar XMLHttpRequest.
   - Aceitar uploadUrl, file, contentType e callback onProgress.
   - Tratar HTTP error e erro de conexao.

2. Corrigir src/components/demandas/DemandaModal.tsx.
   - O upload principal "Enviar Video para Aprovacao" deve usar o helper com progresso real.
   - Hoje uploadPresigned usa fetch e uploadProgress nao atualiza.
   - Reaproveitar o padrao ja usado em handleAdicionarVideo.
   - Mostrar estados: preparando upload, enviando %, registrando video, gerando link, enviando notificacao, concluido.

3. Corrigir src/app/(dashboard)/demandas/[id]/page.tsx.
   - uploadPresigned tambem deve usar o helper com progresso real.
   - A UI nao pode dizer "via Google Drive · sem limite de tamanho" se o upload real esta indo para Supabase.
   - Se for manter Supabase, mostrar limite real.
   - Se for manter a promessa de Drive, chamar uploadParaDrive de fato.

4. Decisao recomendada:
   - Para agora, manter upload inicial no Supabase com progresso real.
   - Depois da aprovacao, arquivar/copiar para Google Drive em background, se necessario.
   - Nao usar Drive proxy como caminho principal se isso deixar o envio mais lento.

5. Revisar src/app/api/demandas/[id]/upload-video/route.ts.
   - Manter PATCH para registrar URL.
   - Desativar/remover/limitar POST que usa formData e file.arrayBuffer para video grande.
   - O video nao deve passar inteiro pelo servidor.

6. Revisar src/app/api/demandas/[id]/upload-url/route.ts.
   - Evitar tentar createBucket em toda requisicao.
   - Criar bucket em setup/script ou cachear verificacao.

7. Melhorar feedback de transcode.
   - Para .mov/.qt, apos upload mostrar estado "Convertendo para reproducao" quando transcodeStatus estiver processing.

Validacao:
- Upload de aprovacao mostra barra real de 0 a 100%.
- Upload adicional continua funcionando.
- Upload na pagina completa da demanda mostra progresso real.
- Nenhuma tela promete Google Drive se o destino real for Supabase.
- Rota POST pesada nao fica disponivel como caminho de video grande.
- Coberturas/campo nao quebram.
- Rodar prisma validate, tsc --noEmit e npm run build.
```
