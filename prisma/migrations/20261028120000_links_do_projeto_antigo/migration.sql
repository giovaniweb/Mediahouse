-- Os links absolutos do Storage do projeto Supabase antigo passam a apontar
-- para o app (/api/midia), no bucket privado.
--
-- Até 24/08/2026 os arquivos iam para o bucket PÚBLICO `uploads` do projeto
-- antigo (`sddsqdzcfueajsvgocaa`, us-west-1), e o banco guardava a URL absoluta
-- dele. `prisma/migrar-bucket.ts` copiou o acervo para o bucket privado `midia`
-- em `org/{org}/legado/{caminho antigo}` e reescreveu arquivos, aprovações e
-- thumbnails. Ficaram de fora `demandas.linkFinal` e o vídeo do depoimento.
--
-- Em 28/10/2026 o Giovani decidiu levar os arquivos para o projeto de São Paulo
-- e apagar a conta antiga; links já mandados a clientes podem quebrar. Leitura
-- de produção do mesmo dia, só SELECT, mais consulta objeto a objeto ao Storage:
--   - 83 demandas com `linkFinal` = .../object/public/uploads/videos/{id}/final/{arquivo},
--     sempre com o {id} da própria demanda; a cópia existe, nos 83, em
--     `midia/org/{org}/legado/videos/{id}/final/{arquivo}`;
--   - 1 depoimento com `videoUrl` = .../uploads/depoimentos/{arquivo}; o vídeo foi
--     copiado no mesmo dia, dentro do projeto antigo, para
--     `midia/org/{org}/depoimentos/{id}/{arquivo}` (mesmo tamanho conferido);
--   - 20 mensagens de WhatsApp citam o link no texto e ficam como estão: são o
--     registro do que foi enviado ao cliente.
--
-- Só troca valores que casam exatamente com esses formatos. Banco sem nenhum
-- deles (teste, prévia) não muda. Sem gatilho de efeito: o único de `demandas`
-- (espelho) não age sem `app.org_id`, e `updatedAt` fica como está.
--
-- Volta: scripts/volta/20261028120000_links_do_projeto_antigo.sql.

UPDATE demandas
SET "linkFinal" = '/api/midia/org/' || "organizacaoId" || '/legado/' ||
  substring("linkFinal" from '^https://sddsqdzcfueajsvgocaa\.supabase\.co/storage/v1/object/public/uploads/(.+)$')
WHERE "linkFinal" ~ '^https://sddsqdzcfueajsvgocaa\.supabase\.co/storage/v1/object/public/uploads/videos/[a-zA-Z0-9_-]+/final/[a-zA-Z0-9_.-]+$'
  AND split_part("linkFinal", '/', 10) = id
  AND "organizacaoId" ~ '^[a-zA-Z0-9_-]+$';

UPDATE depoimentos
SET "videoUrl" = '/api/midia/org/' || "organizacaoId" || '/depoimentos/' || id || '/' ||
  substring("videoUrl" from '^https://sddsqdzcfueajsvgocaa\.supabase\.co/storage/v1/object/public/uploads/depoimentos/([a-zA-Z0-9_.-]+)$')
WHERE "videoUrl" ~ '^https://sddsqdzcfueajsvgocaa\.supabase\.co/storage/v1/object/public/uploads/depoimentos/[a-zA-Z0-9_.-]+$'
  AND "organizacaoId" ~ '^[a-zA-Z0-9_-]+$'
  AND id ~ '^[a-zA-Z0-9_-]+$';
