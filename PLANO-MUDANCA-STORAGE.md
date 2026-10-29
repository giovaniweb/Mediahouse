# Plano: levar os arquivos (Storage) para o projeto novo

Como tirar os vídeos, fotos e documentos do projeto antigo (`nuflow-prod`,
`sddsqdzcfueajsvgocaa`, `us-west-1`) e levar para o projeto de produção em São
Paulo (`zdvfizjsgsjsunaspzue`), que já tem o banco desde 07/09.

Escrito em **28/10/2026**. Este é o "Movimento 2" que o `RLS-PLANO-DE-VOO.md`
§7.1 deixou para depois da mudança de região do banco
(`PLANO-VIRADA-PRODUCAO.md`).

## Decisão do Giovani (28/10/2026)

- A conta antiga do Supabase **vai ser apagada**. Só vale a conta onde está o
  projeto de São Paulo.
- **Links já enviados a clientes** que apontam direto para o projeto antigo
  podem quebrar; se for preciso, ele reenvia.
- Objetivo: o sistema funcionando inteiro com o projeto novo. O resto fica
  para depois (ver "Fica para depois", no fim).

A primeira versão deste plano esperava semanas de tráfego zero antes de apagar
o projeto antigo, só para proteger esses links externos. Com a decisão, isso
sai.

## Estado em 29/10/2026

| etapa | quando | resultado |
|---|---|---|
| 1. Código do acervo `legado` | 29/10 01:06 | PR #111 no ar (`3f0ff98`) |
| 2. Migration dos links | 29/10 04:14 UTC | 83 `linkFinal` e 1 depoimento no formato do app; 0 no projeto antigo |
| 3. Projeto novo | 29/10 | chave em `~/nuflow-virada/storage-destino.env`; limite global 5000 MB (o primeiro envio de 175 MB deu 413 antes do ajuste) |
| 4. Primeira cópia | 29/10 01:04–01:34 | 399 objetos, 15,56 GB, 0 falhas |
| 5. Virada | 29/10 08:34 | Vercel trocada e produção reconstruída; o depoimento passou a sair do projeto novo às 08:36 |
| 6. Segunda cópia | 29/10 08:39 | nada novo: os 399 já estavam; `midia` idêntico (341 · 11,976 GB); os 214 do `uploads` antigo têm cópia |
| 7. Apagar | — | depende do Railway conferido e do Giovani |

O `.env.local` também passou para o projeto novo (backup em
`~/nuflow-virada/env-local-antes-storage.bak`). A volta da Vercel é
`bash ~/nuflow-virada/virada-storage.sh volta`.

---

## 1. Onde estamos

| | projeto |
|---|---|
| Banco | `zdvfizjsgsjsunaspzue`, `sa-east-1`, desde 07/09 |
| Arquivos | `sddsqdzcfueajsvgocaa`, `us-west-1`, desde sempre |

Storage antigo, medido em 28/10 (só leitura):

| bucket | tipo | objetos | tamanho | |
|---|---|---|---|---|
| `uploads` | público | 214 | 13,03 GB | fechado desde 24/08 |
| `midia` | privado | 328 | 10,93 GB | em uso |

O maior arquivo tem 394 MB, e 50 arquivos do `midia` passam de 50 MB. O app
aceita vídeos de até 500 MB. O Storage do projeto novo estava vazio, sem
nenhum bucket.

O banco guarda dois tipos de link:

- **462 do nosso app** (`/api/midia/...`): continuam valendo sem mudar nada,
  basta o arquivo existir no projeto novo com o mesmo caminho.
- **104 absolutos do projeto antigo**: 83 em `demandas.linkFinal`, 1 em
  `depoimentos.videoUrl` e 20 no texto de mensagens de WhatsApp.

## 2. Problema que já existia: o acervo `legado`

Desde o commit `d8b3c3e` (28/09), a rota `/api/midia` recusava caminhos
`org/<empresa>/legado/...`, a cópia do acervo antigo feita em 24/08. Resultado:
104 arquivos (79 finais, 25 documentos) e 100 aprovações de vídeo davam 404
para todo mundo. Consertado nesta branch (Etapa 1).

## 3. As etapas

| | o que | quem | tira do ar? | como volta |
|---|---|---|---|---|
| 1 | Código: acervo `legado` volta a abrir | PR | não | reverter o PR |
| 2 | Links absolutos do banco apontam para o app | migration | não | `scripts/volta/` |
| 3 | Preparar o projeto novo | Giovani, no painel | não | — |
| 4 | Primeira cópia | script | não | apagar os buckets novos |
| 5 | Virada das variáveis | Vercel + Railway | não | valores antigos + redeploy |
| 6 | Segunda cópia e conferência | script | não | — |
| 7 | Apagar a conta antiga | Giovani | — | **não tem volta** |

