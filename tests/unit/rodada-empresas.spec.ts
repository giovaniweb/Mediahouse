import { describe, expect, it, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const depois = vi.hoisted(() => ({ fila: [] as (() => Promise<void>)[] }))
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (fn: () => Promise<void>) => { depois.fila.push(fn) },
}))
import { encadear, MAX_ELOS, percorrerEmpresas, urlDoProximoElo } from "@/lib/rodada-empresas"

// Os crons atendiam 10 e 20 empresas e devolviam um cursor que ninguém
// chamava (Onda 2A). A rodada agora percorre todas e se encadeia.

const empresas = Array.from({ length: 125 }, (_, i) => ({ id: `org-${String(i).padStart(3, "0")}` }))
const listar = async (cursor: string | null, n: number) => empresas.filter((e) => !cursor || e.id > cursor).slice(0, n)

beforeEach(() => { depois.fila = []; vi.unstubAllEnvs() })

describe("percorrerEmpresas", () => {
  it("atende todas as empresas, página por página, quando o tempo dá", async () => {
    const { resultados, proximoCursor } = await percorrerEmpresas({ listar, processar: async (o) => o.id, orcamentoMs: 1000, tamanhoPagina: 20 })
    expect(resultados).toHaveLength(125)
    expect(proximoCursor).toBeNull()
  })

  it("tempo acabou: para antes de começar outra empresa e devolve de onde seguir", async () => {
    let relogio = 0
    const r = await percorrerEmpresas({
      listar, orcamentoMs: 30, tamanhoPagina: 50, agora: () => relogio,
      processar: async (o) => { relogio += 10; return o.id },
    })
    // 0, 10, 20 e 30 ms começam; aos 40 ms já passou do orçamento.
    expect(r.resultados).toEqual(["org-000", "org-001", "org-002", "org-003"])
    expect(r.proximoCursor).toBe("org-003")
    // O próximo elo continua exatamente dali.
    const seguinte = await percorrerEmpresas({ listar, processar: async (o) => o.id, orcamentoMs: 1000, cursor: r.proximoCursor })
    expect(seguinte.resultados[0]).toBe("org-004")
    expect(seguinte.resultados).toHaveLength(121)
  })

  it("nenhuma empresa: nada a fazer", async () => {
    expect(await percorrerEmpresas({ listar: async () => [], processar: async () => 1, orcamentoMs: 10 })).toEqual({ resultados: [], proximoCursor: null })
  })
})

describe("encadear", () => {
  const req = (q = "") => new NextRequest(`https://nuflow.space/api/cron/agentes?agente=lembretes${q}`)

  it("agenda o próximo elo na mesma rota, com cursor, elo e o segredo só no cabeçalho", async () => {
    vi.stubEnv("CRON_SECRET", "segredo")
    const fetchFalso = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchFalso)
    expect(encadear(req(), "org-009")).toBe(true)
    await depois.fila[0]()
    const [url, opcoes] = fetchFalso.mock.calls[0]
    expect(String(url)).toBe("https://nuflow.space/api/cron/agentes?agente=lembretes&cursor=org-009&elo=1")
    expect(opcoes.headers.authorization).toBe("Bearer segredo")
    vi.unstubAllGlobals()
  })

  it("sem cursor (tudo atendido) ou sem segredo, não encadeia", () => {
    vi.stubEnv("CRON_SECRET", "segredo")
    expect(encadear(req(), null)).toBe(false)
    vi.stubEnv("CRON_SECRET", "")
    expect(encadear(req(), "org-1")).toBe(false)
    expect(depois.fila).toHaveLength(0)
  })

  it(`para no elo ${MAX_ELOS}: um erro não vira laço sem fim`, () => {
    expect(urlDoProximoElo(req(`&elo=${MAX_ELOS - 1}`), "x")?.searchParams.get("elo")).toBe(String(MAX_ELOS))
    expect(urlDoProximoElo(req(`&elo=${MAX_ELOS}`), "x")).toBeNull()
    expect(urlDoProximoElo(req("&elo=abc"), "x")?.searchParams.get("elo")).toBe("1")
  })
})
