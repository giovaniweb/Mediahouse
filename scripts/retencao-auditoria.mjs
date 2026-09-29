// Expurgo técnico apenas de payload vencido. Envelope permanece íntegro.
// Sem .env. Simula por padrão; --aplicar exige confirmação explícita de operação.
import pg from "pg"
import { randomUUID, createHash } from "node:crypto"
const aplicar = process.argv.includes("--aplicar")
if (!process.env.ADMIN_DATABASE_URL || !process.env.ORGANIZACAO_AUDITORIA) throw new Error("Informe conexão administrativa e ORGANIZACAO_AUDITORIA explicitamente")
if (aplicar && process.env.CONFIRMAR_RETENCAO_AUDITORIA !== "sim") throw new Error("Aplicação exige CONFIRMAR_RETENCAO_AUDITORIA=sim")
const db = new pg.Client({ connectionString: process.env.ADMIN_DATABASE_URL })
try {
  await db.connect()
  await db.query(aplicar ? "BEGIN" : "BEGIN READ ONLY")
  const org = process.env.ORGANIZACAO_AUDITORIA
  const { rows: [r] } = await db.query(`SELECT count(*)::int AS vencidos FROM eventos_auditoria WHERE "organizacaoId"=$1 AND "payloadExpiraEm"<=CURRENT_TIMESTAMP AND (antes IS NOT NULL OR depois IS NOT NULL)`, [org])
  let removidos = 0
  if (aplicar) {
    const result = await db.query(`UPDATE eventos_auditoria SET antes=NULL,depois=NULL WHERE id IN (
      SELECT id FROM eventos_auditoria WHERE "organizacaoId"=$1 AND "payloadExpiraEm"<=CURRENT_TIMESTAMP AND (antes IS NOT NULL OR depois IS NOT NULL)
      ORDER BY "payloadExpiraEm",id LIMIT 1000 FOR UPDATE SKIP LOCKED)`, [org])
    removidos = result.rowCount
    if (removidos) {
      const correlationId = randomUUID()
      await db.query(`INSERT INTO eventos_auditoria (id,"organizacaoId","atorTipo","atorId",acao,recurso,"recursoId",resultado,"correlationId",chave,depois,"payloadExpiraEm")
        VALUES ($1::text,$2::text,'tecnico','auditoria.retencao','manutencao.retencao','organizacao',$2::text,'sucesso',$1::text,$3,$4,CURRENT_TIMESTAMP + INTERVAL '90 days')`,
        [correlationId,org,createHash("sha256").update(correlationId).digest("hex"),JSON.stringify({ alterados: removidos })])
    }
  }
  await db.query(aplicar ? "COMMIT" : "ROLLBACK")
  console.log(JSON.stringify({ modo: aplicar ? "aplicado" : "simulacao", vencidos: r.vencidos, payloadsRemovidos: removidos }))
} catch { console.error("Retenção não concluída; verifique conexão, migração e privilégios."); process.exitCode = 1 }
finally { await db.end() }
