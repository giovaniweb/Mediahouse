-- Deixar a verificação de RLS rodar fora do CI.
--
-- `scripts/verificar-rls.mjs` prova o isolamento virando o role da aplicação com
-- `SET LOCAL ROLE app_user` — que perde o BYPASSRLS e passa a obedecer às
-- políticas. No CI isso funciona porque lá o `postgres` é superusuário.
--
-- No Supabase ele NÃO é (`rolsuper = false`), e o Postgres só permite `SET ROLE`
-- para role do qual você é membro. Resultado: a verificação funcionava no banco
-- descartável e falhava com 42501 justamente no banco onde importa.
--
-- O GRANT abaixo torna quem administra o banco membro dos dois roles. Não
-- concede nada de novo: `app_user` e `app_auth` têm privilégios ESTRITAMENTE
-- MENORES que o dono, e continuam NOLOGIN. O que ele permite é o dono
-- REBAIXAR-SE temporariamente para conferir o que a aplicação vai enxergar.
--
-- `current_user` em vez de "postgres" cravado: em outra instalação o dono tem
-- outro nome, e uma migration que só funciona num banco não é uma migration.
DO $$
BEGIN
  EXECUTE format('GRANT "app_user", "app_auth" TO %I', current_user);
END $$;
