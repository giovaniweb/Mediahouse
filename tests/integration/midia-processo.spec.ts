import { beforeAll, afterAll, expect, it, vi } from "vitest"
import { createServer } from "node:http"
import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { randomUUID, createHash } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
const mocks = vi.hoisted(() => ({ leitura: vi.fn(), upload: vi.fn() }))
vi.mock("@/lib/midia", async original => ({ ...await original<object>(), urlAssinadaDeLeitura: mocks.leitura, urlDeUpload: mocks.upload }))
vi.mock("@/lib/acesso", () => ({ requireAcesso: async () => NextResponse.json({}, { status: 401 }) }))
import { prismaBase as db } from "@/lib/prisma"
import { registrarArquivoDemanda } from "@/lib/arquivo-registro"
import { POST } from "@/app/api/transcode/worker/route"
import { GET } from "@/app/api/midia/[...caminho]/route"
const id = `processo-${randomUUID()}`, org = `${id}-org`, demanda = `${id}-d`, token = randomUUID()
let root: string, origin: string, fonte: Buffer
let modo = "normal", uploads = 0, parada: (() => void) | undefined
const objetos = new Map<string, Buffer>(), tickets = new Map<string, string>(), children = new Set<ChildProcess>()
let ultimoJob: Record<string, string>, ultimoResultado: Record<string, unknown>
function assinar(key: string, upload = false) {
  const path = `/storage/v1/object/${upload ? "upload/" : ""}sign/midia/${key}`
  const ticket = randomUUID(); tickets.set(ticket, path)
  return `${origin}${path}?token=${ticket}`
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url!, origin)
    if (url.pathname === "/api/transcode/worker") {
      const chunks = []; for await (const chunk of req) chunks.push(chunk)
      const body = Buffer.concat(chunks).toString(), payload = JSON.parse(body)
      const response = await POST(new NextRequest(`${origin}${url.pathname}`, { method: "POST", headers: { authorization: req.headers.authorization ?? "" }, body }))
      const text = await response.text()
      if (payload.acao === "reivindicar") ultimoJob = JSON.parse(text).job ?? ultimoJob
      if (payload.acao === "concluir") ultimoResultado = payload.resultado
      if (modo === "apos-commit" && payload.acao === "concluir" && response.status === 200) { parada?.(); return }
      res.writeHead(response.status, { "content-type": "application/json" }); res.end(text); return
    }
    if (tickets.get(url.searchParams.get("token") ?? "") !== url.pathname) { res.writeHead(403); res.end(); return }
    const key = url.pathname.replace(/^\/storage\/v1\/object\/(upload\/)?sign\/midia\//, "")
    if (req.method === "PUT") {
      if (objetos.has(key)) { res.writeHead(409); res.end(); return }
      const chunks = []; for await (const chunk of req) chunks.push(chunk)
      objetos.set(key, Buffer.concat(chunks)); uploads++
      if (modo === "apos-upload") { parada?.(); return }
      res.end("{}"); return
    }
    const data = objetos.get(key)
    if (!data) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { "content-type": key.endsWith(".mov") ? "video/quicktime" : "video/mp4", "content-length": data.length })
    res.end(req.method === "HEAD" ? undefined : data)
  } catch { res.writeHead(500); res.end("erro no ensaio") }
})
function worker() {
  const child = spawn(process.execPath, ["--import", resolve("scripts/ensaio-midia/rede-local.mjs"), resolve("scripts/ensaio-midia/worker.mjs")], {
    env: { NODE_ENV: "test", PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: root, ENSAIO_API_URL: `${origin}/api/transcode/worker`, ENSAIO_STORAGE_URL: origin, ENSAIO_TEMP_DIR: join(root, "temporarios"), ENSAIO_STATE_DIR: join(root, "recibos"), MIDIA_WORKER_SECRET: "segredo-sintetico" }, stdio: ["ignore", "pipe", "pipe"],
  })
  children.add(child)
  let log = ""; child.stdout!.on("data", c => { log += c }); child.stderr!.on("data", c => { log += c })
  const terminou = new Promise<{ code: number | null, signal: string | null, log: string }>((resolve, reject) => {
    child.once("error", reject); child.once("close", (code, signal) => { children.delete(child); resolve({ code, signal, log }) })
  })
  return { child, terminou }
}
async function criar(nome: string) {
  const key = `org/${org}/videos/${demanda}/${nome}.mov`; objetos.set(key, fonte)
  return (await registrarArquivoDemanda({ organizacaoId: org, demandaId: demanda, tipo: "final", url: `/api/midia/${key}`, nomeArquivo: `${nome}.mov` })).arquivo
}
async function interromper(fase: string) {
  modo = fase
  let timer: ReturnType<typeof setTimeout>
  const chegou = new Promise<void>((resolve, reject) => { parada = resolve; timer = setTimeout(() => reject(new Error(`fase não alcançada: ${fase}`)), 20000) })
  const w = worker()
  try { await chegou; w.child.kill("SIGKILL"); expect((await w.terminou).signal).toBe("SIGKILL") }
  finally { clearTimeout(timer!); parada = undefined; modo = "normal" }
}
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "nuflow-processo-"))
  const r = spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=10", "-t", "1", "-c:v", "libx265", "-threads", "1", "-x265-params", "pools=1:frame-threads=1:log-level=error", join(root, "fonte.mov")], { encoding: "utf8", timeout: 30000 })
  expect(r.status, r.stderr).toBe(0); fonte = await readFile(join(root, "fonte.mov"))
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  vi.stubEnv("MIDIA_WORKER_V2_ATIVO", "sim"); vi.stubEnv("MIDIA_WORKER_SECRET", "segredo-sintetico"); vi.stubEnv("MIDIA_WORKER_ORGANIZACAO_ID", org)
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", origin)
  mocks.leitura.mockImplementation(async key => assinar(key))
  mocks.upload.mockImplementation(async key => ({ uploadUrl: assinar(key, true), url: `/api/midia/${key}` }))
  // O app só precisa do HEAD nesta suíte. Faz uma requisição HTTP real ao storage local.
  const { request } = await import("node:http")
  vi.stubGlobal("fetch", async (url: string, options: RequestInit = {}) => {
    if (new URL(url).origin !== origin) throw new Error("rede externa bloqueada")
    return new Promise((resolve, reject) => {
      const req = request(url, { method: options.method ?? "GET", signal: options.signal ?? undefined }, r => {
        const chunks: Buffer[] = []; r.on("data", c => chunks.push(c)); r.on("end", () => resolve(new Response(options.method === "HEAD" ? null : Buffer.concat(chunks), { status: r.statusCode, headers: r.headers as Record<string, string> })))
      }); req.on("error", reject); req.end()
    })
  })
  await db.organizacao.create({ data: { id: org, nome: org, slug: org } })
  await db.usuario.create({ data: { id, nome: id, tipo: "admin", senhaHash: "sem-login" } })
  await db.demanda.create({ data: { id: demanda, organizacaoId: org, solicitanteId: id, codigo: demanda, titulo: demanda, descricao: "sintético", cidade: "Teste", departamento: "growth", tipoVideo: "reels", publicToken: token, publicTokenAtivo: true } })
}, 40000)
afterAll(async () => {
  const encerramentos = [...children].map(c => new Promise<void>(resolve => { c.once("close", () => resolve()); c.kill("SIGKILL") }))
  await Promise.all(encerramentos)
  server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))
  await db.organizacao.deleteMany({ where: { id: org } }); await db.usuario.deleteMany({ where: { id } }); await db.$disconnect()
  vi.unstubAllEnvs(); vi.unstubAllGlobals()
  if (root) await rm(root, { recursive: true, force: true })
})
it("SIGKILL após upload: limpa temporário seguro, troca lease e rejeita tentativa antiga", async () => {
  const arquivo = await criar("queda-upload")
  await interromper("apos-upload")
  const antigo = { ...ultimoJob }, antigoKey = new URL(antigo.uploadUrl).pathname.replace("/storage/v1/object/upload/sign/midia/", "")
  expect((await readdir(join(root, "temporarios"))).length).toBe(1)
  expect((await db.arquivo.findUniqueOrThrow({ where: { id: arquivo.id } })).url).toBe(arquivo.url)
  // Acelera apenas o relógio do lease da fixture; não modifica configuração operacional.
  await db.jobAutomacao.update({ where: { id: antigo.jobId }, data: { leaseAte: new Date(0) } })
  const retomada = await worker().terminou
  expect(retomada.code, retomada.log).toBe(0); expect(retomada.log).toContain('"removidos":1'); expect(retomada.log).toContain("RESULTADO concluido")
  const salvo = await db.arquivo.findUniqueOrThrow({ where: { id: arquivo.id } })
  expect(salvo.originalUrl).toBe(arquivo.url); expect(salvo.previewObjectKey).not.toBe(antigoKey)
  expect(objetos.has(antigoKey)).toBe(true) // órfão remoto preservado: coleta exige política própria
  expect(ultimoJob.leaseToken).not.toBe(antigo.leaseToken)
  const obsoleto = await POST(new NextRequest(`${origin}/api/transcode/worker`, { method: "POST", headers: { authorization: "Bearer segredo-sintetico" }, body: JSON.stringify({ acao: "concluir", resultado: { ...ultimoResultado, leaseToken: antigo.leaseToken, objectKey: antigoKey } }) }))
  expect(obsoleto.status).toBe(409)
  expect(await readdir(join(root, "temporarios"))).toEqual([])
}, 30000)
it("SIGKILL após commit: reenvia recibo sem repetir upload e autoriza somente vínculo válido", async () => {
  const arquivo = await criar("queda-commit"), antes = uploads
  await interromper("apos-commit")
  const salvo = await db.arquivo.findUniqueOrThrow({ where: { id: arquivo.id } })
  expect(salvo.transcodeStatus).toBe("done"); expect(uploads).toBe(antes + 1)
  expect((await readdir(join(root, "recibos"))).filter(n => n.endsWith(".json"))).toHaveLength(1)
  const retomada = await worker().terminou
  expect(retomada.code, retomada.log).toBe(0); expect(retomada.log).toContain("RESULTADO vazio"); expect(uploads).toBe(antes + 1)
  expect(await readdir(join(root, "recibos"))).toEqual([])
  expect(await db.eventoJob.count({ where: { jobId: salvo.previewJobId!, evento: "concluido" } })).toBe(1)
  const params = Promise.resolve({ caminho: salvo.previewObjectKey!.split("/") })
  for (const query of ["", "?token=outro-token"]) expect((await GET(new NextRequest(`${origin}${salvo.url}${query}`), { params })).status).toBe(404)
  const autorizado = await GET(new NextRequest(`${origin}${salvo.url}?token=${token}`), { params })
  expect(autorizado.status).toBe(302)
  const data = await fetch(autorizado.headers.get("location")!)
  expect(data.status).toBe(200)
  expect(createHash("sha256").update(Buffer.from(await data.arrayBuffer())).digest("hex")).toBe(salvo.previewSha256)
  expect((await fetch(`${origin}/storage/v1/object/sign/midia/${salvo.previewObjectKey}`)).status).toBe(403)
  await db.demanda.update({ where: { id: demanda }, data: { publicTokenAtivo: false } })
  expect((await GET(new NextRequest(`${origin}${salvo.url}?token=${token}`), { params })).status).toBe(404)
}, 30000)
