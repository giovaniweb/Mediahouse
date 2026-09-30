# Caderno 4 — Mídia, Drive, biblioteca e histórico

Não executar backfill no acervo real durante implementação. Ensaiar com arquivos sintéticos e originais de teste autorizados. Caminhos relativos à raiz escolhida em F00.

## M01 — Identidade do arquivo independente da URL

**Achados M01/M02. Arquivos:** schema Arquivo, lib/midia.ts, lib/transcode.ts, APIs de upload/finalização/galeria e transcode/callback.

1. Mapear campos existentes e criar apenas os faltantes: provedor, bucket/objectKey ou referência externa, organização/registro dono, tipo de uso, tamanho, MIME/codec, checksum quando disponível, versão e relação original/prévia.
2. Endereço de reprodução privado continua passando pela autorização. URL assinada não é persistida como identidade. Drive é uma cópia/referência com driveFileId e revisão, não substituição de Arquivo.url.
3. Adaptador de leitura cobre /api/midia, URL Supabase legada e link externo. Validar domínio/host e vínculo do objeto antes de qualquer download; não aceitar URL arbitrária enviada pelo modelo ou usuário para worker.
4. Novos uploads gravam metadados consistentes e evento de processamento na mesma transação de negócio quando possível. Objeto órfão é reconciliado por inventário; não apagar automaticamente.
5. Migration aditiva, com leitura compatível dos legados. Não deduzir organização pela URL sem conferir o vínculo do registro.

**Testes:** privado novo, público legado, Drive, link inválido, arquivo de B em demanda A, URL assinada expirada, mesmo arquivo referenciado por linkFinal e Arquivo; leitura antiga continua funcionando sob autorização.

**Aceite:** reprodução, original e cópia têm papéis distintos. Nenhum consumidor precisa procurar a palavra “supabase” para decidir se um arquivo existe.

## M02 — Transcode durável no bucket privado

**Arquivos:** worker-transcode/index.mjs e package.json, lib/transcode.ts, api/transcode/callback, admin/transcode-hevc, fila O01.

1. Worker consome job persistido ou recebe jobId autenticado e registra estado antes de confirmar. Nada de iniciar trabalho apenas em memória após HTTP 202. Um job por versão do original e perfil de prévia.
2. Obter objeto de origem autorizado em M01; processar em diretório temporário isolado por job; não usar caminho/command string vindo do usuário. ffprobe valida container, streams, duração, dimensões e codecs.
3. Perfil inicial de prévia: MP4 H.264/AAC, faststart, proporção preservada, sem aumentar resolução, maior dimensão até 1280 px; parâmetros de qualidade explícitos/configuráveis. Se original já for compatível, permitir reaproveitamento/remux quando apropriado. MP4 com HEVC ainda precisa análise.
4. Limite inicial do ensaio: uma conversão simultânea, arquivo até 100 MB e duração até 10 min; configurar e medir limites reais antes de produção. Entrada acima do limite gera estado explicável, nunca processamento ilimitado.
5. Subir saída por stream, preservar original e gravar checksum/tamanho. Destino privado dentro da organização; service role não vai ao navegador. Callback assinado/autenticado, vinculado a job/lease/versão, idempotente; retry de callback não repete conversão concluída.
6. Crash/restart e timeout recuperam job; limpeza temporária em sucesso/falha. Worker antigo não sobrescreve prévia de original novo.

**Testes locais reais:** MOV/H.264, MOV/HEVC, MP4/HEVC, vídeo vertical, sem áudio, arquivo inválido, limite excedido, storage indisponível e reinício. Usar clipes pequenos sintéticos. Verificar codec, duração aproximada, proporção e reprodução no navegador.

**Aceite:** concluído implica arquivo acessível ao ator autorizado e prévia validada; falha mantém original. Medir tempo, pico de memória e tamanho antes/depois sem prometer compressão de todo arquivo. Railway real é validação de L02.

## M03 — Cópia Drive idempotente e retomável

**Achado M01. Arquivos:** api/admin/sync-drive/route.ts, helpers de Google, ConfigEmpresa, metadados M01 e fila O01.

