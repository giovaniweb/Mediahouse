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

// A regressão que motivou tudo isto: o módulo "eventos" estava desligado desde
// agosto e a descrição dele já dizia "Coberturas" — mas /coberturas não estava
// na lista de rotas. A página seguiu no ar, no menu, em produção, enquanto
// /eventos sumia. Um módulo desligado pela metade é pior que um módulo ligado:
// ninguém mantém o que acha que não existe.
describe("coberturas pertence a eventos — a rota que tinha escapado", () => {
  it("página e API de cobertura são do módulo eventos", () => {
    expect(moduloDaRota("/coberturas")).toBe("eventos")
    expect(moduloDaRota("/coberturas/abc123")).toBe("eventos")
    expect(moduloDaRota("/api/coberturas")).toBe("eventos")
    expect(moduloDaRota("/api/coberturas/abc123/checklist")).toBe("eventos")
  })

  it("o portal de campo cai junto: é uma casca de coberturas", () => {
    expect(moduloDaRota("/campo")).toBe("eventos")
    expect(moduloDaRota("/api/campo/agenda")).toBe("eventos")
  })

  it("com eventos indisponível, o middleware barra as duas", () => {
    expect(rotaIndisponivelNaPlataforma("/coberturas")).toBe(true)
    expect(rotaIndisponivelNaPlataforma("/campo")).toBe(true)
  })

  it("o link público de cobertura NÃO é bloqueado — já está na mão do cliente", () => {
    // Desligar um módulo esconde a operação interna. O que já foi enviado para
    // fora continua abrindo, senão a poda quebra entrega de terceiro.
    expect(moduloDaRota("/api/publico/cobertura/evento-x")).toBeNull()
    expect(rotaIndisponivelNaPlataforma("/api/publico/cobertura/evento-x")).toBe(false)
    expect(rotaIndisponivelNaPlataforma("/api/publico/cobertura/evento-x/zip")).toBe(false)
  })
})

describe("banco de ideias sai do piloto", () => {
  it("está indisponível na plataforma, e nem uma linha ativa reabre", async () => {
    expect(DISPONIVEL_NA_PLATAFORMA.ideias).toBe(false)
    findMany.mockResolvedValue([{ modulo: "ideias", ativo: true }])
    expect((await modulosDaOrganizacao("org-A")).ideias).toBe(false)
  })

  it("empresa nova não nasce com ele", () => {
    expect(PADRAO_MODULOS.ideias).toBe(false)
  })
})
