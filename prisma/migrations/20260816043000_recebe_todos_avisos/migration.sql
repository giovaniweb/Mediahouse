-- "Recebe todos os avisos" deixa de ser consequência do cargo.
--
-- Até aqui, receber todo aviso da operação era efeito colateral de ser
-- admin/gestor: para alguém acompanhar tudo precisava ganhar acesso total ao
-- sistema, e quem era gestor não tinha como desligar o próprio apito.
--
-- Coluna aditiva, com default: nenhuma linha existente muda de comportamento —
-- os gestores continuam recebendo pela regra antiga, que segue valendo em
-- paralelo (ver lib/notificados.ts).
ALTER TABLE "usuario_organizacao"
  ADD COLUMN IF NOT EXISTS "recebeTodosAvisos" BOOLEAN NOT NULL DEFAULT false;
