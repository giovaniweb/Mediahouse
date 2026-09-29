import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
import pg from "pg"
const { estado } = vi.hoisted(() => ({ estado: { sessao: null as null | { user: { id: string; organizacaoId: string } } } }))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { GET as iniciar } from "@/app/api/auth/setup-drive/route"
import { GET as callback } from "@/app/api/auth/setup-drive/callback/route"
import { DRIVE_STATE_COOKIE, hashEstadoDrive } from "@/lib/drive-oauth"
import { cifrarTokenDrive, lerTokenDrive } from "@/lib/integration-secret"
import { migrarCredenciaisDrive } from "@/lib/drive-credential-migration"
const prefix = `oauth-${randomUUID()}`, orgA = `${prefix}-a`, orgB = `${prefix}-b`, userA = `${prefix}-u`, userB = `${prefix}-v`
const fetchFake = vi.fn()
const req = (state: string, cookie = state) => new NextRequest(`http://localhost:3000/api/auth/setup-drive/callback?state=${encodeURIComponent(state)}&code=code-sintetico`, { headers: { cookie: `${DRIVE_STATE_COOKIE}=${cookie}` } })
const resultado = (res: Response) => new URL(res.headers.get("location")!).searchParams.get("drive")
async function estadoNovo() {
  const res = await iniciar(); expect(res.status).toBe(307)
  const state = new URL(res.headers.get("location")!).searchParams.get("state")!
  expect(res.headers.get("set-cookie")).toContain("HttpOnly")
  expect(state).not.toContain(orgA)
  expect((await db.oAuthDriveEstado.findUnique({ where: { hash: hashEstadoDrive(state) } }))?.usuarioId).toBe(userA)
  return state
}
beforeAll(async () => {
  await db.organizacao.createMany({ data: [orgA, orgB].map(id => ({ id, nome: id, slug: id })) })
  await db.usuario.createMany({ data: [userA, userB].map(id => ({ id, nome: id, senhaHash: "sem-login-real" })) })
  await db.usuarioOrganizacao.createMany({ data: [userA, userB].flatMap(usuarioId => [orgA, orgB].map(organizacaoId => ({ usuarioId, organizacaoId, papel: "admin", areas: [] }))) })
})
beforeEach(async () => {
  estado.sessao = { user: { id: userA, organizacaoId: orgA } }
  vi.stubEnv("GOOGLE_CLIENT_ID", "client-sintetico"); vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret-sintetico")
  vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000")
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY_ID", "k1")
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEYS", JSON.stringify({ k1: Buffer.alloc(32, 7).toString("base64") }))
  fetchFake.mockReset().mockImplementation(async (url: string) => {
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "access-sintetico", refresh_token: "refresh-sintetico" })
    if (url === "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)") return Response.json({ user: { emailAddress: "teste@example.invalid" } })
    throw new Error("Chamada externa não suportada no teste")
  })
  vi.stubGlobal("fetch", fetchFake)
  await db.eventoAuditoria.deleteMany({ where: { organizacaoId: { in: [orgA, orgB] } } })
  await db.configEmpresa.deleteMany({ where: { organizacaoId: { in: [orgA, orgB] } } })
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
afterAll(async () => {
  await db.organizacao.deleteMany({ where: { id: { in: [orgA, orgB] } } })
  await db.usuario.deleteMany({ where: { id: { in: [userA, userB] } } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})
describe("OAuth Drive com Postgres real e Google sintético", () => {
  it("salva token cifrado e preserva fiscal", async () => {
    await db.configEmpresa.create({ data: { organizacaoId: orgA, cnpj: "cnpj-preservado" } })
    const state = await estadoNovo(), res = await callback(req(state))
    expect(resultado(res)).toBe("conectado")
    const config = await db.configEmpresa.findFirst({ where: { organizacaoId: orgA } })
    expect(config?.cnpj).toBe("cnpj-preservado")
    expect(config?.googleRefreshToken).toMatch(/^nuflow-secret:1:k1:/)
    expect(lerTokenDrive(config!.googleRefreshToken!, orgA)).toBe("refresh-sintetico")
    expect(res.headers.get("location")).not.toContain("token")
    expect((await db.oAuthDriveEstado.findUnique({ where: { hash: hashEstadoDrive(state) } }))?.consumidoEm).not.toBeNull()
  })
  it("callback duplicado concorrente faz só uma troca e um save", async () => {
    const state = await estadoNovo()
    const respostas = await Promise.all([callback(req(state)), callback(req(state))])
    expect(respostas.map(resultado).sort()).toEqual(["autorizacao_invalida", "conectado"])
    expect(fetchFake.mock.calls.filter(([url]) => url === "https://oauth2.googleapis.com/token")).toHaveLength(1)
    expect(await db.configEmpresa.count({ where: { organizacaoId: orgA } })).toBe(1)
  })
  it.each(["sem_cookie", "outra_empresa", "outra_pessoa", "expirado", "legado"])("recusa %s antes de chamar provedor", async caso => {
    const state = await estadoNovo()
    if (caso === "outra_empresa") estado.sessao!.user.organizacaoId = orgB
    if (caso === "outra_pessoa") estado.sessao!.user.id = userB
    if (caso === "expirado") await db.oAuthDriveEstado.update({ where: { hash: hashEstadoDrive(state) }, data: { expiraEm: new Date(0) } })
    const res = await callback(req(caso === "legado" ? `setup-drive:${orgA}` : state, caso === "sem_cookie" ? "" : caso === "legado" ? `setup-drive:${orgA}` : state))
    expect(resultado(res)).toBe("autorizacao_invalida"); expect(fetchFake).not.toHaveBeenCalled()
    expect(await db.configEmpresa.count({ where: { organizacaoId: { in: [orgA, orgB] } } })).toBe(0)
  })
  it("sem sessão nega; vínculo removido durante OAuth também nega", async () => {
    const state = await estadoNovo(); estado.sessao = null
    expect((await callback(req(state))).status).toBe(401)
    estado.sessao = { user: { id: userA, organizacaoId: orgA } }
    await db.usuarioOrganizacao.delete({ where: { usuarioId_organizacaoId: { usuarioId: userA, organizacaoId: orgA } } })
    try { expect((await callback(req(state))).status).toBe(403); expect(fetchFake).not.toHaveBeenCalled() }
    finally { await db.usuarioOrganizacao.create({ data: { usuarioId: userA, organizacaoId: orgA, papel: "admin", areas: [] } }) }
  })
  it("não substitui credencial nem repete code quando provedor falha", async () => {
    await db.configEmpresa.create({ data: { organizacaoId: orgA, googleRefreshToken: "anterior" } })
    const state = await estadoNovo(); fetchFake.mockResolvedValue(Response.json({ error: "recusado" }, { status: 400 }))
    expect(resultado(await callback(req(state)))).toBe("erro_token")
    expect(resultado(await callback(req(state)))).toBe("autorizacao_invalida")
    expect((await db.configEmpresa.findFirst({ where: { organizacaoId: orgA } }))?.googleRefreshToken).toBe("anterior")
    expect(fetchFake).toHaveBeenCalledTimes(1)
  })
  it("preserva refresh anterior da mesma conta se Google não enviar outro", async () => {
    await db.configEmpresa.create({ data: { organizacaoId: orgA, googleRefreshToken: "anterior", googleDriveEmail: "teste@example.invalid" } })
    const state = await estadoNovo()
    fetchFake.mockImplementationOnce(async () => Response.json({ access_token: "access-sintetico" }))
    expect(resultado(await callback(req(state)))).toBe("conectado")
    const token = (await db.configEmpresa.findFirst({ where: { organizacaoId: orgA } }))!.googleRefreshToken!
    expect(lerTokenDrive(token, orgA)).toBe("anterior"); expect(token).not.toBe("anterior")
  })
  it("duas autorizações válidas da mesma empresa não criam configuração duplicada", async () => {
    const a = await estadoNovo(), b = await estadoNovo()
    const respostas = await Promise.all([callback(req(a)), callback(req(b))])
    expect(respostas.map(resultado)).toEqual(["conectado", "conectado"])
    expect(await db.configEmpresa.count({ where: { organizacaoId: orgA } })).toBe(1)
  })
  it("sem refresh novo não mistura token antigo com outra conta Google", async () => {
    await db.configEmpresa.create({ data: { organizacaoId: orgA, googleRefreshToken: "anterior", googleDriveEmail: "outra@example.invalid" } })
    const state = await estadoNovo()
    fetchFake.mockImplementationOnce(async () => Response.json({ access_token: "access-sintetico" }))
    expect(resultado(await callback(req(state)))).toBe("erro_conexao")
    const config = await db.configEmpresa.findFirst({ where: { organizacaoId: orgA } })
    expect(config?.googleRefreshToken).toBe("anterior"); expect(config?.googleDriveEmail).toBe("outra@example.invalid")
  })
  it("perda de acesso durante a chamada Google impede salvar", async () => {
    const state = await estadoNovo()
    fetchFake.mockImplementationOnce(async () => {
      await db.usuarioOrganizacao.delete({ where: { usuarioId_organizacaoId: { usuarioId: userA, organizacaoId: orgA } } })
      return Response.json({ access_token: "access-sintetico", refresh_token: "refresh-sintetico" })
    })
    try {
      expect(resultado(await callback(req(state)))).toBe("autorizacao_invalida")
      expect(await db.configEmpresa.count({ where: { organizacaoId: orgA } })).toBe(0)
    } finally { await db.usuarioOrganizacao.create({ data: { usuarioId: userA, organizacaoId: orgA, papel: "admin", areas: [] } }) }
  })
  it("migração concorrente rotaciona a chave uma vez sem perder o token", async () => {
    const antigo = cifrarTokenDrive("rotacionar", orgA)
    await db.configEmpresa.create({ data: { organizacaoId: orgA, googleRefreshToken: antigo } })
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEYS", JSON.stringify({ k1: Buffer.alloc(32, 7).toString("base64"), k2: Buffer.alloc(32, 8).toString("base64") }))
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY_ID", "k2")
    const resultados = await Promise.all([migrarCredenciaisDrive(orgA, true), migrarCredenciaisDrive(orgA, true)])
    expect(resultados.flatMap(r => r.itens).filter(i => i.estado === "cifrado")).toHaveLength(1)
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEYS", JSON.stringify({ k2: Buffer.alloc(32, 8).toString("base64") }))
    const token = (await db.configEmpresa.findFirst({ where: { organizacaoId: orgA } }))!.googleRefreshToken!
    expect(lerTokenDrive(token, orgA)).toBe("rotacionar")
  })
  it("sem chave recusa o início e não grava texto puro", async () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEYS", "{}")
    expect((await iniciar()).status).toBe(503); expect(fetchFake).not.toHaveBeenCalled()
  })
  it("migração é simulável, idempotente, isolada e não destrói ilegível", async () => {
    await db.configEmpresa.createMany({ data: [
      { organizacaoId: orgA, googleRefreshToken: "legado-a" },
      { organizacaoId: orgA, googleRefreshToken: "nuflow-secret:2:invalido" },
      { organizacaoId: orgB, googleRefreshToken: "legado-b" },
    ] })
    const sim = await migrarCredenciaisDrive(orgA)
    expect(sim.itens.map(i => i.estado).sort()).toEqual(["a_cifrar", "ilegivel_reconectar"])
    expect(JSON.stringify(sim)).not.toContain("legado-a")
    expect(await db.configEmpresa.count({ where: { organizacaoId: orgA, googleRefreshToken: "legado-a" } })).toBe(1)
    const aplica = await migrarCredenciaisDrive(orgA, true)
    expect(aplica.itens.map(i => i.estado).sort()).toEqual(["cifrado", "ilegivel_reconectar"])
    expect((await migrarCredenciaisDrive(orgA, true)).itens.map(i => i.estado).sort()).toEqual(["ilegivel_reconectar", "ja_protegido"])
    expect((await db.configEmpresa.findFirst({ where: { organizacaoId: orgB } }))?.googleRefreshToken).toBe("legado-b")
  })
  it("RLS da tabela OAuth isola leitura e impede gravação na empresa alheia", async () => {
    const state = await estadoNovo(), c = new pg.Client({ connectionString: process.env.DATABASE_URL_TEST })
    await c.connect()
    try {
      await c.query("BEGIN"); await c.query("SET LOCAL ROLE app_user")
      await c.query("SELECT set_config('app.org_id', $1, true)", [orgB])
      expect((await c.query('SELECT hash FROM oauth_drive_estados WHERE hash=$1', [hashEstadoDrive(state)])).rowCount).toBe(0)
      await expect(c.query('INSERT INTO oauth_drive_estados (hash,"organizacaoId","usuarioId","expiraEm") VALUES ($1,$2,$3,now())', [randomUUID(), orgA, userA])).rejects.toThrow()
    } finally { await c.query("ROLLBACK"); await c.end() }
  })
  it("audita intenção/resultado correlacionados sem token, nonce ou conta", async () => {
    const state = await estadoNovo()
    expect(resultado(await callback(req(state)))).toBe("conectado")
    const eventos = await db.eventoAuditoria.findMany({ where: { organizacaoId: orgA, acao: "drive.conexao" } })
    expect(eventos.map(e => e.resultado).sort()).toEqual(["intencao", "sucesso"])
    expect(new Set(eventos.map(e => e.correlationId)).size).toBe(1)
    for (const segredo of [state, "access-sintetico", "refresh-sintetico", "teste@example.invalid", "code-sintetico"]) expect(JSON.stringify(eventos)).not.toContain(segredo)
    fetchFake.mockReset().mockResolvedValue(new Response("segredo-do-provedor", { status: 500 }))
    expect(resultado(await callback(req(await estadoNovo())))).toBe("erro_token")
    expect(await db.eventoAuditoria.count({ where: { organizacaoId: orgA, resultado: "falha" } })).toBe(1)
    expect(await db.eventoAuditoria.count({ where: { organizacaoId: orgA, resultado: "sucesso" } })).toBe(1)
  })

})
