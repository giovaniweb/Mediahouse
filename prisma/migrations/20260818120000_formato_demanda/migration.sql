-- Proporção da entrega ("9:16" | "16:9" | "1:1"), perguntada no formulário de
-- Nova Demanda. Aditiva e anulável: demanda antiga fica com NULL, nada quebra.
-- A tabela é "demandas": o model Demanda tem @@map("demandas"). Escrever o
-- nome do model aqui passa despercebido em banco já migrado e só estoura no
-- banco limpo do CI, com relation "Demanda" does not exist.
ALTER TABLE "demandas" ADD COLUMN "formato" TEXT;
