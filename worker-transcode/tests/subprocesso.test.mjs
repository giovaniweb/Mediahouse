import { test } from "node:test"
import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { createServer } from "node:http"
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as esperar } from "node:timers/promises"
import { chavePreview } from "../converter.mjs"
import { limparTemporariosAbandonados } from "../temporarios.mjs"
const motor = new URL("../converter.mjs", import.meta.url).href
function processos() {
  const r = spawnSync("ps", ["-axo", "pid=,ppid=,rss=,comm="], { encoding: "utf8", timeout: 2000 })
  assert.equal(r.status, 0)
  return r.stdout.trim().split("\n").map(l => {
    const [, pid, pai, rss, nome] = l.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/) ?? []
    return { pid: Number(pid), pai: Number(pai), rss: Number(rss), nome }
  })
}
function arvore(todos, pid) {
  const ids = new Set([pid]); let mudou = true
  while (mudou) { mudou = false; for (const p of todos) if (ids.has(p.pai) && !ids.has(p.pid)) { ids.add(p.pid); mudou = true } }
  return todos.filter(p => ids.has(p.pid))
}
test("morte do worker durante ffmpeg encerra filho e permite limpeza; mede RSS sintético", { timeout: 60000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "nuflow-supervisor-"))
  let worker, encerrado, uploads = 0
  const server = createServer(async (req, res) => {
    if (req.method === "GET") { res.end(await readFile(join(root, "fonte.mov"))); return }
    for await (const _ of req) { /* consumir upload sintético */ }
    uploads++; res.end("{}")
  })
  try {
    const r = spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30", "-t", "8", "-c:v", "libx264", "-threads", "2", "-preset", "ultrafast", join(root, "fonte.mov")], { timeout: 30000, encoding: "utf8" })
    assert.equal(r.status, 0, r.stderr)
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
    const origin = `http://127.0.0.1:${server.address().port}`
    const j = { jobId: "job", leaseToken: "lease", organizacaoId: "org", demandaId: "demanda", arquivoId: "arquivo", fonteVersao: 1, perfil: "h264-720p-v1", bucket: "midia", objectKey: "org/org/videos/demanda/original.mov" }
    j.sourceUrl = `${origin}/storage/v1/object/sign/midia/${j.objectKey}?token=teste`
    j.uploadUrl = `${origin}/storage/v1/object/upload/sign/midia/${chavePreview(j)}?token=teste`
    const iniciar = () => {
      worker = spawn(process.execPath, ["--input-type=module", "-e", `import { criarConversor } from ${JSON.stringify(motor)}; await criarConversor(JSON.parse(process.env.CONFIG))(JSON.parse(process.env.JOB));`], { env: { PATH: process.env.PATH, CONFIG: JSON.stringify({ storageOrigin: origin, permitirHttpLocal: true, tempRoot: root }), JOB: JSON.stringify(j) }, stdio: "ignore" })
      encerrado = new Promise((resolve, reject) => { worker.once("error", reject); worker.once("close", (code, signal) => resolve({ code, signal })) })
    }
    iniciar()
    let ffmpeg, supervisor, pasta
    const limite = Date.now() + 15000
    while (Date.now() < limite) {
      const tree = arvore(processos(), worker.pid)
      ffmpeg = tree.find(p => p.nome?.endsWith("ffmpeg"))
      if (ffmpeg) { supervisor = tree.find(p => p.pid === ffmpeg.pai); break }
      await esperar(10)
    }
    assert.ok(ffmpeg, "FFmpeg real deve estar executando antes do SIGKILL")
    assert.notEqual(supervisor.pid, worker.pid, "supervisor separado do worker")
    pasta = (await readdir(root)).find(n => n.startsWith("nuflow-preview-"))
    assert.ok(pasta)
    worker.kill("SIGKILL"); assert.equal((await encerrado).signal, "SIGKILL")
    let seguro = false
    for (let i = 0; i < 200; i++) {
      const marker = JSON.parse(await readFile(join(root, pasta, ".nuflow-owner.json"), "utf8").catch(() => "{}"))
      if (marker.fase === "seguro" && !processos().some(p => p.pid === ffmpeg.pid)) { seguro = true; break }
      await esperar(10)
    }
    assert.ok(seguro, "supervisor aguarda término do filho antes de liberar temporário")
    assert.equal(uploads, 0)
    assert.equal((await limparTemporariosAbandonados(root)).removidos, 1)
    // Nova conversão completa; RSS inclui worker, supervisor e ffmpeg/ffprobe.
    iniciar(); let terminou = false, picoKiB = 0, amostras = 0
    encerrado.then(() => { terminou = true })
    while (!terminou) {
      const soma = arvore(processos(), worker.pid).reduce((n, p) => n + p.rss, 0)
      picoKiB = Math.max(picoKiB, soma); amostras++; await esperar(25)
    }
    assert.equal((await encerrado).code, 0); assert.equal(uploads, 1)
    assert.deepEqual((await readdir(root)).filter(n => n.startsWith("nuflow-preview-")), [])
    console.log("RSS_SINTETICO", JSON.stringify({ entrada: "1080p30, 8s, H264, sem áudio", picoAmostradoMiB: Math.round(picoKiB / 1024), amostras, intervaloMinimoMs: 25, amostragemNaoMedeCgroup: true }))
  } finally {
    if (worker?.exitCode === null && worker?.signalCode === null) { worker.kill("SIGKILL"); await encerrado }
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
    await rm(root, { recursive: true, force: true })
  }
})
