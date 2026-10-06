-- O schema public sai do alcance da API do Supabase (anon, authenticated,
-- service_role).
--
-- Leitura de produção de 05/10/2026 (só catálogo, transação READ ONLY): as 12
-- funções de public, 8 delas SECURITY DEFINER, e as 89 tabelas davam privilégio
-- TOTAL a anon, authenticated e service_role. Nenhuma migration concedeu isso.
-- Vem dos privilégios padrão que o Supabase grava em todo projeto, para o dono
-- `postgres` no schema public:
--
--     ALTER DEFAULT PRIVILEGES IN SCHEMA public
--       GRANT ALL ON TABLES | FUNCTIONS | SEQUENCES TO anon, authenticated, service_role;
--
-- O `REVOKE ALL ... FROM PUBLIC` das nossas migrations não alcança isso: são
-- GRANTs nominais, não via PUBLIC. E o PostgREST do Supabase atende como anon
-- qualquer um que tenha a anon key, que a própria Supabase trata como pública.
-- Reproduzido num Postgres descartável com os mesmos privilégios padrão, como
-- anon:
--   - `org_por_credencial('arquivo_por_url', '')` devolve o id de uma empresa
--     (LIKE '%%' casa qualquer url);
--   - `consumir_limite_publico` gasta o limite do formulário de outra pessoa, e
--     `whatsapp_instancia_org` liga instância a empresa;
--   - `_prisma_migrations`, a única tabela sem RLS, aceita SELECT, INSERT e
--     DELETE: dá para apagar o histórico e fazer o próximo deploy reaplicar
--     migration, ou forjar uma linha e fazê-lo pular uma;
--   - `leads_comerciais` aceita INSERT direto (a política `lead_insert` vale
--     para PUBLIC), sem o limite da rota /comecar.
-- As outras tabelas o RLS segura (política só para app_user), e service_role
-- tem BYPASSRLS: a chave dele, se vazar, leria tudo pela API.
--
-- Ninguém usa essa porta. O supabase-js da aplicação e o worker de mídia só
-- falam com o Storage (schema storage, que esta migration não toca). A
-- aplicação conecta pelo Postgres: hoje como postgres, depois da virada como
-- app_user/app_auth. Esses três papéis ficam intactos.
--
-- O que muda:
--   1) anon, authenticated e service_role perdem tudo em tabelas, sequências e
--      funções de public, e o privilégio padrão do dono deixa de dar algo a eles:
--      objeto novo já nasce fechado;
--   2) PUBLIC perde EXECUTE nas funções de public que ainda o tinham. Hoje são
--      só funções de gatilho, e gatilho não confere EXECUTE ao disparar; é o
--      que proteger_lancamento_setor (20261001010000) já faz;
--   3) trava: nenhum privilégio de app_user, app_auth ou do dono some, as seis
--      concessões de função que a aplicação usa continuam de pé e não sobra
--      acesso para os três papéis. Se qualquer uma falhar, nada é aplicado.
--
-- Fica de fora, de propósito:
--   - USAGE no schema public: sem objeto alcançável ele não dá nada, e o
--     scripts/virada/virada.mjs o reproduz num projeto novo;
--   - o privilégio padrão GLOBAL de EXECUTE para PUBLIC. Ele vale para qualquer
--     schema, inclusive para função de extensão que o app_user chama. Função
--     SECURITY DEFINER nova continua precisando do próprio REVOKE ... FROM
--     PUBLIC, e o scripts/verificar-rls.mjs passa a reprovar quem esquecer.
--
-- Só tira acesso de quem a aplicação não usa: ordem indiferente ao deploy. Fora
-- do Supabase (CI, Postgres local), os três papéis não existem e só o passo 2
-- e a trava fazem efeito.

-- ── 0) Retrato do que tem que sobreviver ────────────────────────────────────
--
-- Todo privilégio em public que NÃO é dos três papéis nem de PUBLIC: app_user,
-- app_auth, o dono. A view é a mesma consulta antes e depois, para a trava
-- comparar igual com igual.
CREATE TEMP VIEW "_privilegios_em_public" AS
  SELECT 'tabela' AS tipo, c.oid::regclass::text AS objeto, a.grantee, a.privilege_type
    FROM pg_class c
   CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,
           acldefault(CASE WHEN c.relkind = 'S' THEN 's' ELSE 'r' END::"char", c.relowner))) a
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
  UNION ALL
  SELECT 'funcao', p.oid::regprocedure::text, a.grantee, a.privilege_type
    FROM pg_proc p
   CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   WHERE p.pronamespace = 'public'::regnamespace;

CREATE TEMP TABLE "_privilegios_mantidos" AS
  SELECT DISTINCT tipo, objeto, grantee, privilege_type
    FROM "_privilegios_em_public"
   WHERE grantee <> 0
     AND grantee NOT IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role'));

