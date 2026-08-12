-- "No que estou agora" do painel do executor. Mora no vínculo pessoa-empresa
-- porque foco é da PESSOA numa empresa — cada um tem um de cada vez.
-- Sem FK de propósito: se a demanda sumir, a leitura não encontra e limpa.
ALTER TABLE "usuario_organizacao"
  ADD COLUMN "demandaEmFocoId" TEXT,
  ADD COLUMN "focoDesde" TIMESTAMP(3);
