import { describe, it, expect, vi, beforeEach } from "vitest"

// Módulo ligado/desligado por empresa é a base dos planos. Duas camadas, e a
// ORDEM entre elas é a regra que não pode inverter:
//
//   DISPONIVEL_NA_PLATAFORMA  o módulo existe como produto?
//   ModuloOrganizacao         este cliente comprou?
//
// A chave geral vence. Se um módulo não está pronto, nenhuma linha no banco
// deve fazê-lo aparecer — senão a plataforma promete o que não entrega, e o
// cliente descobre clicando.

const findMany = vi.fn()
vi.mock("@/lib/prisma", () => ({ prisma: { moduloOrganizacao: { findMany: (...a: unknown[]) => findMany(...a) } } }))

const { modulosDaOrganizacao, rotaBloqueadaParaOrg } = await import("@/lib/modulos-org")
const { PADRAO_MODULOS, DISPONIVEL_NA_PLATAFORMA, moduloDaRota, rotaIndisponivelNaPlataforma } =
  await import("@/lib/modulos")

beforeEach(() => { findMany.mockReset(); findMany.mockResolvedValue([]) })

describe("empresa sem nada decidido", () => {
  it("recebe o padrão do catálogo — sem precisar de INSERT nenhum", async () => {
    const m = await modulosDaOrganizacao("org-A")
    expect(m.growth).toBe(PADRAO_MODULOS.growth)
    expect(m.ideias).toBe(PADRAO_MODULOS.ideias)
  })

  it("sem organização, também cai no padrão — nunca em 'tudo liberado'", async () => {
    const m = await modulosDaOrganizacao(null)
    expect(m).toEqual(expect.objectContaining({ growth: PADRAO_MODULOS.growth }))
    expect(findMany).not.toHaveBeenCalled()
  })
})

describe("decisão por empresa", () => {
  it("desligar growth vale só para ela", async () => {
    findMany.mockResolvedValue([{ modulo: "growth", ativo: false }])
    expect((await modulosDaOrganizacao("org-A")).growth).toBe(false)
    expect(findMany).toHaveBeenCalledWith({
      where: { organizacaoId: "org-A" },
      select: { modulo: true, ativo: true },
    })
  })

  it("linha com módulo desconhecido é ignorada, não quebra a leitura", async () => {
    findMany.mockResolvedValue([{ modulo: "modulo_que_nao_existe", ativo: true }])
    const m = await modulosDaOrganizacao("org-A")
    expect(m.growth).toBe(PADRAO_MODULOS.growth)
    expect((m as Record<string, boolean>).modulo_que_nao_existe).toBeUndefined()
  })
})

describe("a chave geral vence a decisão comercial", () => {
  it("módulo indisponível na plataforma fica OFF mesmo com linha dizendo true", async () => {
    // Eventos está indisponível: o código existe, o produto não.
    expect(DISPONIVEL_NA_PLATAFORMA.eventos).toBe(false)
    findMany.mockResolvedValue([{ modulo: "eventos", ativo: true }])

    expect((await modulosDaOrganizacao("org-A")).eventos).toBe(false)
  })
})

describe("rotas", () => {
  it("reconhece a que módulo cada caminho pertence, e o que é de ninguém", () => {
    expect(moduloDaRota("/design")).toBe("growth")
    expect(moduloDaRota("/api/ideias/kpi")).toBe("ideias")
    expect(moduloDaRota("/dashboard")).toBeNull()
    // /api/whatsapp NÃO é do módulo mensagens: as notificações automáticas
    // dependem dele e sairiam do ar junto.
    expect(moduloDaRota("/api/whatsapp/webhook")).toBeNull()
  })

  it("o middleware bloqueia só o indisponível na plataforma", () => {
    expect(rotaIndisponivelNaPlataforma("/eventos")).toBe(true)
    expect(rotaIndisponivelNaPlataforma("/design")).toBe(false)   // por empresa, não aqui
    expect(rotaIndisponivelNaPlataforma("/dashboard")).toBe(false)
  })

  it("o bloqueio por empresa é do lado Node, e alcança o que o middleware não vê", async () => {
    findMany.mockResolvedValue([{ modulo: "growth", ativo: false }])
    expect(await rotaBloqueadaParaOrg("/design", "org-A")).toBe(true)
    // caminho que não é de módulo nenhum nunca bloqueia
    expect(await rotaBloqueadaParaOrg("/dashboard", "org-A")).toBe(false)
  })
})
