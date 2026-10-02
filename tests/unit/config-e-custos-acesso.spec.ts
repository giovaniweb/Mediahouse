import { describe, it, expect, vi, beforeEach } from "vitest"

// Hotfix de 02/10/2026. Duas fronteiras que conferiam só "está logado":
//   1. /api/config/empresa devolvia a linha inteira de ConfigEmpresa — com o
//      refresh token do Drive — e lia a empresa padrão em vez da empresa de
//      quem pedia.
//   2. /api/custos-videomaker deixava qualquer membro listar CPF/CNPJ e PIX dos
//      profissionais e criar, alterar ou apagar lançamentos.

type Vinculo = { papel: string; permissoes: Record<string, boolean> } | null

let sessao: { user: { id: string } } | null = { user: { id: "u1" } }
let vinculo: Vinculo = null

const configFindFirst = vi.fn()
const configUpdate = vi.fn()
const configCreate = vi.fn()
const custoFindMany = vi.fn()
const custoCreate = vi.fn()
const custoDeleteMany = vi.fn()
const fiscais = vi.fn()
const diarias = vi.fn()

vi.mock("@/lib/auth", () => ({ auth: async () => sessao }))
vi.mock("@/lib/org", () => ({
  getOrgId: async () => (sessao ? "org-a" : null),
  semOrg: () => Response.json({ error: "sem org" }, { status: 403 }),
  pertenceAOrg: (r: { organizacaoId: string }, org: string) => r.organizacaoId === org,
}))
vi.mock("@/lib/permissoes-server", () => ({
  permissoesEfetivas: async () => vinculo,
  getPermissoes: async () => (vinculo ? vinculo.permissoes : null),
}))
vi.mock("@/lib/videomaker-vinculo", () => ({
  diariasDaEmpresa: (...a: unknown[]) => diarias(...a),
  fiscaisDaEmpresaEmLote: (...a: unknown[]) => fiscais(...a),
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    configEmpresa: {
      findFirst: (...a: unknown[]) => configFindFirst(...a),
      update: (...a: unknown[]) => configUpdate(...a),
      create: (...a: unknown[]) => configCreate(...a),
    },
    custoVideomaker: {
      findMany: (...a: unknown[]) => custoFindMany(...a),
      create: (...a: unknown[]) => custoCreate(...a),
      deleteMany: (...a: unknown[]) => custoDeleteMany(...a),
    },
  },
}))

const config = await import("@/app/api/config/empresa/route")
const custos = await import("@/app/api/custos-videomaker/route")
const custo = await import("@/app/api/custos-videomaker/[id]/route")

const ADMIN: Vinculo = { papel: "admin", permissoes: { verCustos: true, verAprovacoes: true, gerenciarConfig: true } }
const APROVADOR: Vinculo = { papel: "lider_audiovisual", permissoes: { verCustos: false, verAprovacoes: true, gerenciarConfig: false } }
const VIDEOMAKER: Vinculo = { papel: "videomaker", permissoes: { verCustos: false, verAprovacoes: false, gerenciarConfig: false } }

const LINHA = {
  razaoSocial: "Empresa A", cnpj: "00.000.000/0001-00", pixKey: "pix-a",
  googleDriveEmail: "drive@a.test", googleRefreshToken: "SEGREDO-DO-DRIVE",
}

const post = (body: unknown) =>
  ({ json: async () => body, url: "https://x/api" }) as unknown as Parameters<typeof config.POST>[0]
const get = (url: string) => ({ url }) as unknown as Parameters<typeof custos.GET>[0]
const params = { params: Promise.resolve({ id: "c1" }) }

beforeEach(() => {
  sessao = { user: { id: "u1" } }
  vinculo = null
  for (const f of [configFindFirst, configUpdate, configCreate, custoFindMany, custoCreate, custoDeleteMany, fiscais, diarias]) f.mockReset()
  custoFindMany.mockResolvedValue([{ id: "c1", videomakerId: "v1", valor: 500, pago: false, videomaker: { id: "v1", nome: "Ana" } }])
  fiscais.mockResolvedValue(new Map([["v1", { cpfCnpj: "123.456.789-00", chavePix: "pix-ana" }]]))
  diarias.mockResolvedValue(new Map([["v1", 400]]))
})

