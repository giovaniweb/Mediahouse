import { before, after, test } from "node:test"
import assert from "node:assert/strict"
import http from "node:http"
import { Readable, pipeline } from "node:stream"
import { spawnSync } from "node:child_process"
import { mkdtemp, rm, readFile, writeFile, readdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createHash } from "node:crypto"
import { criarConversor, chavePreview, validarContrato, PERFIL, LIMITES } from "../converter.mjs"
let root, server, origin, converter, fonte, fonteHeaders, statusGet, statusPut, uploads, suspender, tamanhoSemHeader
const medidas = []
function gerar(nome, codec, { vertical = false, audio = false, duracao = 1 } = {}) {
  const args = ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `testsrc2=size=${vertical ? "720x1440" : "160x90"}:rate=${duracao > 600 ? 1 : 10}`]
  if (audio) args.push("-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100")
  args.push("-t", String(duracao), "-c:v", codec, "-threads", "1", "-pix_fmt", "yuv420p")
  if (codec === "libx265") args.push("-x265-params", "pools=1:frame-threads=1:log-level=error")
  if (audio) args.push("-c:a", "aac")
  args.push(join(root, nome))
  const r = spawnSync("ffmpeg", args, { timeout: 60000, encoding: "utf8" })
  assert.equal(r.status, 0, r.stderr?.slice(-500))
}
function job() {
  const j = { jobId: "job-1", leaseToken: "lease-1", organizacaoId: "org-a", demandaId: "demanda-a", arquivoId: "arquivo-a", fonteVersao: 1, perfil: PERFIL,
    bucket: "midia", objectKey: "org/org-a/videos/demanda-a/original.mov" }
  return { ...j, sourceUrl: `${origin}/storage/v1/object/sign/midia/${j.objectKey}?token=teste`, uploadUrl: `${origin}/storage/v1/object/upload/sign/midia/${chavePreview(j)}?token=teste` }
}
function reset() { fonteHeaders = {}; statusGet = 200; statusPut = 200; uploads = []; suspender = false; tamanhoSemHeader = false }
before(async () => {
  root = await mkdtemp(join(tmpdir(), "nuflow-worker-test-"))
  gerar("h264.mov", "libx264", { audio: true })
  gerar("hevc.mov", "libx265")
  gerar("hevc.mp4", "libx265")
  gerar("vertical.mp4", "libx264", { vertical: true })
  gerar("longo.mp4", "libx264", { duracao: 601 })
  server = http.createServer(async (req, res) => {
    if (req.method === "GET") {
      if (suspender) return // cliente aborta; nenhum timer/arquivo externo
      if (tamanhoSemHeader) {
        res.writeHead(200, { "Content-Type": "video/mp4" })
        const chunk = Buffer.alloc(1024 * 1024)
        pipeline(Readable.from((function* () { for (let i = 0; i < 101; i++) yield chunk })()), res, () => {})
        return
      }
      res.writeHead(statusGet, { "Content-Type": "video/quicktime", ...fonteHeaders }); res.end(fonte); return
    }
    const chunks = []; for await (const c of req) chunks.push(c)
    uploads.push({ path: req.url, bytes: Buffer.concat(chunks), headers: req.headers })
    res.writeHead(statusPut); res.end("{}")
  })
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  origin = `http://127.0.0.1:${server.address().port}`
  converter = criarConversor({ storageOrigin: origin, permitirHttpLocal: true, tempRoot: root })
})
after(async () => {
  server?.closeAllConnections()
  if (server) await new Promise(resolve => server.close(resolve))
  if (root) await rm(root, { recursive: true, force: true })
  console.log("MEDIDAS_SINTETICAS", JSON.stringify(medidas))
})
async function limpo() { assert.deepEqual((await readdir(root)).filter(n => n.startsWith("nuflow-preview-")), []) }
for (const nome of ["h264.mov", "hevc.mov", "hevc.mp4", "vertical.mp4"]) {
  test(`converte ${nome}, preserva original e envia MP4 privado`, async () => {
    reset(); fonte = await readFile(join(root, nome)); const originalHash = createHash("sha256").update(fonte).digest("hex")
    const r = await converter({ ...job(), sha256: originalHash })
    assert.equal(r.codec, "h264"); assert.equal(r.codecAudio, nome === "h264.mov" ? "aac" : null)
    assert.equal(r.bucket, "midia"); assert.equal(uploads.length, 1)
    assert.equal(uploads[0].bytes.length, r.tamanho)
    assert.equal(createHash("sha256").update(uploads[0].bytes).digest("hex"), r.sha256)
    assert.ok(uploads[0].path.startsWith("/storage/v1/object/upload/sign/midia/org/org-a/videos/demanda-a/previews/"))
    assert.ok(!uploads[0].headers.authorization) // nenhuma service role no motor
    assert.ok(r.largura <= 1280 && r.altura <= 1280)
    assert.equal(r.largura / r.altura, nome === "vertical.mp4" ? 0.5 : 160 / 90)
    assert.ok(Math.abs(r.duracao - 1) < 0.25)
    assert.equal(createHash("sha256").update(await readFile(join(root, nome))).digest("hex"), originalHash)
    const b = uploads[0].bytes
    assert.ok(b.indexOf(Buffer.from("moov")) < b.indexOf(Buffer.from("mdat")), "faststart")
    // Inspeção independente do resultado enviado ao storage simulado.
    const saida = join(root, "verificar.mp4"); await writeFile(saida, b)
    const probe = spawnSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", saida], { encoding: "utf8" })
    assert.equal(probe.status, 0); assert.equal(JSON.parse(probe.stdout).streams[0].codec_name, "h264")
    medidas.push({ arquivo: nome, entradaBytes: fonte.length, saidaBytes: r.tamanho, tempoMs: r.tempoMs, largura: r.largura, altura: r.altura })
    await limpo()
  })
}
test("recusa arquivo inválido e playlist sem fazer upload", async () => {
  for (const corpo of ["arquivo inválido", "#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\nhttps://example.invalid/segment.ts\n"]) {
    reset(); fonte = Buffer.from(corpo)
    await assert.rejects(converter(job()), { codigo: "midia_invalida" }); assert.equal(uploads.length, 0); await limpo()
  }
})
test("recusa duração acima de 10 minutos", async () => {
  reset(); fonte = await readFile(join(root, "longo.mp4"))
  await assert.rejects(converter(job()), { codigo: "duracao_excedida" }); assert.equal(uploads.length, 0); await limpo()
})
test("recusa tamanho declarado acima de 100 MB antes de converter", async () => {
  reset(); fonte = Buffer.from("x"); fonteHeaders = { "Content-Length": String(LIMITES.bytes + 1) }
  await assert.rejects(converter(job()), { codigo: "tamanho_excedido" }); assert.equal(uploads.length, 0); await limpo()
})
test("limite de bytes também vale sem Content-Length", async () => {
  reset(); tamanhoSemHeader = true
  await assert.rejects(converter(job()), { codigo: "tamanho_excedido" }); assert.equal(uploads.length, 0); await limpo()
})
test("redirect de download não é seguido", async () => {
  reset(); fonte = Buffer.from("redirect"); statusGet = 302; fonteHeaders = { Location: "https://example.invalid/segredo" }
  await assert.rejects(converter(job()), { codigo: "falha_processamento" }); assert.equal(uploads.length, 0); await limpo()
})
test("checksum divergente não gera prévia", async () => {
  reset(); fonte = await readFile(join(root, "h264.mov"))
  await assert.rejects(converter({ ...job(), sha256: "0".repeat(64) }), { codigo: "checksum_divergente" }); assert.equal(uploads.length, 0); await limpo()
})
test("falha do storage não vira sucesso; nova tentativa pode converter", async () => {
  reset(); fonte = await readFile(join(root, "h264.mov")); statusGet = 503
  await assert.rejects(converter(job()), { codigo: "storage_indisponivel" }); await limpo()
  statusGet = 200; statusPut = 503
  await assert.rejects(converter(job()), { codigo: "storage_indisponivel" }); await limpo()
  statusPut = 200; assert.equal((await converter(job())).codec, "h264"); await limpo()
})
test("aborto libera concorrência e limpa os temporários", async () => {
  reset(); suspender = true
  const controller = new AbortController(), pendente = converter(job(), { signal: controller.signal })
  await assert.rejects(converter(job()), { codigo: "worker_ocupado" })
  controller.abort()
  await assert.rejects(pendente, { codigo: "cancelado" }); await limpo()
  suspender = false; fonte = await readFile(join(root, "h264.mov"))
  assert.equal((await converter(job())).codec, "h264"); await limpo()
})
test("contrato recusa URL externa, caminho de outra empresa e saída sobre o original", () => {
  const cfg = { storageOrigin: origin, permitirHttpLocal: true }, j = job()
  for (const alteracao of [{ sourceUrl: "https://example.invalid/v.mov" }, { objectKey: "org/outra/videos/demanda-a/v.mov" }, { uploadUrl: j.sourceUrl }, { fonteVersao: 0 }, { leaseToken: "../fora" }]) {
    assert.throws(() => validarContrato({ ...j, ...alteracao }, cfg))
  }
  assert.throws(() => validarContrato(j, { storageOrigin: origin }), { codigo: "storage_invalido" })
  assert.notEqual(chavePreview(j), chavePreview({ ...j, leaseToken: "lease-2" }))
  assert.notEqual(chavePreview(j), chavePreview({ ...j, fonteVersao: 2 }))
})
