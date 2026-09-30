import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, rm, readdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { criarConsumidor, criarApi } from "../consumer.mjs"
const resultado = { jobId: "job-a", leaseToken: "lease-a", fonteVersao: 1, perfil: "h264-720p-v1", objectKey: "preview", sha256: "a".repeat(64), tamanho: 123, mime: "video/mp4", codec: "h264", codecAudio: null, largura: 160, altura: 90, duracao: 1 }
async function comPasta(fn) { const p = await mkdtemp(join(tmpdir(), "nuflow-receipts-")); try { await fn(p) } finally { await rm(p, { recursive: true, force: true }) } }
test("recibo sobrevive a reinício e não repete conversão após callback incerto", () => comPasta(async stateDir => {
  let conversoes = 0, claims = 0, confirma = false, callbacks = 0
  const api = async p => {
    if (p.acao === "reivindicar") return { job: claims++ ? null : resultado }
    if (p.acao === "concluir") { callbacks++; if (!confirma) throw new Error("resposta perdida"); return { ok: true } }
    return { ok: true }
  }
  const converter = async () => { conversoes++; return resultado }
  const um = criarConsumidor({ api, converter, stateDir, retryMs: 1 })
  assert.equal(await um(), "confirmacao_pendente"); assert.equal(conversoes, 1)
  assert.equal((await readdir(stateDir)).filter(n => n.endsWith(".json")).length, 1)
  confirma = true
  const reiniciado = criarConsumidor({ api, converter, stateDir, retryMs: 1 })
  assert.equal(await reiniciado(), "vazio"); assert.equal(conversoes, 1); assert.equal(callbacks, 4)
  assert.deepEqual(await readdir(stateDir), [])
}))
test("lease perdido aborta conversão em curso", () => comPasta(async stateDir => {
  let abortado = false
  const api = async p => p.acao === "reivindicar" ? { job: resultado } : { ok: false }
  const converter = (_j, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => { abortado = true; reject(new Error("aborto")) }, { once: true }))
  const executar = criarConsumidor({ api, converter, stateDir, renewMs: 5, retryMs: 1 })
  assert.equal(await executar(), "cancelado"); assert.equal(abortado, true); assert.deepEqual(await readdir(stateDir), [])
}))
test("falha permanente não pede retry remoto e não deixa recibo", () => comPasta(async stateDir => {
  let falha
  const api = async p => { if (p.acao === "reivindicar") return { job: resultado }; if (p.acao === "falhar") falha = p; return { ok: true } }
  const executar = criarConsumidor({ api, converter: async () => { throw Object.assign(new Error("duração"), { codigo: "duracao_excedida" }) }, stateDir })
  assert.equal(await executar(), "falhou"); assert.equal(falha.recuperavel, false)
  assert.deepEqual(await readdir(stateDir), [])
}))
test("callback obsoleto não promove saída nem fica repetindo confirmação", () => comPasta(async stateDir => {
  let calls = 0
  const api = async p => p.acao === "reivindicar" ? { job: resultado } : (calls++, { ok: false })
  assert.equal(await criarConsumidor({ api, converter: async () => resultado, stateDir })(), "obsoleto")
  assert.equal(calls, 1); assert.deepEqual(await readdir(stateDir), [])
}))
test("API de controle recusa HTTP, query e credencial no endereço", () => {
  for (const apiUrl of ["http://example.com/api/transcode/worker", "https://user:pass@example.com/api/transcode/worker", "https://example.com/api/transcode/worker?token=senha", "https://example.com/outro"]) {
    assert.throws(() => criarApi({ apiUrl, secret: "teste" }))
  }
})
