import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// Os formulários públicos de pedido e de cadastro de videomaker não tinham limite
// nenhum, e cada pedido dispara WhatsApp para os gestores da empresa. O que estes
// testes travam é a ORDEM: o limite tem de ser conferido antes de qualquer
// escrita (solicitante, demanda, perfil) e, no videomaker, antes da checagem de
// duplicidade — senão o 409 continua servindo para testar e-mails à vontade.
// O banco de verdade da função consumir_limite_publico está em
// tests/runtime/leads-limite.spec.ts.

const consumir = vi.fn()
vi.mock("@/lib/limite-publico", () => ({
  consumirLimitePublico: (...a: unknown[]) => consumir(...a),
  hashDoIp: () => "ip-hash-teste",
}))

const orgPublica = vi.fn()
vi.mock("@/lib/org", () => ({ orgPublica: (...a: unknown[]) => orgPublica(...a) }))
vi.mock("@/lib/org-contexto", () => ({ declararOrg: () => {} }))
vi.mock("@/lib/whatsapp", () => ({ sendWhatsappMessage: vi.fn() }))
vi.mock("@/lib/notificar", () => ({ emSegundoPlano: vi.fn() }))
vi.mock("@/lib/lideres-audiovisual", () => ({ notificarLideresAudiovisual: vi.fn() }))
vi.mock("@/lib/videomaker-dados", () => ({ gravarDadosPrivadosVideomaker: vi.fn() }))

// Qualquer toque no banco antes do limite derruba o teste com nome claro.
const tocouNoBanco: string[] = []
vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy({}, {
    get: (_t, modelo) => new Proxy({}, {
      get: (_u, metodo) => async () => {
        tocouNoBanco.push(`${String(modelo)}.${String(metodo)}`)
        throw new Error(`prisma.${String(modelo)}.${String(metodo)} chamado — o limite tinha de vir antes`)
      },
    }),
  }),
}))

// A busca do solicitante vai pela identidade da plataforma (src/lib/criar-usuario.ts),
// não pelo `prisma` acima: o toque conta igual.
vi.mock("@/lib/criar-usuario", () => {
  const tocar = (nome: string) => async () => {
    tocouNoBanco.push(`usuario.${nome}`)
    throw new Error(`${nome} chamado — o limite tinha de vir antes`)
  }
  return { usuarioIdPorTelefone: tocar("idPorTelefone"), usuarioIdPorEmail: tocar("idPorEmail"), criarUsuarioComVinculo: tocar("criarComVinculo") }
})

const { POST: postDemanda } = await import("@/app/api/publico/demanda/route")
const { POST: postVideomaker } = await import("@/app/api/publico/videomaker/route")
const { POST: postDesigner } = await import("@/app/api/publico/designer/route")
const { barrarExcesso, LIMITES_FORMULARIO, MSG_EXCESSO, MSG_INDISPONIVEL } = await import("@/lib/limite-formulario")

const pedido = {
  nomeCliente: "Cliente Teste", email: "cliente@empresa.test", telefone: "31988887777",
  titulo: "Vídeo institucional", descricao: "Um vídeo curto para o site novo.", tipoVideo: "institucional",
}
const videomaker = {
  nome: "Video Maker", cpfCnpj: "12345678901", email: "vm@estudio.test", telefone: "31977776666",
  cidade: "Belo Horizonte", estado: "MG",
}
// O cadastro de designer usa o mesmo formulário (e o mesmo corpo) do videomaker.
const designer = { ...videomaker, nome: "Designer Teste", email: "ds@estudio.test" }
const req = (rota: string, corpo: unknown, org = "clinica-b") =>
  new NextRequest(`http://localhost/api/publico/${rota}?org=${org}`, {
    method: "POST", body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
    headers: { "content-type": "application/json" },
  })

