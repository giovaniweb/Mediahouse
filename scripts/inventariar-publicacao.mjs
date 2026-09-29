// Somente leitura. Não carrega .env nem imprime URLs, tokens ou credenciais.
// DATABASE_URL_AUDITORIA=<conexão autorizada> ORGANIZACAO_AUDITORIA=<id> node scripts/inventariar-publicacao.mjs
import pg from "pg"
const connectionString = process.env.DATABASE_URL_AUDITORIA
const org = process.env.ORGANIZACAO_AUDITORIA
if (!connectionString || !org) throw new Error("Informe DATABASE_URL_AUDITORIA e ORGANIZACAO_AUDITORIA explicitamente")
const db = new pg.Client({ connectionString })
try {
  await db.connect()
  await db.query("BEGIN READ ONLY")
  await db.query("SELECT set_config('app.org_id', $1, true)", [org])
  const arquivos = await db.query(`SELECT a."tipoArquivo", CASE
    WHEN a.url LIKE '/api/midia/%' THEN 'privado_app'
    WHEN a.url LIKE '%/storage/v1/object/public/%' THEN 'bucket_publico_legado'
    ELSE 'externo_ou_legado' END AS origem,
    count(*)::int AS quantidade,
    count(*) FILTER (WHERE a."publicadoEm" IS NOT NULL AND a."revogadoEm" IS NULL AND a."publicacaoUrl" IS NOT NULL)::int AS publicados
    FROM arquivos a JOIN demandas d ON d.id = a."demandaId"
    WHERE d."organizacaoId" = $1 GROUP BY 1,2 ORDER BY 1,2`, [org])
  const demandas = await db.query(`SELECT
    count(*) FILTER (WHERE "linkFinal" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM arquivos a WHERE a."demandaId" = demandas.id AND a."tipoArquivo" = 'final'))::int AS finais_sem_registro,
    count(*) FILTER (WHERE "publicTokenAtivo" AND ("publicTokenExpiraEm" IS NULL OR "publicTokenExpiraEm" > now()))::int AS acompanhamentos_ativos,
    count(*) FILTER (WHERE "notaFiscalUrl" LIKE '%/storage/v1/object/public/%')::int AS notas_fiscais_em_bucket_publico
    FROM demandas WHERE "organizacaoId" = $1`, [org])
  const financeiros = await db.query(`SELECT
    (SELECT count(*)::int FROM notas_fiscais n JOIN demandas d ON d.id = n."demandaId" WHERE d."organizacaoId" = $1 AND n.url LIKE '%/storage/v1/object/public/%') AS uploads_nf_publicos,
    (SELECT count(*)::int FROM custos_videomaker WHERE "organizacaoId" = $1 AND "notaFiscalUrl" LIKE '%/storage/v1/object/public/%') AS custos_vm_nf_publicos,
    (SELECT count(*)::int FROM custos_evento c JOIN eventos_gestao e ON e.id = c."eventoId" WHERE e."organizacaoId" = $1 AND c."notaFiscalUrl" LIKE '%/storage/v1/object/public/%') AS custos_evento_nf_publicos`, [org])
  await db.query("ROLLBACK")
  console.log(JSON.stringify({ organizacaoId: org, arquivos: arquivos.rows, demandas: demandas.rows[0], financeiros: financeiros.rows[0] }, null, 2))
} catch (e) {
  // Mensagens de drivers podem conter detalhes de conexão. Não imprimir a URL.
  console.error("Inventário não concluído.", e?.code ?? "Confira conexão, organização e migrações.")
  process.exitCode = 1
} finally { await db.end() }
