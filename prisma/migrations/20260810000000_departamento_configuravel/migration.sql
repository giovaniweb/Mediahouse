-- Departamento deixa de ser enum e passa a ser texto validado contra
-- ConfigParametro (grupo "departamentos"), por empresa.
--
-- ATENÇÃO: o `prisma migrate diff` gera DROP COLUMN + ADD COLUMN para esta
-- mudança, o que apagaria o departamento das demandas existentes. O ALTER com
-- USING abaixo converte preservando os valores.

ALTER TABLE "demandas"
  ALTER COLUMN "departamento" TYPE TEXT USING "departamento"::text;

DROP TYPE "Departamento";

-- A unicidade dos parâmetros precisa ser por empresa: sem organizacaoId no
-- índice, a primeira empresa a cadastrar "crm" impediria as demais.
DROP INDEX IF EXISTS "config_parametros_grupo_valor_key";
CREATE UNIQUE INDEX "config_parametros_organizacaoId_grupo_valor_key"
  ON "config_parametros" ("organizacaoId", "grupo", "valor");

-- Semeia os departamentos que existiam no enum para cada empresa, para que
-- ninguém fique sem opções no formulário depois da troca. Idempotente.
INSERT INTO "config_parametros" ("id", "organizacaoId", "grupo", "valor", "label", "ordem", "ativo", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  o."id",
  'departamentos',
  d."valor",
  d."label",
  d."ordem",
  true,
  now(),
  now()
FROM "organizacoes" o
CROSS JOIN (VALUES
  ('growth',        'Growth',        1),
  ('audiovisual',   'Audiovisual',   2),
  ('eventos',       'Eventos',       3),
  ('institucional', 'Institucional', 4),
  ('rh',            'RH',            5),
  ('outros',        'Outros',        6)
) AS d("valor", "label", "ordem")
ON CONFLICT ("organizacaoId", "grupo", "valor") DO NOTHING;