### Etapa 1 — Código do acervo `legado` (branch `storage/projeto-novo`)

`partesDaMidia` lê dono, tipo e id dos dois formatos de caminho:
`org/{org}/{tipo}/{id}/...` e `org/{org}/legado/{tipo}/{id}/...`. A rota de
mídia, a checagem de acesso (`podeLerMidia`), a publicação (`urlPublicavel`,
coberturas) e a identidade do vídeo (`videoDaDemanda`) passam a usá-la. O
vínculo exato no banco continua obrigatório: o caminho só localiza empresa,
tipo e id. Testes unitários e de integração com os formatos reais.

### Etapa 2 — Links absolutos (migration `20261028120000_links_do_projeto_antigo`)

- **83 demandas**: `linkFinal` passa a apontar para a cópia
  `org/{org}/legado/videos/{id}/final/{arquivo}`. As 83 cópias existem no
  `midia` (conferido objeto a objeto em 28/10).
- **1 depoimento**: o vídeo não tinha cópia. Foi copiado em 28/10, dentro do
  projeto antigo, para `midia/org/{org}/depoimentos/{id}/`, com o mesmo
  tamanho conferido. A migration aponta para lá.
- **20 mensagens de WhatsApp**: ficam como estão. São o registro do que foi
  enviado ao cliente.

Ensaiada num Postgres local: troca só o que casa com o formato, rodar duas
vezes não muda nada, e a volta restaura os valores. Pela regra do workflow, o
código vai antes: **aplicar só depois do deploy da Etapa 1.** Com o código no
ar, os novos links funcionam já no projeto antigo, então a migration não
depende da virada.

### Etapa 3 — Preparar o projeto novo (Giovani, no painel do Supabase)

1. Colar a chave `service_role` do projeto novo em
   `~/nuflow-virada/storage-destino.env` (arquivo `600`, fora do Git).
2. Storage → Settings: "Upload file size limit" em **500 MB**. Exige o plano
   **Pro**: o gratuito tem 1 GB de espaço e 50 MB por arquivo.

### Etapa 4 — Primeira cópia (`scripts/storage/copiar-projeto.mjs`)

- `midia`: tudo, com o mesmo caminho, no `midia` privado do projeto novo.
- `uploads`: só o que não tem cópia idêntica (mesmo tamanho) no
  `midia/org/*/legado/`. O resto vai para um bucket `uploads` **privado** no
  projeto novo, como arquivo morto: nada se perde quando a conta antiga sumir.
- Nunca apaga nem sobrescreve; confere tamanho e MD5; grava relatório com
  sha256 em `~/nuflow-virada/`. O sistema continua no projeto antigo enquanto
  isso.

### Etapa 5 — Virada (~10 minutos, sem tirar do ar)

1. Guardar os valores atuais num arquivo `600` (a Vercel não devolve variável
   sensível).
2. Vercel: `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` para o
   projeto novo. Hoje elas valem para Production e Preview juntas; as prévias
   continuam usando o mesmo Storage que a produção, como já acontece.
3. Railway (`nuflow-midia-worker`): `SUPABASE_URL` para o projeto novo. O
   worker só usa a origem, porque recebe URLs assinadas do app.
4. Redeploy da Vercel (as `NEXT_PUBLIC_*` entram no build).
5. Conferir: abrir vídeo novo e antigo, enviar arquivo numa demanda de teste,
   abrir uma aprovação por link.

Um envio que começar no minuto da troca pode cair no projeto antigo; a
Etapa 6 o traz.

### Etapa 6 — Segunda cópia e conferência

Rodar o script de novo. Ele pega o que entrou no antigo durante a virada.
Conferir contagem e bytes por bucket nos dois projetos e testar de novo as
telas.

### Etapa 7 — Apagar a conta antiga (Giovani)

Só depois da Etapa 6 conferida, e com uma checagem de que nenhuma variável da
Vercel, do Railway ou do `.env.local` aponta para `sddsqdzcfueajsvgocaa`.
**Não tem volta**: o backup do Supabase não cobre arquivos. Ver também o aviso
abaixo.

---

## 4. Fica para depois

- **A conta antiga tem mais coisas.** Pela imagem do painel enviada em 28/10,
  a mesma organização tem `nuflow-preview` e `nuflow-preview-sp` (os bancos das
  prévias da Vercel) e projetos da Contourline, Partnerzone, Prestador de
  Contas e SDR. Apagar a conta apaga todos.
- **Prévias da Vercel** gravam no Storage de produção (já era assim antes).
- **Variáveis velhas**: `NEXT_PUBLIC_SUPABASE_ANON_KEY` não é usada pelo código
  e continua apontando para o projeto antigo.
- **Links das 20 mensagens de WhatsApp** quebram quando a conta antiga for
  apagada.
