-- O gate de RLS volta a conseguir rodar num banco recém-criado.
--
-- Descoberto em 03/09/2026, ao levantar o preview de São Paulo a partir de um
-- projeto Supabase vazio: `scripts/verificar-rls.mjs` morria logo na primeira
-- verificação com
--
--     permission denied to set role "app_user"
--
-- A causa é uma mudança de comportamento do PostgreSQL 16: quando um role com
-- CREATEROLE (aqui, `postgres`) cria outro role, ele passa a receber apenas
-- ADMIN OPTION sobre o novo role — e ADMIN não inclui SET. Sem SET, o
-- `SET LOCAL ROLE app_user` do verificador é recusado.
--
-- Por que ninguém tinha visto: no banco de produção essa concessão EXISTE. Ela
-- não veio de `20260826000000_rls_isolamento` — veio de alguém tendo feito o
-- GRANT à mão, em algum momento, para destravar o verificador. O banco de
-- produção ficou certo e a migration ficou errada, e a diferença só aparece no
-- dia em que o schema é levantado do zero. Que é exatamente o dia da mudança de
-- região.
--
-- ESTA MIGRATION NÃO AFETA A APLICAÇÃO. Ela conecta direto como `app_user` pela
-- DATABASE_URL e nunca executa SET ROLE. O que está sendo consertado é a
-- capacidade de PROVAR o isolamento — e um gate que não roda é um gate que as
-- pessoas aprendem a pular.
--
-- Segura de aplicar a qualquer momento, em qualquer ordem em relação ao deploy:
-- não toca em tabela, dado, política ou privilégio de tabela.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) A CONCESSÃO
--
-- `INHERIT FALSE` é deliberado: o dono do banco pode ASSUMIR o papel para
-- testar, e não herda os privilégios dele passivamente. É o mínimo que o
-- verificador precisa, e nada além disso.
--
-- `current_user` em vez de `postgres` literal: quem aplica a migration é quem
-- vai rodar o verificador. Num projeto novo com outro nome de dono, isto
-- continua correto.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    EXECUTE format('GRANT "app_user" TO %I WITH INHERIT FALSE, SET TRUE', current_user);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_auth') THEN
    EXECUTE format('GRANT "app_auth" TO %I WITH INHERIT FALSE, SET TRUE', current_user);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) TRAVA DE SAÍDA
--
-- Mesma disciplina das migrations anteriores: se a concessão não pegou, a
-- transação aborta aqui e o problema aparece agora — não daqui a três semanas,
-- quando alguém for rodar o verificador na janela da virada.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  faltando TEXT;
BEGIN
  SELECT string_agg(r.rolname, ', ')
    INTO faltando
    FROM (VALUES ('app_user'), ('app_auth')) AS r(rolname)
   WHERE EXISTS (SELECT 1 FROM pg_roles p WHERE p.rolname = r.rolname)
     AND NOT EXISTS (
       SELECT 1
         FROM pg_auth_members a
         JOIN pg_roles g ON g.oid = a.roleid
         JOIN pg_roles m ON m.oid = a.member
        WHERE g.rolname = r.rolname
          AND m.rolname = current_user
          AND a.set_option
     );

  IF faltando IS NOT NULL THEN
    RAISE EXCEPTION
      'A concessão de SET não pegou para: %. Sem ela, scripts/verificar-rls.mjs não consegue provar o isolamento.',
      faltando;
  END IF;
END $$;
