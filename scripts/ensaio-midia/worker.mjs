// Transporte HTTP permitido só neste harness loopback; produção exige HTTPS.
import { mkdir } from "node:fs/promises"
import { criarConsumidor } from "../../worker-transcode/consumer.mjs"
import { criarConversor } from "../../worker-transcode/converter.mjs"
import { limparTemporariosAbandonados } from "../../worker-transcode/temporarios.mjs"
const apiUrl = process.env.ENSAIO_API_URL, storageOrigin = process.env.ENSAIO_STORAGE_URL
for (const value of [apiUrl, storageOrigin]) if (new URL(value).hostname !== "127.0.0.1") throw new Error("somente_loopback")
const tempRoot = process.env.ENSAIO_TEMP_DIR
await mkdir(tempRoot, { recursive: true, mode: 0o700 })
console.log("TEMPORARIOS", JSON.stringify(await limparTemporariosAbandonados(tempRoot)))
const api = async body => {
  const r = await fetch(apiUrl, { method: "POST", redirect: "error", headers: { authorization: `Bearer ${process.env.MIDIA_WORKER_SECRET}`, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) })
  if (r.status === 409) return { ok: false }
  if (!r.ok) throw new Error("api_indisponivel")
  return r.json()
}
const run = criarConsumidor({ api, stateDir: process.env.ENSAIO_STATE_DIR, converter: criarConversor({ storageOrigin, permitirHttpLocal: true, tempRoot }), retryMs: 100 })
console.log("RESULTADO", await run())
