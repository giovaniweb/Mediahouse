-- Editor e Designer viram perfil de REDE: as colunas privadas e o organizacaoId saem.
--
-- O que sai daqui vive, por empresa, em editor_organizacao/editor_dados_fiscais e
-- designer_organizacao/designer_dados_fiscais, preenchidas pelo backfill de 21/08.
-- O escopo por empresa passa a ser `vinculos: { some: { organizacaoId } }`.
--
-- ISTO E IRREVERSIVEL. A trava abaixo roda na MESMA transacao do DROP: se algum
-- valor ainda estiver sem equivalente por empresa, ela aborta e nada e apagado.
-- Mesmo padrao da Fase A, onde ela foi o que salvou o banco quando um preview da
-- Vercel aplicou o DROP sem revisao.

DO $$
DECLARE
  pendentes INT;
  amostra TEXT;
BEGIN
  -- 1) todo perfil precisa de vinculo: sem ele, ninguem enxerga a pessoa
  SELECT COUNT(*), STRING_AGG(nome, ', ' ORDER BY nome) INTO pendentes, amostra
  FROM (
    SELECT e.nome FROM editores e
    WHERE NOT EXISTS (SELECT 1 FROM editor_organizacao v WHERE v."editorId" = e.id)
    LIMIT 20
  ) q;
  IF pendentes > 0 THEN
    RAISE EXCEPTION 'Abortado: % editor(es) sem vinculo (%) - ficariam invisiveis para todas as empresas.', pendentes, amostra;
  END IF;

  SELECT COUNT(*), STRING_AGG(nome, ', ' ORDER BY nome) INTO pendentes, amostra
  FROM (
    SELECT d.nome FROM designers d
    WHERE NOT EXISTS (SELECT 1 FROM designer_organizacao v WHERE v."designerId" = d.id)
    LIMIT 20
  ) q;
  IF pendentes > 0 THEN
    RAISE EXCEPTION 'Abortado: % designer(s) sem vinculo (%).', pendentes, amostra;
  END IF;

  -- 2) o vinculo tem que estar na MESMA organizacao que a coluna que vai sumir,
  --    senao o dado migrou para a empresa errada
  SELECT COUNT(*), STRING_AGG(nome, ', ' ORDER BY nome) INTO pendentes, amostra
  FROM (
    SELECT e.nome FROM editores e
    WHERE e."organizacaoId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM editor_organizacao v
        WHERE v."editorId" = e.id AND v."organizacaoId" = e."organizacaoId")
    LIMIT 20
  ) q;
  IF pendentes > 0 THEN
    RAISE EXCEPTION 'Abortado: % editor(es) cujo vinculo esta em outra organizacao (%).', pendentes, amostra;
  END IF;

  -- 3) valor comercial preso no perfil precisa de equivalente no vinculo
  SELECT COUNT(*), STRING_AGG(nome, ', ' ORDER BY nome) INTO pendentes, amostra
  FROM (
    SELECT e.nome FROM editores e
    WHERE (e.salario IS NOT NULL
           OR e."emListaNegra" = TRUE
           OR NULLIF(TRIM(COALESCE(e.observacoes, '')), '') IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM editor_organizacao v
        WHERE v."editorId" = e.id
          AND (e.salario IS NULL OR v.salario IS NOT NULL)
          AND (e."emListaNegra" IS NOT TRUE OR v."emListaNegra" = TRUE)
          AND (NULLIF(TRIM(COALESCE(e.observacoes, '')), '') IS NULL
               OR NULLIF(TRIM(COALESCE(v.observacoes, '')), '') IS NOT NULL))
    LIMIT 20
  ) q;
  IF pendentes > 0 THEN
    RAISE EXCEPTION 'Abortado: % editor(es) com dado COMERCIAL sem destino no vinculo (%).', pendentes, amostra;
  END IF;

  -- 4) cargaLimite customizada nao pode se perder no caminho
  SELECT COUNT(*), STRING_AGG(nome, ', ' ORDER BY nome) INTO pendentes, amostra
  FROM (
    SELECT e.nome FROM editores e
    JOIN editor_organizacao v ON v."editorId" = e.id
    WHERE e."cargaLimite" IS DISTINCT FROM v."cargaLimite"
    LIMIT 20
  ) q;
  IF pendentes > 0 THEN
    RAISE EXCEPTION 'Abortado: % editor(es) com cargaLimite diferente entre perfil e vinculo (%).', pendentes, amostra;
  END IF;

  -- 5) fiscal preso no perfil precisa de equivalente. chavePix e dadosBancarios
  --    ficam CIFRADOS no destino: a checagem e de presenca, nunca de igualdade.
  SELECT COUNT(*), STRING_AGG(nome, ', ' ORDER BY nome) INTO pendentes, amostra
  FROM (
    SELECT e.nome FROM editores e
    WHERE (NULLIF(TRIM(COALESCE(e."cpfCnpj", '')), '') IS NOT NULL
           OR NULLIF(TRIM(COALESCE(e."chavePix", '')), '') IS NOT NULL
           OR NULLIF(TRIM(COALESCE(e."dadosBancarios", '')), '') IS NOT NULL
           OR NULLIF(TRIM(COALESCE(e.endereco, '')), '') IS NOT NULL
           OR NULLIF(TRIM(COALESCE(e."razaoSocial", '')), '') IS NOT NULL
           OR NULLIF(TRIM(COALESCE(e."nomeFantasia", '')), '') IS NOT NULL
           OR NULLIF(TRIM(COALESCE(e.representante, '')), '') IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM editor_dados_fiscais f
        WHERE f."editorId" = e.id
          AND (NULLIF(TRIM(COALESCE(e."cpfCnpj", '')), '') IS NULL OR NULLIF(TRIM(COALESCE(f."cpfCnpj", '')), '') IS NOT NULL)
          AND (NULLIF(TRIM(COALESCE(e."chavePix", '')), '') IS NULL OR NULLIF(TRIM(COALESCE(f."chavePix", '')), '') IS NOT NULL)
          AND (NULLIF(TRIM(COALESCE(e."dadosBancarios", '')), '') IS NULL OR NULLIF(TRIM(COALESCE(f."dadosBancarios", '')), '') IS NOT NULL)
          AND (NULLIF(TRIM(COALESCE(e.endereco, '')), '') IS NULL OR NULLIF(TRIM(COALESCE(f.endereco, '')), '') IS NOT NULL)
          AND (NULLIF(TRIM(COALESCE(e."razaoSocial", '')), '') IS NULL OR NULLIF(TRIM(COALESCE(f."razaoSocial", '')), '') IS NOT NULL)
          AND (NULLIF(TRIM(COALESCE(e."nomeFantasia", '')), '') IS NULL OR NULLIF(TRIM(COALESCE(f."nomeFantasia", '')), '') IS NOT NULL)
          AND (NULLIF(TRIM(COALESCE(e.representante, '')), '') IS NULL OR NULLIF(TRIM(COALESCE(f.representante, '')), '') IS NOT NULL))
    LIMIT 20
  ) q;
  IF pendentes > 0 THEN
    RAISE EXCEPTION 'Abortado: % editor(es) com dado FISCAL sem destino (%).', pendentes, amostra;
  END IF;

  RAISE NOTICE 'Conferencia passou: todo dado privado tem equivalente por empresa.';
END $$;


-- AlterTable
ALTER TABLE "designers" DROP COLUMN "chavePix",
DROP COLUMN "cpfCnpj",
DROP COLUMN "dadosBancarios",
DROP COLUMN "emListaNegra",
DROP COLUMN "endereco",
DROP COLUMN "listaNegraMotivo",
DROP COLUMN "nomeFantasia",
DROP COLUMN "observacoes",
DROP COLUMN "organizacaoId",
DROP COLUMN "razaoSocial",
DROP COLUMN "representante",
DROP COLUMN "salario",
DROP COLUMN "valorDiaria";

-- AlterTable
ALTER TABLE "editores" DROP COLUMN "cargaLimite",
DROP COLUMN "chavePix",
DROP COLUMN "cpfCnpj",
DROP COLUMN "dadosBancarios",
DROP COLUMN "emListaNegra",
DROP COLUMN "endereco",
DROP COLUMN "listaNegraMotivo",
DROP COLUMN "nomeFantasia",
DROP COLUMN "observacoes",
DROP COLUMN "organizacaoId",
DROP COLUMN "razaoSocial",
DROP COLUMN "representante",
DROP COLUMN "salario";

