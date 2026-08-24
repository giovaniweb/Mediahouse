-- Perfil global de videomaker para de guardar dado privado.
--
-- `videomakers` é a tabela da REDE: compartilhada entre as empresas e, sob RLS,
-- legível por qualquer organização. Enquanto guardar diária negociada, CPF, PIX,
-- lista negra e observação interna, abrir a leitura entrega o preço que cada
-- cliente combinou e o documento do profissional para a plataforma inteira.
--
-- O destino já existe e está preenchido:
--   videomaker_organizacao   -> valorDiaria, emListaNegra, listaNegraMotivo, observacoes
--   videomaker_dados_fiscais -> cpfCnpj, razaoSocial, nomeFantasia, representante,
--                               endereco, chavePix, dadosBancarios (os dois ultimos cifrados)
--
-- ISTO E IRREVERSIVEL. A trava abaixo e a ultima defesa: se sobrar qualquer valor
-- sem equivalente por empresa, a migration aborta e nada e apagado. Roda na mesma
-- transacao, entao o resultado e tudo ou nada.

DO $$
DECLARE
  pendentes INT;
  amostra TEXT;
BEGIN
  -- Comercial: todo valor preso no perfil global precisa de vinculo com o campo
  -- correspondente preenchido.
  SELECT COUNT(*), STRING_AGG(nome, ', ' ORDER BY nome) INTO pendentes, amostra
  FROM (
    SELECT vm.nome FROM videomakers vm
    WHERE (
      vm."valorDiaria" IS NOT NULL
      OR vm."emListaNegra" = TRUE
      OR NULLIF(TRIM(COALESCE(vm.observacoes, '')), '') IS NOT NULL
      OR NULLIF(TRIM(COALESCE(vm."listaNegraMotivo", '')), '') IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM videomaker_organizacao vo
      WHERE vo."videomakerId" = vm.id
        AND (vm."valorDiaria" IS NULL OR vo."valorDiaria" IS NOT NULL)
        AND (vm."emListaNegra" IS NOT TRUE OR vo."emListaNegra" = TRUE)
        AND (NULLIF(TRIM(COALESCE(vm.observacoes, '')), '') IS NULL
             OR NULLIF(TRIM(COALESCE(vo.observacoes, '')), '') IS NOT NULL)
        AND (NULLIF(TRIM(COALESCE(vm."listaNegraMotivo", '')), '') IS NULL
             OR NULLIF(TRIM(COALESCE(vo."listaNegraMotivo", '')), '') IS NOT NULL)
    )
    LIMIT 20
  ) q;

  IF pendentes > 0 THEN
    RAISE EXCEPTION 'Abortado: % perfil(is) com dado COMERCIAL sem destino em videomaker_organizacao (%). Rode: PERMITIR_BANCO_PRODUCAO=sim npm run sanear:perfil-global -- --aplicar', pendentes, amostra;
  END IF;

  -- Fiscal: mesma ideia contra videomaker_dados_fiscais.
  SELECT COUNT(*), STRING_AGG(nome, ', ' ORDER BY nome) INTO pendentes, amostra
  FROM (
    SELECT vm.nome FROM videomakers vm
    WHERE (
      NULLIF(TRIM(COALESCE(vm."cpfCnpj", '')), '') IS NOT NULL
      OR NULLIF(TRIM(COALESCE(vm."chavePix", '')), '') IS NOT NULL
      OR NULLIF(TRIM(COALESCE(vm."dadosBancarios", '')), '') IS NOT NULL
      OR NULLIF(TRIM(COALESCE(vm.endereco, '')), '') IS NOT NULL
      OR NULLIF(TRIM(COALESCE(vm."razaoSocial", '')), '') IS NOT NULL
      OR NULLIF(TRIM(COALESCE(vm."nomeFantasia", '')), '') IS NOT NULL
      OR NULLIF(TRIM(COALESCE(vm.representante, '')), '') IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM videomaker_dados_fiscais f
      WHERE f."videomakerId" = vm.id
        AND (NULLIF(TRIM(COALESCE(vm."cpfCnpj", '')), '') IS NULL
             OR NULLIF(TRIM(COALESCE(f."cpfCnpj", '')), '') IS NOT NULL)
        -- chavePix e dadosBancarios ficam CIFRADOS no destino: o texto nao bate
        -- com a origem, entao a checagem e de presenca, nunca de igualdade.
        AND (NULLIF(TRIM(COALESCE(vm."chavePix", '')), '') IS NULL
             OR NULLIF(TRIM(COALESCE(f."chavePix", '')), '') IS NOT NULL)
        AND (NULLIF(TRIM(COALESCE(vm."dadosBancarios", '')), '') IS NULL
             OR NULLIF(TRIM(COALESCE(f."dadosBancarios", '')), '') IS NOT NULL)
        AND (NULLIF(TRIM(COALESCE(vm.endereco, '')), '') IS NULL
             OR NULLIF(TRIM(COALESCE(f.endereco, '')), '') IS NOT NULL)
        AND (NULLIF(TRIM(COALESCE(vm."razaoSocial", '')), '') IS NULL
             OR NULLIF(TRIM(COALESCE(f."razaoSocial", '')), '') IS NOT NULL)
        AND (NULLIF(TRIM(COALESCE(vm."nomeFantasia", '')), '') IS NULL
             OR NULLIF(TRIM(COALESCE(f."nomeFantasia", '')), '') IS NOT NULL)
        AND (NULLIF(TRIM(COALESCE(vm.representante, '')), '') IS NULL
             OR NULLIF(TRIM(COALESCE(f.representante, '')), '') IS NOT NULL)
    )
    LIMIT 20
  ) q;

  IF pendentes > 0 THEN
    RAISE EXCEPTION 'Abortado: % perfil(is) com dado FISCAL sem destino em videomaker_dados_fiscais (%). Rode: PERMITIR_BANCO_PRODUCAO=sim npm run sanear:perfil-global -- --aplicar', pendentes, amostra;
  END IF;

  -- Perfil interno sem vinculo fica invisivel para TODAS as empresas sob a
  -- politica de RLS (interno so aparece para quem tem vinculo). Aconteceu em
  -- producao com um cadastro do mesmo dia.
  SELECT COUNT(*), STRING_AGG(nome, ', ' ORDER BY nome) INTO pendentes, amostra
  FROM (
    SELECT vm.nome FROM videomakers vm
    WHERE vm."tipoContrato" = 'interno'
      AND NOT EXISTS (SELECT 1 FROM videomaker_organizacao vo WHERE vo."videomakerId" = vm.id)
    LIMIT 20
  ) q;

  IF pendentes > 0 THEN
    RAISE EXCEPTION 'Abortado: % profissional(is) INTERNO(s) sem vinculo (%) - ficariam invisiveis para todas as empresas sob RLS.', pendentes, amostra;
  END IF;

  RAISE NOTICE 'Conferencia passou: nenhum dado privado sem destino.';
END $$;

-- AlterTable
ALTER TABLE "videomakers" DROP COLUMN "chavePix",
DROP COLUMN "cpfCnpj",
DROP COLUMN "dadosBancarios",
DROP COLUMN "emListaNegra",
DROP COLUMN "endereco",
DROP COLUMN "listaNegraMotivo",
DROP COLUMN "nomeFantasia",
DROP COLUMN "observacoes",
DROP COLUMN "razaoSocial",
DROP COLUMN "representante",
DROP COLUMN "valorDiaria";
