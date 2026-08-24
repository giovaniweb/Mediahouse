import { describe, it, expect, vi, beforeEach } from "vitest"

// Estes dois dados — diária e bloqueio — são de UMA empresa, e viviam sendo lidos
// do perfil global do videomaker, que é da rede inteira. Deu dois bugs em produção:
//
//   1. O custo criado ao finalizar demanda usava a diária global. Quem tinha valor
//      diferente no vínculo teve custo lançado errado; quem tinha o global vazio
//      teve custo lançado como R$ 0, calado.
//   2. `emListaNegra` do perfil global tinha ZERO registros, então bloquear um
//      profissional não o tirava da tela de equipe nem da triagem da IA. E se
//      alguém marcasse ali, ele sumiria para TODAS as empresas.
//
// O que estes testes travam é a CONSULTA, não o retorno: se alguém voltar a
// perguntar ao perfil global, o mock do vínculo não é chamado e o teste cai.
// Teste de função pura não pegaria isso — é a query que estava errada.

const findUnique = vi.fn()
const findMany = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    videomakerOrganizacao: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      findMany: (...a: unknown[]) => findMany(...a),
    },
    // Se o código voltar a consultar o perfil global, explode com nome claro em
    // vez de devolver `undefined` e passar batido.
    videomaker: new Proxy({}, {
      get: (_t, prop) => () => {
        throw new Error(`prisma.videomaker.${String(prop)} não pode ser usado para diária/lista negra — leia do vínculo`)
      },
    }),
  },
}))

const { diariaDaEmpresa, bloqueadosDaEmpresa } = await import("@/lib/videomaker-vinculo")

beforeEach(() => {
  findUnique.mockReset()
  findMany.mockReset()
})

describe("diariaDaEmpresa", () => {
  it("consulta o vínculo da empresa que pergunta, não o perfil global", async () => {
    findUnique.mockResolvedValue({ valorDiaria: 800 })
    const r = await diariaDaEmpresa("vm-1", "org-A")

    expect(r).toBe(800)
    expect(findUnique).toHaveBeenCalledWith({
      where: { organizacaoId_videomakerId: { organizacaoId: "org-A", videomakerId: "vm-1" } },
      select: { valorDiaria: true },
    })
  })

  it("devolve null — não zero — quando não há vínculo", async () => {
    // A diferença importa: `null` faz o chamador avisar que falta combinar valor.
    // Se virasse 0, o custo entraria zerado em silêncio, que é o bug original.
    findUnique.mockResolvedValue(null)
    expect(await diariaDaEmpresa("vm-1", "org-A")).toBeNull()
  })

  it("devolve null quando o vínculo existe mas não tem valor combinado", async () => {
    findUnique.mockResolvedValue({ valorDiaria: null })
    expect(await diariaDaEmpresa("vm-1", "org-A")).toBeNull()
  })

  it("preserva diária zero de propósito, sem confundir com ausência", async () => {
    findUnique.mockResolvedValue({ valorDiaria: 0 })
    expect(await diariaDaEmpresa("vm-1", "org-A")).toBe(0)
  })

  it("empresas diferentes recebem a diária que cada uma negociou", async () => {
    findUnique.mockImplementation(({ where }: { where: { organizacaoId_videomakerId: { organizacaoId: string } } }) =>
      Promise.resolve({ valorDiaria: where.organizacaoId_videomakerId.organizacaoId === "org-A" ? 800 : 1200 })
    )
    expect(await diariaDaEmpresa("vm-1", "org-A")).toBe(800)
    expect(await diariaDaEmpresa("vm-1", "org-B")).toBe(1200)
  })
})

describe("bloqueadosDaEmpresa", () => {
  it("pergunta só pelos bloqueios da organização que consulta", async () => {
    findMany.mockResolvedValue([{ videomakerId: "vm-1" }, { videomakerId: "vm-9" }])
    const r = await bloqueadosDaEmpresa("org-A")

    expect(r).toEqual(["vm-1", "vm-9"])
    expect(findMany).toHaveBeenCalledWith({
      where: { organizacaoId: "org-A", emListaNegra: true },
      select: { videomakerId: true },
    })
  })

  it("bloqueio de uma empresa não alcança a outra", async () => {
    // A regra de negócio inteira em um teste: se a Contourline barra alguém,
    // ele continua disponível para as demais.
    findMany.mockImplementation(({ where }: { where: { organizacaoId: string } }) =>
      Promise.resolve(where.organizacaoId === "org-A" ? [{ videomakerId: "vm-1" }] : [])
    )
    expect(await bloqueadosDaEmpresa("org-A")).toEqual(["vm-1"])
    expect(await bloqueadosDaEmpresa("org-B")).toEqual([])
  })

  it("empresa sem ninguém bloqueado devolve lista vazia", async () => {
    // Quem chama usa isso para NÃO montar filtro: `notIn: []` é pegadinha conhecida
    // do Prisma e a lista vazia precisa significar "não filtre nada".
    findMany.mockResolvedValue([])
    expect(await bloqueadosDaEmpresa("org-A")).toEqual([])
  })
})
