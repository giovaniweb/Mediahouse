import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Auditoria de 18/11/2026, item 6 (médios): kit do videomaker, segredo do
// webhook do WhatsApp e o registro dele na Evolution.

describe("kit do videomaker só com convite vigente", () => {
  const agora = new Date("2026-11-18T12:00:00Z")
  const base = { videomakerId: "vm", demanda: { videomakerId: "vm", statusInterno: "captacao_agendada" } }
  it.each([
    ["pendente no prazo", { status: "pendente", expiresAt: new Date("2026-11-19T00:00:00Z") }, true],
    ["pendente vencido", { status: "pendente", expiresAt: new Date("2026-11-17T00:00:00Z") }, false],
    ["aceito, gravação aberta, ele escalado", { status: "aceito", expiresAt: new Date("2026-01-01") }, true],
    ["recusado", { status: "recusado", expiresAt: new Date("2027-01-01") }, false],
    ["expirado", { status: "expirado", expiresAt: new Date("2027-01-01") }, false],
    ["cancelado", { status: "cancelado", expiresAt: new Date("2027-01-01") }, false],
  ])("%s", async (_n, c, esperado) => {
    const { conviteVigenteParaKit } = await import("@/lib/kit-videomaker")
    expect(conviteVigenteParaKit({ ...base, ...c }, agora)).toBe(esperado)
  })
  it("aceito, mas a gravação foi encerrada ou ele foi trocado: não abre", async () => {
    const { conviteVigenteParaKit } = await import("@/lib/kit-videomaker")
    const aceito = { status: "aceito", expiresAt: null, videomakerId: "vm" }
    expect(conviteVigenteParaKit({ ...aceito, demanda: { videomakerId: "vm", statusInterno: "encerrado" } }, agora)).toBe(false)
    expect(conviteVigenteParaKit({ ...aceito, demanda: { videomakerId: "outro", statusInterno: "captacao_agendada" } }, agora)).toBe(false)
  })
})

describe("webhook do WhatsApp: segredo no cabeçalho, URL só como reserva", () => {
  const receber = vi.fn()
  beforeEach(() => {
    vi.resetModules()
    receber.mockReset().mockResolvedValue({ resultado: "ok" })
    vi.doMock("@/lib/whatsapp-inbox", () => ({ receberEntrada: receber, EntradaRecusada: class extends Error {}, processarInbox: vi.fn() }))
    vi.doMock("@/lib/whatsapp-outbox", () => ({ processarSaidas: vi.fn() }))
    vi.doMock("@/lib/prisma", () => ({ prisma: {} }))
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })
  async function chamar(url: string, headers: Record<string, string> = {}) {
    const { POST } = await import("@/app/api/whatsapp/webhook/route")
    const { NextRequest } = await import("next/server")
    await POST(new NextRequest(url, { method: "POST", headers, body: JSON.stringify({ instance: "x" }) }))
    return receber.mock.calls[0][1] as string | null
  }

  it("cabeçalho vale e não avisa", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(await chamar("http://x/api/whatsapp/webhook?s=da-url", { "x-webhook-secret": "do-cabecalho" })).toBe("do-cabecalho")
    expect(aviso).not.toHaveBeenCalled()
  })
  it("só na URL: aceito por enquanto, com aviso de depreciação", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(await chamar("http://x/api/whatsapp/webhook?s=da-url")).toBe("da-url")
    expect(aviso.mock.calls[0][0]).toContain("DEPRECIADO")
  })
  it("com o fallback desligado, a URL não vale", async () => {
    vi.stubEnv("WHATSAPP_WEBHOOK_SEGREDO_NA_URL", "desligado")
    expect(await chamar("http://x/api/whatsapp/webhook?s=da-url")).toBeNull()
  })
})

describe("registro do webhook na Evolution manda o cabeçalho", () => {
  const corpos: Record<string, unknown>[] = []
  beforeEach(() => {
    vi.resetModules()
    corpos.length = 0
    vi.doMock("@/lib/prisma", () => ({ prisma: { configWhatsapp: { updateMany: vi.fn() } } }))
    vi.doMock("@/lib/secret-crypto", () => ({ decryptSecret: () => "segredo-plano", encryptSecret: (v: string) => v }))
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/webhook/set/")) corpos.push(JSON.parse(String(init?.body)))
      return new Response(JSON.stringify({ enabled: true, events: ["MESSAGES_UPSERT"] }), { status: 200 })
    }))
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
  const config = { id: "c", organizacaoId: "o", instanceUrl: "https://evo.invalid", apiKey: "k", instanceId: "i", webhookSecret: "cifrado" }

  it("transição: cabeçalho e, ainda, a URL com ?s=", async () => {
    const { registrarWebhookEntrada } = await import("@/lib/whatsapp-webhook")
    const r = await registrarWebhookEntrada(config, "https://nuflow.invalid")
    expect(r.urlRegistrada).toBe("https://nuflow.invalid/api/whatsapp/webhook")
    const c = corpos[0] as { url: string; headers: Record<string, string>; webhook: { headers: Record<string, string> } }
    expect(c.headers).toEqual({ "x-webhook-secret": "segredo-plano" })
    expect(c.webhook.headers).toEqual({ "x-webhook-secret": "segredo-plano" })
    expect(c.url).toBe("https://nuflow.invalid/api/whatsapp/webhook?s=segredo-plano")
  })
  it("fallback desligado: o segredo sai da URL", async () => {
    vi.stubEnv("WHATSAPP_WEBHOOK_SEGREDO_NA_URL", "desligado")
    const { registrarWebhookEntrada } = await import("@/lib/whatsapp-webhook")
    await registrarWebhookEntrada(config, "https://nuflow.invalid")
    expect((corpos[0] as { url: string }).url).toBe("https://nuflow.invalid/api/whatsapp/webhook")
  })
})
