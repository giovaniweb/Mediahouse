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
      has_table_privilege(current_user,'public.consumos_ia','SELECT,INSERT,UPDATE') AS usa_consumo_ia,
      has_table_privilege(current_user,'public.politicas_ia','SELECT,INSERT,UPDATE') AS usa_politica_ia,
      has_table_privilege(current_user,'public.consumos_ia','DELETE') AS apaga_consumo_ia,
      has_table_privilege(current_user,'public.politicas_ia','DELETE') AS apaga_politica_ia,
      (SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('public.consumos_ia'::regclass,'public.politicas_ia'::regclass)) AS rls_ia,
      has_table_privilege(current_user,'public.saidas_whatsapp','SELECT') AS le_saidas,
      has_table_privilege(current_user,'public.tentativas_whatsapp','SELECT') AS le_tentativas,
      has_table_privilege(current_user,'public.recibos_whatsapp','SELECT') AS le_recibos,
      has_table_privilege(current_user,'public.saidas_whatsapp','DELETE') AS apaga_saidas,
      has_table_privilege(current_user,'public.tentativas_whatsapp','DELETE') AS apaga_tentativas,
      has_table_privilege(current_user,'public.recibos_whatsapp','UPDATE,DELETE') AS altera_recibos,
      (SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('public.saidas_whatsapp'::regclass,'public.tentativas_whatsapp'::regclass,'public.recibos_whatsapp'::regclass)) AS rls_saidas,
      has_table_privilege(current_user,'public.inbox_whatsapp','SELECT') AS le_inbox,
      has_table_privilege(current_user,'public.inbox_whatsapp','INSERT') AS insere_inbox,
      has_table_privilege(current_user,'public.inbox_whatsapp','DELETE') AS apaga_inbox,
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.inbox_whatsapp'::regclass) AS rls_inbox,
      has_function_privilege(current_user,'public.whatsapp_instancia_org(text)','EXECUTE') AS resolve_instancia,
      has_table_privilege(current_user,'public.lancamentos_setor','SELECT,INSERT,UPDATE') AS usa_custos_setor,
      has_table_privilege(current_user,'public.lancamentos_setor','DELETE') AS apaga_custos_setor,
      (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.lancamentos_setor'::regclass) AS rls_custos_setor,
      has_table_privilege(current_user,'public.lotes_acervo','SELECT,INSERT,UPDATE') AS usa_lotes_acervo,
      has_table_privilege(current_user,'public.lotes_acervo','DELETE') AS apaga_lotes_acervo,
      (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.lotes_acervo'::regclass) AS rls_lotes_acervo,
      has_table_privilege(current_user,'public.copias_drive','SELECT,INSERT,UPDATE') AS usa_copias_drive,
      has_table_privilege(current_user,'public.copias_drive','DELETE') AS apaga_copias_drive,
      (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.copias_drive'::regclass) AS rls_copias_drive,
      has_table_privilege(current_user,'public.jobs_automacao','SELECT') AS le_fila,
      has_table_privilege(current_user,'public.jobs_automacao','INSERT') AS insere_fila,
      has_table_privilege(current_user,'public.jobs_automacao','UPDATE') AS atualiza_fila,
      has_table_privilege(current_user,'public.jobs_automacao','DELETE') AS apaga_fila,
      has_table_privilege(current_user,'public.eventos_job','SELECT') AS le_eventos_job,
      has_table_privilege(current_user,'public.eventos_job','INSERT') AS insere_eventos_job,
      has_table_privilege(current_user,'public.eventos_job','UPDATE,DELETE') AS altera_eventos_job,
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.jobs_automacao'::regclass) AS rls_fila,
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.eventos_job'::regclass) AS rls_eventos_job,
      has_table_privilege(current_user,'public.eventos_auditoria','SELECT') AS le_auditoria,
      has_table_privilege(current_user,'public.eventos_auditoria','INSERT') AS insere_auditoria,
      has_table_privilege(current_user,'public.eventos_auditoria','UPDATE,DELETE') AS altera_auditoria,
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.eventos_auditoria'::regclass) AS rls_auditoria,
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.demandas'::regclass) AS rls_demandas,
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.oauth_drive_estados'::regclass) AS rls_oauth`)
    const filaOk = tipo === "app"
      ? r.le_fila && r.insere_fila && r.atualiza_fila && !r.apaga_fila && r.le_eventos_job && r.insere_eventos_job && !r.altera_eventos_job && r.rls_fila && r.rls_eventos_job
      : !r.le_fila && !r.insere_fila && !r.atualiza_fila && !r.apaga_fila && !r.le_eventos_job && !r.insere_eventos_job && !r.altera_eventos_job
    const inboxOk = tipo === "app" ? r.le_inbox && r.insere_inbox && !r.apaga_inbox && r.rls_inbox && r.resolve_instancia
      : !r.le_inbox && !r.insere_inbox && !r.apaga_inbox && !r.resolve_instancia
    const saidasOk = tipo === "app" ? r.le_saidas && r.le_tentativas && r.le_recibos && !r.apaga_saidas && !r.apaga_tentativas && !r.altera_recibos && r.rls_saidas
      : !r.le_saidas && !r.le_tentativas && !r.le_recibos && !r.apaga_saidas && !r.apaga_tentativas && !r.altera_recibos
    const iaOk = r.rls_ia && !r.apaga_consumo_ia && !r.apaga_politica_ia && (tipo === "app" ? r.usa_consumo_ia && r.usa_politica_ia : !r.usa_consumo_ia && !r.usa_politica_ia)
    const driveOk = r.rls_copias_drive && !r.apaga_copias_drive && (tipo === "app" ? r.usa_copias_drive : !r.usa_copias_drive)
    const acervoOk = r.rls_lotes_acervo && !r.apaga_lotes_acervo && (tipo === "app" ? r.usa_lotes_acervo : !r.usa_lotes_acervo)
    const custosOk = r.rls_custos_setor && !r.apaga_custos_setor && (tipo === "app" ? r.usa_custos_setor : !r.usa_custos_setor)
    const ok = custosOk && acervoOk && driveOk && iaOk && saidasOk && inboxOk && filaOk && r.login_direto && !r.privilegio_elevado && !r.dono &&
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
