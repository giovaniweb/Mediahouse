import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Evolution gerenciada: a empresa nova guarda a chave DA INSTÂNCIA dela, nunca
// a mestra do servidor, que abre o WhatsApp de todas as empresas.

const m = vi.hoisted(() => ({ findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), org: vi.fn() }))
vi.mock("@/lib/acesso", () => ({ requireAcesso: async () => ({ usuarioId: "u", organizacaoId: "org-nova", papel: "admin", permissoes: {} }) }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    configWhatsapp: { findFirst: m.findFirst, create: m.create, update: m.update },
    organizacao: { findUnique: m.org },
  },
}))
vi.mock("@/lib/whatsapp-webhook", () => ({ registrarWebhookEntrada: vi.fn(), origemPublica: () => "https://app.invalid" }))

const { chaveDaInstanciaGerenciada } = await import("@/lib/whatsapp-gerenciada")
const { GET: qr } = await import("@/app/api/configuracoes/whatsapp/qr/route")

const MESTRA = "chave-mestra-sintetica"
const resposta = (status: number, corpo: unknown = {}) => new Response(JSON.stringify(corpo), { status })
type Chamada = { url: string; apikey: string | undefined }
let chamadas: Chamada[] = []
function servidor(rotas: (url: string, metodo: string) => Response) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    chamadas.push({ url, apikey: (init?.headers as Record<string, string> | undefined)?.apikey })
    return rotas(url, init?.method ?? "GET")
  }))
}

beforeEach(() => { chamadas = []; vi.clearAllMocks() })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe("chave da instância gerenciada", () => {
  it("instância nova: cria e devolve a chave dela (v2 manda `hash` como texto)", async () => {
    servidor((url, metodo) => url.includes("connectionState") ? resposta(404)
      : metodo === "POST" && url.endsWith("/instance/create") ? resposta(201, { instance: { instanceName: "nuflow_gh" }, hash: "chave-da-gh" })
      : resposta(500))
    expect(await chaveDaInstanciaGerenciada("https://evo.invalid/", MESTRA, "nuflow_gh")).toEqual({ chave: "chave-da-gh" })
  })
  it("v1 manda a chave em `hash.apikey`", async () => {
    servidor((url) => url.includes("connectionState") ? resposta(404) : resposta(201, { hash: { apikey: "chave-v1" } }))
    expect(await chaveDaInstanciaGerenciada("https://evo.invalid", MESTRA, "nuflow_gh")).toEqual({ chave: "chave-v1" })
  })
  it("instância que já existe: acha a chave dela na lista, pelo nome", async () => {
    servidor((url) => url.includes("connectionState") ? resposta(200, { instance: { state: "close" } })
      : resposta(200, [{ name: "outra", token: "chave-de-outra" }, { name: "nuflow_gh", token: "chave-da-gh" }]))
    expect(await chaveDaInstanciaGerenciada("https://evo.invalid", MESTRA, "nuflow_gh")).toEqual({ chave: "chave-da-gh" })
  })
  it("criação recusada porque o outro clique já criou: acha a chave na lista", async () => {
    servidor((url, metodo) => url.includes("connectionState") ? resposta(404)
      : metodo === "POST" ? resposta(403, { error: "This name is already in use" })
      : resposta(200, [{ name: "nuflow_gh", token: "chave-da-gh" }]))
    expect(await chaveDaInstanciaGerenciada("https://evo.invalid", MESTRA, "nuflow_gh")).toEqual({ chave: "chave-da-gh" })
  })
  it.each([
    ["criação sem chave", (url: string) => url.includes("connectionState") ? resposta(404) : resposta(201, { instance: {} })],
    ["lista sem a instância", (url: string) => url.includes("connectionState") ? resposta(200) : resposta(200, [{ name: "outra", token: "x" }])],
    ["criação recusada", (url: string) => url.includes("connectionState") ? resposta(404) : resposta(403)],
  ])("%s: erro, e nunca a chave mestra", async (_nome, rotas) => {
    servidor(rotas)
    const r = await chaveDaInstanciaGerenciada("https://evo.invalid", MESTRA, "nuflow_gh")
    expect(r).toHaveProperty("erro")
    expect(JSON.stringify(r)).not.toContain(MESTRA)
  })
})

describe("QR de empresa sem configuração", () => {
  beforeEach(() => {
    vi.stubEnv("EVOLUTION_API_URL", "https://evo.invalid")
    vi.stubEnv("EVOLUTION_API_KEY", MESTRA)
    m.findFirst.mockResolvedValue(null)
    m.org.mockResolvedValue({ slug: "gh-producao" })
    m.create.mockImplementation(async ({ data }: { data: object }) => ({ id: "cfg", webhookSecret: null, ...data }))
  })

  it("grava a chave da instância e usa a mestra só para criar", async () => {
    servidor((url, metodo) => {
      if (url.includes("connectionState")) return chamadas.filter(c => c.url.includes("connectionState")).length === 1 ? resposta(404) : resposta(200, { instance: { state: "close" } })
      if (metodo === "POST") return resposta(201, { hash: "chave-da-gh" })
      if (url.includes("/instance/connect/")) return resposta(200, { base64: "qr-sintetico" })
      return resposta(500)
    })
    const res = await qr()
    expect(res.status).toBe(200)
    expect(m.create.mock.calls[0][0].data).toMatchObject({ apiKey: "chave-da-gh", instanceId: "nuflow_gh-producao" })
    expect(JSON.stringify(m.create.mock.calls)).not.toContain(MESTRA)
    // Depois de gravada, a configuração fala com a Evolution pela chave dela.
    const depois = chamadas.slice(2)
    expect(depois.length).toBeGreaterThan(0)
    expect(depois.every(c => c.apikey === "chave-da-gh")).toBe(true)
  })

  it("sem a chave da instância, não grava nada", async () => {
    servidor((url) => url.includes("connectionState") ? resposta(404) : resposta(201, {}))
    expect((await qr()).status).toBe(502)
    expect(m.create).not.toHaveBeenCalled()
  })
})