describe("configuração da empresa", () => {
  it("nunca devolve o refresh token do Drive, nem para o admin", async () => {
    vinculo = ADMIN
    configFindFirst.mockResolvedValue(LINHA)
    const corpo = await (await config.GET()).json()

    expect(JSON.stringify(corpo)).not.toContain("SEGREDO-DO-DRIVE")
    expect(corpo.empresa.driveConectado).toBe(true)
    expect(corpo.empresa.googleDriveEmail).toBe("drive@a.test")
  })

  it("quem não administra pede só os campos de nota fiscal", async () => {
    vinculo = VIDEOMAKER
    configFindFirst.mockResolvedValue({ razaoSocial: "Empresa A" })
    await config.GET()

    const { select } = configFindFirst.mock.calls[0][0]
    expect(select.googleRefreshToken).toBeUndefined()
    expect(select.googleDriveEmail).toBeUndefined()
    expect(select.cnpj).toBe(true)
  })

  it("lê a empresa de quem pede, não a empresa padrão", async () => {
    vinculo = ADMIN
    configFindFirst.mockResolvedValue(LINHA)
    await config.GET()
    expect(configFindFirst.mock.calls[0][0].where).toEqual({ organizacaoId: "org-a" })
  })

  it("sem sessão é 401 e sem vínculo é 403 — sem consultar a configuração", async () => {
    sessao = null
    expect((await config.GET()).status).toBe(401)
    sessao = { user: { id: "u1" } }
    vinculo = null
    expect((await config.GET()).status).toBe(403)
    expect(configFindFirst).not.toHaveBeenCalled()
  })

  it("salvar só a pasta do Drive não apaga CNPJ, PIX e endereço", async () => {
    vinculo = ADMIN
    configFindFirst.mockResolvedValueOnce({ id: "cfg1" }).mockResolvedValueOnce(LINHA)
    await config.POST(post({ googleDriveFolderId: "pasta-1" }))

    expect(configUpdate).toHaveBeenCalledWith({ where: { id: "cfg1" }, data: { googleDriveFolderId: "pasta-1" } })
  })

  it("a resposta do POST também sai sem o refresh token", async () => {
    vinculo = ADMIN
    configFindFirst.mockResolvedValueOnce({ id: "cfg1" }).mockResolvedValueOnce({ razaoSocial: "Empresa A" })
    await config.POST(post({ razaoSocial: "Empresa A" }))
    expect(configFindFirst.mock.calls[1][0].select.googleRefreshToken).toBeUndefined()
  })
})

describe("custos de videomaker", () => {
  it("videomaker e solicitante não listam custos", async () => {
    vinculo = VIDEOMAKER
    expect((await custos.GET(get("https://x/api/custos-videomaker"))).status).toBe(403)
    expect(custoFindMany).not.toHaveBeenCalled()
  })

  it("quem só aprova vê a lista sem CPF/CNPJ, PIX e diária", async () => {
    vinculo = APROVADOR
    const corpo = await (await custos.GET(get("https://x/api/custos-videomaker?statusPagamento=nf_enviada"))).json()

    expect(corpo.custos[0].videomaker).toMatchObject({ cpfCnpj: null, chavePix: null, valorDiaria: null })
    expect(fiscais).not.toHaveBeenCalled()
    expect(diarias).not.toHaveBeenCalled()
  })

  it("quem tem verCustos vê os dados para pagar", async () => {
    vinculo = ADMIN
    const corpo = await (await custos.GET(get("https://x/api/custos-videomaker"))).json()
    expect(corpo.custos[0].videomaker).toMatchObject({ cpfCnpj: "123.456.789-00", chavePix: "pix-ana", valorDiaria: 400 })
  })

  it("aprovador sem papel de gestão não cria, não altera e não apaga", async () => {
    vinculo = APROVADOR
    expect((await custos.POST(post({ videomakerId: "v1", valor: 1, dataReferencia: "2026-10-01" }))).status).toBe(403)
    expect((await custo.PATCH(post({ pago: true }), params)).status).toBe(403)
    expect((await custo.DELETE(post({}), params)).status).toBe(403)
    expect(custoCreate).not.toHaveBeenCalled()
    expect(custoDeleteMany).not.toHaveBeenCalled()
  })

  it("verCustos concedido a quem não é admin/gestor continua sem escrever", async () => {
    vinculo = { papel: "auxiliar_admin", permissoes: { verCustos: true, verAprovacoes: true } }
    expect((await custo.DELETE(post({}), params)).status).toBe(403)
  })

  it("admin apaga custo da própria empresa", async () => {
    vinculo = ADMIN
    custoDeleteMany.mockResolvedValue({ count: 1 })
    const res = await custo.DELETE(post({}), params)
    expect(res.status).toBe(200)
    expect(custoDeleteMany).toHaveBeenCalledWith({ where: { id: "c1", organizacaoId: "org-a" } })
  })
})
