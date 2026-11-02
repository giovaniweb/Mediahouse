-- Videomaker externo volta a ver só as demandas em que está escalado.
--
-- De 15/08 a 29/10/2026 o preset `videomaker` (src/lib/permissoes.ts) dava
-- `verTodasDemandas`, e `criarUsuarioParaProfissional` copia o preset para o
-- registro explícito de quem é criado. O registro explícito vence o preset, então
-- só corrigir o preset não alcança quem já existe. Em 29/10 o Giovani viu a
-- conta do Gabriel Landin (videomaker externo) abrir os 263 cards da Contourline.
--
-- Leitura de produção do mesmo dia, só SELECT: 15 vínculos `videomaker` +
-- `externo` com `verTodasDemandas = true`, todos na Contourline — 13 com registro
-- gravado entre 01/09 e 21/10, já com o preset novo, e 2 marcados em maio
-- (Gabriel Landin e Gustavo Silveira), quando a rota ainda prendia videomaker às
-- próprias e a marca não tinha efeito. Só esta chave muda; editar, excluir e
-- mover ficam como estão e passam a valer só para os cards de cada um.
--
-- Videomaker com vínculo `interno` não é tocado. Banco sem nenhum (teste,
-- prévia) não muda. Sem gatilho em `permissoes_usuario`; `updatedAt` fica.
--
-- Volta: scripts/volta/20261029200000_videomaker_externo_so_as_proprias.sql.

UPDATE permissoes_usuario pu
SET "verTodasDemandas" = false
FROM usuario_organizacao uo
WHERE uo."usuarioId" = pu."usuarioId"
  AND uo."organizacaoId" = pu."organizacaoId"
  AND uo.papel = 'videomaker'
  AND uo.categoria = 'externo'
  AND pu."verTodasDemandas" = true;
