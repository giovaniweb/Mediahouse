-- Gravações Externas: quem opera (29/10/2026).
--
-- A pessoa marcada (a Débora) recebe no WhatsApp os avisos do dia a dia das
-- gravações: entrou para agendar, videomaker confirmou, material e nota
-- chegaram, vídeo pronto. Admin e gestor sem a marca só recebem quando a
-- gravação trava. É por empresa, como `recebeTodosAvisos`.
--
-- Aditiva: coluna nova com default falso. O código antigo não lê nem grava.
ALTER TABLE "usuario_organizacao" ADD COLUMN "operaGravacoes" BOOLEAN NOT NULL DEFAULT false;
