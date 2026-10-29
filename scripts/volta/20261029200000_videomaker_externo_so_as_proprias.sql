-- VOLTA da migration 20261029200000_videomaker_externo_so_as_proprias.
--
-- Devolve `verTodasDemandas = true` aos 15 videomakers externos que a tinham em
-- produção em 29/10/2026, antes da migration (todos na Contourline). A lista
-- garante que a volta não alcança quem venha a ser criado depois.
--
-- Para devolver a UMA pessoa, prefira marcar "Ver Todas Demandas" na tela de
-- permissões: fica registrado na auditoria, e este script não.
--
-- Escrita em produção: roda só com o sim do Giovani, numa transação única
-- (`psql -1`). Não mexe em _prisma_migrations.

UPDATE permissoes_usuario
SET "verTodasDemandas" = true
WHERE "organizacaoId" = 'cmqfalbho0000u5gs46ok6e72'
  AND "usuarioId" IN (
  '1dc7e819-863f-4265-901a-06bc373dc619', -- Alef dos Santos
  '24c0625b-1de6-4e93-bd28-d6b1a7bf7bc0', -- Ana Fernanda de Bortoli de Paula Schultz
  '97061250-6c50-4093-8283-2b2b67e2a0e5', -- Bianca Ramos
  'b3eb9cf4-21f2-4389-8712-77988d41a921', -- Daniel Morato Abreu
  'cmmxc2a5p0008a01v8rbeuqqm',            -- Gabriel Landin
  'cmmxc3873000wa01v4lbgahy6',            -- Gustavo Silveira
  'e975ed71-bfa3-46ea-b87b-089fe13dc369', -- José S R Malcher Junior
  '29e0cea4-d901-4c2e-94fb-6d1df88c4477', -- Levi
  'cmuig3tbg000004kwtibct42v',            -- Loiane Mallmann
  'f59ca903-b848-4256-911f-29144f0f613e', -- MARCOS ANTONIO PAZ
  'cmuig3w12000304kw3qvk026g',            -- Raquel Pereira Martins
  '139216ed-df0b-40c1-aabc-f7b9553ab6dc', -- Ricardo Procopio
  '549aeee5-87b8-43f9-b1c6-1601d217f5f9', -- Ruan Souza
  '69d92df1-5179-413f-a656-2aefddaaa7f3', -- Sonivaldo José
  'cmtj1y48y000904l2l51lbwej'             -- Thiago Jhônanta da Silva Santos
  );
