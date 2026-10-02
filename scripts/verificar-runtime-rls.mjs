// Prova somente leitura com as conexões reais fornecidas pelo operador.
// Não lê .env, não exporta chaves, não troca role e não altera configuração.
import pg from "pg"
if (process.env.RLS_ATIVO !== "sim") throw new Error("A verificação exige RLS_ATIVO=sim")
let falhou = false
for (const [tipo, chave] of [["app", "DATABASE_URL"], ["auth", "AUTH_DATABASE_URL"]]) {
  if (!process.env[chave]) throw new Error(`${chave} precisa ser explícita`)
  const db = new pg.Client({ connectionString: process.env[chave], connectionTimeoutMillis: 10000 })
  try {
    await db.connect()
    await db.query("BEGIN READ ONLY")
    const { rows: [r] } = await db.query(`SELECT current_user = session_user AS login_direto,
      EXISTS(SELECT 1 FROM pg_roles WHERE (rolsuper OR rolbypassrls OR rolcreaterole) AND pg_has_role(current_user,oid,'MEMBER')) AS privilegio_elevado,
      EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','p') AND pg_has_role(current_user,relowner,'MEMBER')) AS dono,
      has_table_privilege(current_user,'public.usuarios','SELECT') AS le_identidade,
      has_any_column_privilege(current_user,'public.usuarios','UPDATE') AS edita_usuarios,
      has_function_privilege(current_user,'public.redefinir_senha_por_token(text,text)','EXECUTE') AS troca_por_token,
      has_table_privilege(current_user,'public.demandas','SELECT') AS le_demandas,
      has_table_privilege(current_user,'public.eventos_auditoria','SELECT') AS le_auditoria,
      has_table_privilege(current_user,'public.eventos_auditoria','INSERT') AS insere_auditoria,
      has_table_privilege(current_user,'public.eventos_auditoria','UPDATE,DELETE') AS altera_auditoria,
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.eventos_auditoria'::regclass) AS rls_auditoria,
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.demandas'::regclass) AS rls_demandas,
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.oauth_drive_estados'::regclass) AS rls_oauth`)
    const ok = r.login_direto && !r.privilegio_elevado && !r.dono &&
      (tipo === "app" ? r.le_demandas && r.rls_demandas && r.rls_oauth && r.rls_auditoria && r.le_auditoria && r.insere_auditoria && !r.altera_auditoria : r.le_identidade && !r.le_demandas && !r.edita_usuarios && r.troca_por_token && !r.le_auditoria && !r.insere_auditoria && !r.altera_auditoria)
    console.log(JSON.stringify({ tipo, aprovado: !!ok, ...r }))
    if (!ok) falhou = true
    await db.query("ROLLBACK")
  } catch {
    console.error(`Verificação de ${tipo} não concluída. Confira a conexão e os grants; credenciais omitidas.`)
    falhou = true
  } finally { await db.end() }
}
if (falhou) process.exitCode = 1
