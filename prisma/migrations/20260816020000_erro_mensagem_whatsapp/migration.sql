-- Motivo da falha de envio no WhatsApp.
--
-- Aditiva e idempotente: só acrescenta colunas anuláveis (ou com padrão), não
-- reescreve nem apaga linha nenhuma. As 30 mensagens existentes ficam com
-- `erro` nulo e `tentativas` = 1, que é a verdade sobre elas — nunca soubemos
-- o motivo, e é exatamente esse buraco que esta migration fecha.
ALTER TABLE "mensagens_whatsapp" ADD COLUMN IF NOT EXISTS "erro" TEXT;
ALTER TABLE "mensagens_whatsapp" ADD COLUMN IF NOT EXISTS "tentativas" INTEGER NOT NULL DEFAULT 1;
