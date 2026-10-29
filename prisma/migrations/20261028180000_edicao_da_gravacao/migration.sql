-- Gravações Externas: quem edita, combinado no agendamento (28/10/2026).
--
-- O videomaker externo pode entregar o vídeo editado, só os brutos para a nossa
-- edição, ou o cliente recebe sem edição. A planilha CONTROLE VIDEOMAKER
-- guardava isso em duas colunas ("Com edição", "Situação"); agora é um campo da
-- gravação, que o quadro mostra como etiqueta e o brief leva ao videomaker.
--
-- Aditiva: coluna nova e nula, sem default nem backfill. O código antigo não lê
-- nem grava, então pode rodar antes do deploy. O tipo, como os outros enums,
-- não precisa de GRANT: USAGE em tipo é de PUBLIC.
CREATE TYPE "EdicaoDaGravacao" AS ENUM ('videomaker', 'equipe', 'sem_edicao');

ALTER TABLE "demandas" ADD COLUMN "edicaoPor" "EdicaoDaGravacao";