1. Selecionar entregáveis por identidade/metadados, incluindo /api/midia. Paginar, respeitar orçamento de execução e registrar checkpoint.
2. Chave: organização + arquivo/versionamento + destino. Guardar driveFileId, versão/checksum da cópia, estado, tentativa e erro; objeto já sincronizado não é enviado de novo.
3. Preparar referência identificável no Drive antes da operação para reconciliar falha após upload e antes do save local. Consultar essa referência no retry; não criar uma nova cópia cegamente.
4. Refresh token via S04. Token revogado vira “reconectar”; rate limit vira espera; permissão de pasta inválida vira erro claro. Não criar compartilhamento público por padrão.
5. Conservar original e URL de reprodução. UI distingue configurado, verificado e última sincronização com resultado. Separar verificação de leitura do teste que cria arquivo.

**Testes:** origem privada, legada e externa suportada; duas execuções; crash após upload; pasta de outra conta; refresh sem token novo; 401/403/429; troca de pasta/versão; callback/retry repetido.

**Aceite:** reexecutar fixture não duplica objetos; erro não apaga a biblioteca; token nunca sai no JSON. Upload real em pasta de teste requer ambiente/conta definidos em L02.

## M04 — Biblioteca, recuperação assistida e retenção

**Achados M04/H01. Arquivos:** galerias, historico, demandas/page.tsx, relatorios/finalizadas-sem-video, admin/backfills existentes e limpeza em cron/agentes.

1. Biblioteca unifica arquivo, arte e link aprovado com filtros por área/tipo/projeto/pessoa; mídia sem prévia exibe estado e ação. “Sem arquivo final” é filtro de qualidade, aplicável apenas aos tipos que exigem entregável.
2. Incluir histórico do serviço por demanda sem exigir arquivo: dados de execução/custo continuam acessíveis. Fila de Trabalho oculta concluídos antigos por regra de consulta paginada; Histórico mostra todos, com filtros.
3. Regra inicial: 30 dias desde conclusão para sair da fila; data ausente fica identificada como legado, não recebe hoje como conclusão inventada. Preservar rastreabilidade da reabertura.
4. Gerar simulação de recuperação: quantidade, referências encontradas, confiança e motivo. Classificar final não vinculado, entrega externa, legado sem dado e tipo sem arquivo. Nenhum bruto é promovido a final por tamanho/nome.
5. Toda aplicação de recuperação tem lote, pré-condição, operador, chave e relatório antes/depois; não preencher dados reais automaticamente no cartão.
6. Retenção separada para original, prévia e final. Default desta entrega: não excluir automaticamente. Corrigir textos/cron que confundem apagar link com apagar arquivo. Preparar configuração, dry run e carência; exclusão real requer política de negócio definida e autorização da operação.

**Testes:** final com 29/30/31 dias, reaberto, data nula, Growth sem vídeo por natureza, permissão restrita, ação repetida e storage ausente.

**Aceite:** sumir do quadro não apaga serviço/custo; pendência de acervo é visível sem acusar perda comprovada; nenhuma promessa de redução de GB sem inventário de armazenamento.


## Evidência de execução — 30/09/2026, primeiro recorte M01

Implementado localmente `midia-identidade.ts` e integrado ao transcode: classificação sem download, host de storage exato, vínculo de objeto com demanda/empresa antes da rede, renovação de assinatura e nenhuma alternativa para URL arbitrária. Reconversão/manutenção deixam de declarar aceite inexistente. Foram aprovados 712 unitários e 19 integrações focadas, tipos/lint/auditores e build webpack. Serviços externos simulados.

M01 permanece EM_EXECUCAO. Não há migração ou identidade persistida ainda. Próximo recorte: campos aditivos e metadados dos uploads, evento transacional e compatibilidade dos canais legados. Drive, galeria e worker completo continuam pendentes; nenhum backfill no acervo ou publicação foi feito. Detalhes e limitações no CONTROLE.md.


## Evidência de execução — 30/09/2026, segundo recorte M01

Metadados da fonte original persistidos por migração aditiva, sem preencher o legado. Canais existentes de criação recebem identidade reconhecível; uploads que passam pelo servidor recebem tamanho/hash reais e MIME explicitamente declarado. Registro de upload da demanda e link operacional agora são transacionais e reenvios da mesma confirmação não duplicam o arquivo. Documentos não alteram links de vídeos e brutos passam a ter Arquivo. Interface trata falha HTTP na confirmação.

Provas locais: 717 unitários, 305 integrações, 25 runtime/RLS, verificador de roles, tipos/build, lint sem erros e auditores. Migração aplicada só no banco sintético. M01 continua parcial: evento durável, consumidores por identidade persistida, preview/cópia/revisão Drive e inventário permanecem pendentes; detalhes no CONTROLE.md. Próximo: evento de processamento na transação e consumidor com lease em M02. Nenhuma homologação de worker/Drive real nesta etapa.