-- ── 1) Os papéis da API do Supabase ─────────────────────────────────────────
--
-- `ALTER DEFAULT PRIVILEGES` sem FOR ROLE vale para quem roda a migration, que
-- é o dono de tudo em public (postgres, em produção). É a entrada que o
-- Supabase gravou.
DO $$
DECLARE
  papel TEXT;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', papel);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', papel);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', papel);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', papel);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', papel);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', papel);
    END IF;
  END LOOP;
END $$;

-- ── 2) PUBLIC nas funções ───────────────────────────────────────────────────
--
-- Função de extensão instalada em public fica de fora: o EXECUTE dela para
-- PUBLIC é o que deixa o app_user chamá-la.
DO $$
DECLARE
  f REGPROCEDURE;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND NOT EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
  END LOOP;
END $$;

-- ── 3) Trava ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  faltando TEXT;
  aberto TEXT;
  outros TEXT;
BEGIN
  -- a) Nada do que app_user, app_auth e o dono tinham em public sumiu.
  SELECT string_agg(format('%s %s: %s de %s', m.tipo, m.objeto, m.privilege_type,
                           pg_get_userbyid(m.grantee)), '; ' ORDER BY m.objeto)
    INTO faltando
    FROM (SELECT tipo, objeto, grantee, privilege_type FROM "_privilegios_mantidos"
          EXCEPT
          SELECT tipo, objeto, grantee, privilege_type FROM "_privilegios_em_public") m;
  IF faltando IS NOT NULL THEN
    RAISE EXCEPTION 'Abortado: a migration tirou privilégio que não devia: %', faltando;
  END IF;

  -- b) As concessões de função que a aplicação usa. Se alguma já tinha sumido
  -- antes desta migration, o lugar de descobrir é aqui, e não numa rota pública
  -- dando 500 depois da virada do RLS.
  SELECT string_agg(e.funcao || ' para ' || e.papel, '; ')
    INTO faltando
    FROM (VALUES
      ('public.org_por_credencial(text,text)',                  'app_user'),
      ('public.consumir_limite_publico(text,integer,integer)',  'app_user'),
      ('public.whatsapp_instancia_org(text)',                   'app_user'),
      ('public.recalcular_media_videomaker(text)',              'app_user'),
      ('public.recalcular_media_editor(text)',                  'app_user'),
      ('public.redefinir_senha_por_token(text,text)',           'app_auth')
    ) AS e(funcao, papel)
   WHERE to_regprocedure(e.funcao) IS NULL
      OR NOT has_function_privilege(e.papel, to_regprocedure(e.funcao), 'EXECUTE');
  IF faltando IS NOT NULL THEN
    RAISE EXCEPTION 'Abortado: concessão esperada ausente: %', faltando;
  END IF;

  -- c) Nada em public continua alcançável pelos três papéis. Para função, conta
  -- também o que viria por PUBLIC.
  SELECT string_agg(item, '; ' ORDER BY item)
    INTO aberto
    FROM (
      SELECT r.rolname || ' em ' || c.oid::regclass::text AS item
        FROM pg_class c
        JOIN pg_roles r ON r.rolname IN ('anon', 'authenticated', 'service_role')
       WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
         AND EXISTS (SELECT 1 FROM aclexplode(c.relacl) a WHERE a.grantee = r.oid)
      UNION ALL
      SELECT r.rolname || ' executa ' || p.oid::regprocedure::text
        FROM pg_proc p
        JOIN pg_roles r ON r.rolname IN ('anon', 'authenticated', 'service_role')
       WHERE p.pronamespace = 'public'::regnamespace
         AND NOT EXISTS (SELECT 1 FROM pg_depend d
                          WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
         AND has_function_privilege(r.oid, p.oid, 'EXECUTE')
      UNION ALL
      SELECT r.rolname || ' no privilégio padrão (' || d.defaclobjtype::text || ')'
        FROM pg_default_acl d
       CROSS JOIN LATERAL aclexplode(d.defaclacl) a
        JOIN pg_roles r ON r.oid = a.grantee
       WHERE d.defaclnamespace = 'public'::regnamespace
         AND d.defaclrole = current_user::regrole
         AND r.rolname IN ('anon', 'authenticated', 'service_role')
    ) x;
  IF aberto IS NOT NULL THEN
    RAISE EXCEPTION 'Abortado: public continua aberto para a API do Supabase: %', aberto;
  END IF;

  -- d) Privilégio padrão gravado por OUTRO criador não é desta migration
  -- desfazer (só o próprio papel altera o dele). Fica o aviso no log.
  SELECT string_agg(DISTINCT pg_get_userbyid(d.defaclrole) || '/' || d.defaclobjtype::text, ', ')
    INTO outros
    FROM pg_default_acl d
   CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    JOIN pg_roles r ON r.oid = a.grantee
   WHERE d.defaclnamespace = 'public'::regnamespace
     AND d.defaclrole <> current_user::regrole
     AND r.rolname IN ('anon', 'authenticated', 'service_role');
  IF outros IS NOT NULL THEN
    RAISE WARNING 'Objeto novo em public criado por % ainda nasce aberto para a API do Supabase.', outros;
  END IF;
END $$;

DROP TABLE "_privilegios_mantidos";
DROP VIEW "_privilegios_em_public";
