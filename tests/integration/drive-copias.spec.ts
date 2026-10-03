import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest"
import { randomBytes, createHash } from "node:crypto"
import pg from "pg"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { prismaBase as adminDb } from "@/lib/prisma"
import { comRls } from "@/lib/prisma-rls"
import { comOrg } from "@/lib/org-contexto"
import { enfileirarCopiasDrive, executarCopiaDrive, statusCopiasDrive, verificarPastaDrive } from "@/lib/drive-copias"
vi.mock("@/lib/midia", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/midia")>(), urlAssinadaDeLeitura: async (key: string) => `https://storage.test/storage/v1/object/sign/midia/${key}?token=SEGREDO` }))
const prefix = `drive-${randomBytes(5).toString("hex")}`, org = `${prefix}-a`, outra = `${prefix}-b`, user = `${prefix}-u`, demanda = `${prefix}-d`, arquivo = `${prefix}-f`
const role = `teste_drive_${randomBytes(5).toString("hex")}`, senha = randomBytes(16).toString("hex")
const admin = new pg.Client({ connectionString: process.env.DATABASE_URL_TEST })
let db: PrismaClient, raw: PrismaClient
const original = Buffer.from("original de teste Drive"), digest = (algo: string) => createHash(algo).update(original).digest("hex")
let metadata: Record<string, unknown> | null, chamadas: { url: string; method: string }[], uploads: number, gerados: number, simularQueda: boolean, alterarPasta: boolean, statusOAuth: number, statusPasta: number, bytes: Buffer
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data),{ status, headers: { "Content-Type": "application/json" } })
const fetchFake = async (url: string | URL | Request, init: RequestInit = {}) => {
  const u = new URL(String(url)), method = init.method ?? "GET"; chamadas.push({ url: u.origin+u.pathname, method })
  if (u.origin === "https://oauth2.googleapis.com") return statusOAuth === 200 ? json({ access_token: "TOKEN_PRIVADO" }) : json({ error: "NAO_EXPORTAR" },statusOAuth)
  if (u.origin === "https://storage.test") {
    if (alterarPasta) await adminDb.configEmpresa.updateMany({ where: { organizacaoId: org }, data: { googleDriveFolderId: "outra-pasta" } })
    return new Response(new Uint8Array(bytes),{ headers: { "Content-Length": String(bytes.length) } })
  }
  if (u.origin !== "https://www.googleapis.com") throw new Error("Rede externa proibida")
  if (u.pathname.endsWith("/generateIds")) { gerados++; return json({ ids: ["id-persistido"] }) }
  if (u.pathname.endsWith("/pasta-teste")) return statusPasta === 200 ? json({ id: "pasta-teste", mimeType: "application/vnd.google-apps.folder", capabilities: { canAddChildren: true } }) : json({ error: "NAO_EXPORTAR" },statusPasta)
  if (method === "POST") {
    const copia = await adminDb.copiaDrive.findFirstOrThrow({ where: { organizacaoId: org } })
    expect(copia.driveFileId).toBe("id-persistido"); expect(copia.sha256).toBe(digest("sha256"))
    expect(String(init.body)).not.toContain("anyone")
    metadata = { ...JSON.parse(String(init.body)), size: "0", version: "1" }; return json(metadata)
  }
  if (method === "PATCH") return new Response(null,{ status: 200, headers: { Location: "https://www.googleapis.com/upload/drive/v3/files/id-persistido?upload_id=privado" } })
  if (method === "PUT") {
    const enviado = Buffer.from(await new Response(init.body as ReadableStream).arrayBuffer()); expect(enviado).toEqual(original)
    uploads++; metadata = { ...metadata, size: String(original.length), md5Checksum: digest("md5"), version: "2" }
    if (simularQueda) { simularQueda = false; throw new TypeError("SEGREDO: resposta perdida após persistência remota") }
    return json(metadata)
  }
  return metadata ? json(metadata) : json({},404)
}
beforeAll(async () => {
  await admin.connect(); await admin.query(`CREATE ROLE "${role}" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${senha}'`); await admin.query(`GRANT app_user TO "${role}"`)
  const u = new URL(process.env.DATABASE_URL_TEST!); u.username = role; u.password = senha
  raw = new PrismaClient({ adapter: new PrismaPg({ connectionString: u.toString() }) }); db = comRls(raw)
  await adminDb.organizacao.createMany({ data: [org,outra].map(id => ({ id, nome: id, slug: id })) })
  await adminDb.usuario.create({ data: { id: user, nome: user, tipo: "admin", senhaHash: "sem-login" } })
  await adminDb.demanda.create({ data: { id: demanda, organizacaoId: org, solicitanteId: user, codigo: demanda, titulo: demanda, descricao: "sintético", cidade: "teste", departamento: "growth", tipoVideo: "reels", statusVisivel: "finalizado", linkFinal: "/previa-intacta" } })
  await adminDb.configEmpresa.create({ data: { organizacaoId: org, googleDriveFolderId: "pasta-teste", googleDriveConnectedAt: new Date(), googleDriveEmail: "sintetico@example.test", googleRefreshToken: "REFRESH_PRIVADO" } })
})
beforeEach(async () => {
  vi.stubEnv("DRIVE_SYNC_V2_ATIVO","sim"); vi.stubEnv("DRIVE_SYNC_ORGANIZACAO_ID",org); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","https://storage.test"); vi.stubEnv("GOOGLE_CLIENT_ID","fake"); vi.stubEnv("GOOGLE_CLIENT_SECRET","fake")
  metadata = null; chamadas = []; uploads = 0; gerados = 0; simularQueda = false; alterarPasta = false; statusOAuth = 200; statusPasta = 200; bytes = original
  vi.stubGlobal("fetch",fetchFake)
  await adminDb.copiaDrive.deleteMany({ where: { organizacaoId: org } }); await adminDb.jobAutomacao.deleteMany({ where: { organizacaoId: org } }); await adminDb.arquivo.deleteMany({ where: { demandaId: demanda } })
  await adminDb.configEmpresa.updateMany({ where: { organizacaoId: org }, data: { googleDriveFolderId: "pasta-teste" } })
  await adminDb.arquivo.create({ data: { id: arquivo, demandaId: demanda, tipoArquivo: "final", nomeArquivo: "fonte.mov", url: "/previa-intacta", originalUrl: "/original-intacto", fonteProvedor: "supabase", fonteBucket: "midia", fonteObjectKey: `org/${org}/videos/${demanda}/fonte.mov`, fonteVersao: 1, fonteSha256: digest("sha256") } })
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
afterAll(async () => {
  await raw?.$disconnect(); await adminDb.organizacao.deleteMany({ where: { id: { in: [org,outra] } } }); await adminDb.usuario.deleteMany({ where: { id: user } }); await adminDb.$disconnect()
  await admin.query(`DROP ROLE IF EXISTS "${role}"`); await admin.end()
})
async function preparar() { return enfileirarCopiasDrive(db,org) }
it("cópia privada com papel sem bypass: deduplica e preserva original, prévia e link final", async () => {
  const r = await Promise.all([preparar(),preparar()]); expect(r.reduce((n,v) => n+v.enfileirados,0)).toBe(1)
  expect(await executarCopiaDrive(db,org)).toEqual({ estado: "concluido" })
  expect(await executarCopiaDrive(db,org)).toEqual({ estado: "sem_trabalho" }); expect((await preparar()).existentes).toBe(1)
  expect(uploads).toBe(1); expect(gerados).toBe(1); expect(chamadas.some(c => c.url.includes("permissions"))).toBe(false)
  const a = await adminDb.arquivo.findUniqueOrThrow({ where: { id: arquivo } }); expect(a.url).toBe("/previa-intacta"); expect(a.originalUrl).toBe("/original-intacto")
  expect((await adminDb.demanda.findUniqueOrThrow({ where: { id: demanda } })).linkFinal).toBe("/previa-intacta")
  const status = await statusCopiasDrive(db,org); expect(status.estados.concluido).toBe(1); expect(JSON.stringify(status)).not.toMatch(/REFRESH|TOKEN|SEGREDO|upload_id/)
  expect((await statusCopiasDrive(db,outra)).recentes).toHaveLength(0)
})
it("resposta perdida após upload: retry usa ID persistido e reconcilia sem novo envio", async () => {
  await preparar(); simularQueda = true; expect((await executarCopiaDrive(db,org)).estado).toBe("erro")
  await adminDb.jobAutomacao.updateMany({ where: { organizacaoId: org }, data: { agendadoPara: new Date(0) } })
  expect((await executarCopiaDrive(db,org)).estado).toBe("concluido"); expect(uploads).toBe(1); expect(gerados).toBe(1)
})
it.each([401,403,429])("HTTP %s tem diagnóstico seguro e política de retry adequada", async status => {
  await preparar(); statusPasta = status
  const r = await executarCopiaDrive(db,org)
  expect(r.erro).toBe(status === 401 ? "reconectar_google" : status === 403 ? "permissao_google" : "google_http_429")
  const j = await adminDb.jobAutomacao.findFirstOrThrow({ where: { organizacaoId: org } }); expect(j.estado).toBe(status === 429 ? "pendente" : "falhou"); expect(uploads).toBe(0)
})
it("token revogado solicita reconexão, sem vazar resposta do provedor", async () => {
  await preparar(); statusOAuth = 400; expect((await executarCopiaDrive(db,org)).erro).toBe("reconectar_google"); expect(gerados).toBe(0)
})
it.each(["versao","pasta","conta"])("mudança de %s invalida intenção antes da rede", async alteracao => {
  await preparar()
  if (alteracao === "versao") await adminDb.arquivo.update({ where: { id: arquivo }, data: { fonteVersao: 2 } })
  else await adminDb.configEmpresa.updateMany({ where: { organizacaoId: org }, data: alteracao === "pasta" ? { googleDriveFolderId: "nova" } : { googleDriveConnectedAt: new Date(Date.now()+60000) } })
  expect((await executarCopiaDrive(db,org)).erro).toBe("origem_ou_configuracao_alterada"); expect(chamadas).toHaveLength(0)
})
it("troca de pasta durante download impede escrita no Google", async () => {
  await preparar(); alterarPasta = true; expect((await executarCopiaDrive(db,org)).erro).toBe("origem_ou_configuracao_alterada"); expect(uploads).toBe(0); expect(metadata).toBeNull()
})
it("conteúdo divergente da fonte conhecida não cria arquivo remoto", async () => {
  await preparar(); bytes = Buffer.from("adulterado"); expect((await executarCopiaDrive(db,org)).erro).toBe("checksum_origem_divergente"); expect(metadata).toBeNull()
})
it("origem pública legada identificada funciona; link externo ou sem identidade é ignorado", async () => {
  await adminDb.arquivo.update({ where: { id: arquivo }, data: { fonteBucket: "uploads", fonteObjectKey: `videos/${demanda}/fonte.mov` } })
  expect((await preparar()).enfileirados).toBe(1); expect((await executarCopiaDrive(db,org)).estado).toBe("concluido")
  await adminDb.arquivo.update({ where: { id: arquivo }, data: { fonteProvedor: "externo", fonteVersao: 2 } }); expect((await preparar()).ignorados).toBe(1)
})
it("página limitada continua do checkpoint sem varrer toda a biblioteca", async () => {
  await adminDb.arquivo.createMany({ data: Array.from({ length: 51 },(_,i) => ({ id: `${prefix}-x-${String(i).padStart(3,"0")}`, demandaId: demanda, tipoArquivo: "final" as const, nomeArquivo: "externo", url: "https://externo.test/video" })) })
  const a = await preparar(); expect(a.enfileirados+a.ignorados).toBe(50); expect(a.proximoCursor).toBeTruthy()
  const b = await enfileirarCopiasDrive(db,org,a.proximoCursor!); expect(b.ignorados).toBe(2); expect(b.proximoCursor).toBeNull()
})
it("RLS não permite ler cópia de outra empresa nem vincular arquivo dela", async () => {
  await preparar(); const c = await adminDb.copiaDrive.findFirstOrThrow({ where: { organizacaoId: org } })
  expect(await comOrg(outra,() => db.copiaDrive.findUnique({ where: { id: c.id } }))).toBeNull()
  await expect(comOrg(outra,() => db.copiaDrive.create({ data: { id: `${prefix}-invasao`, organizacaoId: outra, arquivoId: arquivo, fonteVersao: 1, fonteBucket: "midia", fonteObjectKey: c.fonteObjectKey, pastaId: "pasta", conexao: "outra", chave: "invasao" } }))).rejects.toThrow()
})
it("verificação de pasta não cria arquivo; piloto desligado não consome nem enfileira", async () => {
  await verificarPastaDrive(db,org); expect(chamadas).toHaveLength(2); expect(gerados).toBe(0); expect(metadata).toBeNull()
  vi.stubEnv("DRIVE_SYNC_V2_ATIVO","nao"); await expect(preparar()).rejects.toThrow("piloto_desativado"); expect((await executarCopiaDrive(db,org)).estado).toBe("desativado")
})
