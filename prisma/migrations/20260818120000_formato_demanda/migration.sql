-- Proporção da entrega ("9:16" | "16:9" | "1:1"), perguntada no formulário de
-- Nova Demanda. Aditiva e anulável: demanda antiga fica com NULL, nada quebra.
ALTER TABLE "Demanda" ADD COLUMN "formato" TEXT;