beforeEach(() => {
  consumir.mockReset()
  orgPublica.mockReset().mockResolvedValue("org-B")
  tocouNoBanco.length = 0
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("barrarExcesso", () => {
  it("chave é por tipo, empresa e IP — excesso numa empresa não bloqueia outra", async () => {
    consumir.mockResolvedValue(true)
    expect(await barrarExcesso(new Headers(), "demanda", "org-B")).toBeNull()
    expect(consumir).toHaveBeenCalledWith("demanda:org-B:ip-hash-teste", LIMITES_FORMULARIO.demanda.max, 3600)
    await barrarExcesso(new Headers(), "videomaker", "org-C")
    expect(consumir).toHaveBeenLastCalledWith("videomaker:org-C:ip-hash-teste", LIMITES_FORMULARIO.videomaker.max, 3600)
  })

  it("tetos combinados: 20 pedidos e 5 cadastros por hora", () => {
    expect(LIMITES_FORMULARIO.demanda).toEqual({ max: 20, janelaSeg: 3600 })
    expect(LIMITES_FORMULARIO.videomaker).toEqual({ max: 5, janelaSeg: 3600 })
    expect(LIMITES_FORMULARIO.designer).toEqual({ max: 5, janelaSeg: 3600 })
  })
})

describe("POST /api/publico/demanda", () => {
  it("passou do teto: 429 com frase humana, sem criar solicitante nem demanda", async () => {
    consumir.mockResolvedValue(false)
    const r = await postDemanda(req("demanda", pedido))
    expect(r.status).toBe(429)
    expect(r.headers.get("Retry-After")).toBe("300")
    expect((await r.json()).error).toBe(MSG_EXCESSO)
    expect(tocouNoBanco).toEqual([])
    expect(consumir).toHaveBeenCalledWith("demanda:org-B:ip-hash-teste", 20, 3600)
  })

  it("contagem fora do ar: 503 (falha fechada), sem gravar nada", async () => {
    consumir.mockRejectedValue(new Error("connection refused"))
    const r = await postDemanda(req("demanda", pedido))
    expect(r.status).toBe(503)
    expect((await r.json()).error).toBe(MSG_INDISPONIVEL)
    expect(tocouNoBanco).toEqual([])
  })

  it("empresa desconhecida responde 404 sem consumir o limite de ninguém", async () => {
    orgPublica.mockResolvedValue(null)
    const r = await postDemanda(req("demanda", pedido, "nao-existe"))
    expect(r.status).toBe(404)
    expect(consumir).not.toHaveBeenCalled()
  })

  it("dentro do teto segue para o banco (o limite não barra quem está no ritmo normal)", async () => {
    consumir.mockResolvedValue(true)
    await postDemanda(req("demanda", pedido)).catch(() => null)
    expect(tocouNoBanco[0]).toMatch(/^usuario\./)
  })

  it("corpo que não é JSON é 400, não 500, e não consome limite", async () => {
    const r = await postDemanda(req("demanda", "isto não é json"))
    expect(r.status).toBe(400)
    expect(consumir).not.toHaveBeenCalled()
  })
})

describe("POST /api/publico/videomaker", () => {
  it("passou do teto: 429 antes da checagem de duplicidade", async () => {
    consumir.mockResolvedValue(false)
    const r = await postVideomaker(req("videomaker", videomaker))
    expect(r.status).toBe(429)
    expect((await r.json()).error).toBe(MSG_EXCESSO)
    // Nem a busca por e-mail/CPF: o 409 não pode virar oráculo de cadastros.
    expect(tocouNoBanco).toEqual([])
    expect(consumir).toHaveBeenCalledWith("videomaker:org-B:ip-hash-teste", 5, 3600)
  })

  it("contagem fora do ar: 503, sem gravar nada", async () => {
    consumir.mockRejectedValue(new Error("timeout"))
    const r = await postVideomaker(req("videomaker", videomaker))
    expect(r.status).toBe(503)
    expect(tocouNoBanco).toEqual([])
  })

  it("dentro do teto, a primeira coisa no banco é a checagem de duplicidade", async () => {
    consumir.mockResolvedValue(true)
    await postVideomaker(req("videomaker", videomaker)).catch(() => null)
    expect(tocouNoBanco[0]).toMatch(/^(videomaker|videomakerDadosFiscais)\.findFirst$/)
  })
})

describe("POST /api/publico/designer", () => {
  it("passou do teto: 429 antes da checagem de duplicidade", async () => {
    consumir.mockResolvedValue(false)
    const r = await postDesigner(req("designer", designer))
    expect(r.status).toBe(429)
    expect((await r.json()).error).toBe(MSG_EXCESSO)
    expect(tocouNoBanco).toEqual([])
    expect(consumir).toHaveBeenCalledWith("designer:org-B:ip-hash-teste", 5, 3600)
  })

  it("contagem fora do ar: 503, sem gravar nada", async () => {
    consumir.mockRejectedValue(new Error("timeout"))
    const r = await postDesigner(req("designer", designer))
    expect(r.status).toBe(503)
    expect(tocouNoBanco).toEqual([])
  })

  it("sem CPF/CNPJ é 400 e não consome limite", async () => {
    const r = await postDesigner(req("designer", { ...designer, cpfCnpj: "" }))
    expect(r.status).toBe(400)
    expect(consumir).not.toHaveBeenCalled()
  })

  it("portfólio javascript: é recusado", async () => {
    const r = await postDesigner(req("designer", { ...designer, portfolio: "javascript:alert(1)" }))
    expect(r.status).toBe(400)
  })

  it("dentro do teto, a primeira coisa no banco é a duplicidade NESTA empresa", async () => {
    consumir.mockResolvedValue(true)
    await postDesigner(req("designer", designer)).catch(() => null)
    expect(tocouNoBanco[0]).toMatch(/^(designerOrganizacao|designerDadosFiscais)\.findFirst$/)
  })
})
