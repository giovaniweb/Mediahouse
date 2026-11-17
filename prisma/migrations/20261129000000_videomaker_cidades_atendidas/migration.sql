-- Mais de uma cidade por videomaker (16/11/2026).
--
-- O cadastro só aceitava uma cidade, então o Kevew Felix se cadastrou três
-- vezes (Itaperuna, Guarapari, Itaperuna de novo), com o mesmo telefone. Com o
-- número em mais de um cadastro da empresa, a identificação do WhatsApp fica
-- ambígua e todo aviso para ele é descartado sem erro.
--
-- `cidade` continua sendo a base; `cidadesAtendidas` são as outras cidades ou
-- regiões que ele atende. É dado do perfil da rede, público como a cidade, por
-- isso fica na própria tabela `videomakers`: as políticas de RLS dela já
-- valem para a coluna nova, e não há tabela nova para proteger.
--
-- Só acrescenta uma coluna com padrão vazio: nenhum dado existente muda, e o
-- código antigo continua funcionando (não lê a coluna).
--
-- Volta: scripts/volta/20261129000000_videomaker_cidades_atendidas.sql

ALTER TABLE "videomakers" ADD COLUMN "cidadesAtendidas" TEXT[] DEFAULT ARRAY[]::TEXT[];
