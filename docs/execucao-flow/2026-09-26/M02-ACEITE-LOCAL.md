# M02 — aceite técnico local do worker privado

Bloco consolidado em 30/09/2026. Leitura crítica do código e das provas pelo mesmo executor; não é revisão independente nem homologação de produção.

## Decisão de fechamento

M02 pode ser marcado **IMPLEMENTADO / EXTERNA_PENDENTE / CONFERIDA / NAO_PUBLICADO** conforme a política do PLANO-MESTRE: implementação exige código e verificações locais do cartão; provedor real e Railway são homologação externa/L02. Isto não conclui M01 (todos os consumidores/identidades), M03 (Drive), M04 (biblioteca/retenção) nem I01 (dimensionamento/custo global).

O inventário de órfãos não é uma pré-condição para o worker converter com segurança: nenhuma exclusão remota está habilitada. Sua coleta e reconciliação continuam acompanhadas separadamente. Não manter M02 indefinidamente aberto por acrescentar a ele o escopo desses outros cartões.

| Critério de M02 | Código e prova local |
| --- | --- |
| Job persistido por arquivo/versão/perfil; preparação e intenção transacionais | `midia-fila.ts`, `fila-duravel.ts`; testes de registro, fila e protocolo com PostgreSQL |
| Autorização por empresa/lease; uma conversão ativa por empresa | API `/api/transcode/worker`, protocolo e testes de concorrência; login sem bypass no runtime e Next completo |
| Fonte assinada e vinculada, sem URL arbitrária; isolamento do original | `midia-worker.ts`, contrato do motor e testes de caminhos/checksum; original preservado no banco e storage sintético |
| ffprobe antes/depois; MP4 H.264/AAC, faststart, até 1280 sem ampliar | FFmpeg/FFprobe reais em testes MOV/H.264, MOV/HEVC, MP4/HEVC, vertical e sem áudio |
| Reaproveitar quando apropriado | H.264/yuv420p, perfis compatíveis até nível 4.1, até 1280, sem rotação e áudio AAC-LC mono/estéreo conhecido: remux privado. Hash dos pacotes de vídeo antes/depois idêntico; demais casos recodificam |
| Limites e falhas | 100 MiB na entrada/saída, 10 minutos, limite de dimensões; testes de tamanho com/sem cabeçalho, duração, inválidos, redirect, checksum e storage indisponível |
| Callback idempotente, original preservado | Recibo local persistido, recibo da prévia no banco e conclusão atômica; replay não repete efeito |
| Crash/restart/lease obsoleto | SIGKILL após upload, após commit e durante FFmpeg; novo lease usa outra chave; callback antigo recusado; supervisor mata seu filho e libera temporário após término |
| Timeout/cancelamento | Timeout próprio do supervisor verificado com FFmpeg real; aborto e perda de lease testados; fila permite retomada limitada |
| Reprodução autorizada | Next dev completo, logins app_user/app_auth sintéticos, RLS ativo, SDK contra storage local; navegador IAB carregou/avançou/terminou prévia HEVC convertida e H.264 remux em 6 s sem erro |
| Memória/tempo/tamanho medidos localmente | Relatórios de testes registram duração/bytes; amostragem RSS do conjunto em clipe 1080p sintético. Não é dimensionamento nem pico exato de container |

## O que não está homologado

- Docker/cgroup, falta de memória do container, recriação do container com volume e queda simultânea dos supervisores. Harness e CI existem; Docker/Podman indisponíveis localmente, sem execução remota.
- Supabase real, assinaturas/Range/CORS reais, Vercel/Railway, healthcheck de background, segredo dedicado/volume e piloto coordenado.
- 4K/8K/10 minutos sob carga, HDR/qualidade percebida, formatos além dos ensaiados, navegadores além do IAB e custo real. Limites locais não prometem capacidade de produção.
- URLs já assinadas continuam válidas até TTL; revogação do token impede novas autorizações, não revoga a assinatura anterior.
- Recodificação pode repetir depois de crash antes do recibo; somente o efeito de conclusão é idempotente. Não prometer execução computacional única.

Ativação v2 permanece desligada por padrão e limitada à empresa-piloto no servidor. Não liberar a venda a partir deste documento.

## Entrega adicional do bloco: coleta de inventário

CLI de leitura explícita, PostgreSQL com login restrito e transação REPEATABLE READ READ ONLY, paginação por id, SDK Supabase com paginação de pastas/objetos, limite de páginas e segunda passagem. Registra referências operacionais de Arquivo/Demanda/Aprovação e jobs de conversão.

Não oferece cobertura global de JSON/outros módulos nem reconciliação dos recibos persistentes dos workers. Por isso declara `referenciasCompletas=false`, `recibosConciliados=false` e `consistente=false`; dupla leitura igual só é estabilidade observada. Objetos sem referência ficam **inconclusivos**, nunca autorizados para exclusão. Este limite é deliberado, não evidência de acervo perdido.
