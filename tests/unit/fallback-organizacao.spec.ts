import { describe, it, expect, vi, beforeEach } from "vitest"

// Até 24/08/2026, sem organização o sistema não parava: ele caía na Contourline.
// WhatsApp saía pelo número dela, e-mail com o remetente dela, arquivo no Drive
// dela. Enquanto havia uma empresa só isso era invisível. Com a segunda, vira
// mensagem de um cliente saindo pelo canal de outro.
//
// A regra nova é falhar FECHADO: sem organização, não envia. Não enviar é
// recuperável; enviar pelo remetente errado não é.

const findFirstWpp = vi.fn()
const findFirstEmail = vi.fn()
const findUniqueDemanda = vi.fn()
const findUniqueOrg = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    configWhatsapp: { findFirst: (...a: unknown[]) => findFirstWpp(...a) },
    configEmail: { findFirst: (...a: unknown[]) => findFirstEmail(...a) },
    demanda: { findUnique: (...a: unknown[]) => findUniqueDemanda(...a) },
    organizacao: { findUnique: (...a: unknown[]) => findUniqueOrg(...a) },
  },
}))

const { getWhatsappConfig } = await import("@/lib/whatsapp")

beforeEach(() => {
  findFirstWpp.mockReset()
  findFirstEmail.mockReset()
  findUniqueDemanda.mockReset()
  findUniqueOrg.mockReset()
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

describe("getWhatsappConfig", () => {
  it("sem organização, devolve null e NÃO consulta config nenhuma", async () => {
    // O ponto não é só o retorno: é não chegar ao banco. Uma consulta sem
    // escopo aqui traria a config de outra empresa.
    expect(await getWhatsappConfig(null)).toBeNull()
    expect(await getWhatsappConfig(undefined)).toBeNull()
    expect(findFirstWpp).not.toHaveBeenCalled()
    expect(findUniqueOrg).not.toHaveBeenCalled()
  })

  it("com organização, consulta escopada nela", async () => {
    findFirstWpp.mockResolvedValue({ id: "cfg-1" })
    const r = await getWhatsappConfig("org-A")
    expect(r).toEqual({ id: "cfg-1" })
    expect(findFirstWpp).toHaveBeenCalledWith({ where: { organizacaoId: "org-A", ativo: true } })
  })

  it("nunca busca a organização por slug fixo", async () => {
    findFirstWpp.mockResolvedValue(null)
    await getWhatsappConfig("org-B")
    // `findUnique({ where: { slug: "contourline" } })` era como o fallback
    // encontrava a empresa legada. Se voltar, este teste cai.
    expect(findUniqueOrg).not.toHaveBeenCalled()
  })
})

describe("organização padrão das rotas públicas", () => {
  it("vem de configuração, não de slug cravado no código", async () => {
    const { SLUG_ORG_PADRAO } = await import("@/lib/org")
    expect(SLUG_ORG_PADRAO).toBe(process.env.ORG_PUBLICA_PADRAO || "contourline")
  })
})

describe("urlComOrg — propaga a empresa dona do link", () => {
  it("fora do navegador devolve o caminho intacto, sem quebrar render no servidor", async () => {
    const { urlComOrg } = await import("@/lib/org-publica-cliente")
    expect(urlComOrg("/api/publico/demanda")).toBe("/api/publico/demanda")
  })

  it("escolhe ? ou & pelo próprio caminho, escapando o valor", async () => {
    const { urlComOrg } = await import("@/lib/org-publica-cliente")
    vi.stubGlobal("window", { location: { pathname: "/cadastrar-demanda", search: "?org=meu nuflow" } })
    expect(urlComOrg("/api/publico/demanda")).toBe("/api/publico/demanda?org=meu%20nuflow")
    // O defeito que existia: "?grupo=tipos_video?org=..." fazia a API ler um grupo inexistente.
    expect(urlComOrg("/api/publico/parametros?grupo=tipos_video")).toBe("/api/publico/parametros?grupo=tipos_video&org=meu%20nuflow")
    vi.stubGlobal("window", { location: { pathname: "/cadastrar-demanda", search: "" } })
    expect(urlComOrg("/api/publico/demanda")).toBe("/api/publico/demanda")
    vi.unstubAllGlobals()
  })

  it("na área da empresa, o slug vem do caminho e vence o ?org=", async () => {
    const { urlComOrg } = await import("@/lib/org-publica-cliente")
    vi.stubGlobal("window", { location: { pathname: "/c/clinica-b/pedido", search: "?org=outra" } })
    expect(urlComOrg("/api/publico/demanda")).toBe("/api/publico/demanda?org=clinica-b")
    vi.unstubAllGlobals()
  })
})

describe("slugDoCaminho — reconhece a área /c/<slug>", () => {
  it("lê o slug da área e de suas páginas", async () => {
    const { slugDoCaminho } = await import("@/lib/org-publica-cliente")
    expect(slugDoCaminho("/c/contourline")).toBe("contourline")
    expect(slugDoCaminho("/c/clinica-b/pedido")).toBe("clinica-b")
    expect(slugDoCaminho("/c/Clinica-B/entrar")).toBe("clinica-b")
  })

  it("recusa o que não é área nem slug válido", async () => {
    const { slugDoCaminho } = await import("@/lib/org-publica-cliente")
    for (const caminho of ["/cadastrar-demanda", "/c/", "/c", "/contourline", "/c/-x", "/c/a_b", "/c/%E0%A4%A", "/c/a b", "/c/x-"]) {
      expect(slugDoCaminho(caminho), caminho).toBeNull()
    }
  })
})
