import { describe, it, expect, vi, beforeEach } from "vitest"
import type { StatusInterno } from "@prisma/client"

// Espelhamento cross-tenant: a empresa B executa um job da empresa A sem que o
// card mude de dono.
//
// O que estes testes prendem é a FRONTEIRA. O banco já prova o isolamento das
// linhas (scripts/verificar-rls.mjs, provas 9 a 17); aqui o assunto é a decisão
// que a RLS não toma: quais transições pertencem a quem executa e quais
// pertencem a quem responde ao cliente final.

const findUniqueDemanda = vi.fn()
const findFirstAresta = vi.fn()
const getOrgId = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    demanda: { findUnique: (...a: unknown[]) => findUniqueDemanda(...a) },
    demandaCompartilhamento: { findFirst: (...a: unknown[]) => findFirstAresta(...a) },
  },
}))
vi.mock("@/lib/org", () => ({
  getOrgId: (...a: unknown[]) => getOrgId(...a),
  semOrg: () => new Response(null, { status: 403 }),
}))

const {
  escopoComEspelho,
  espelhoDoCard,
  requireDemandaAcesso,
} = await import("@/lib/compartilhamento")
const { podeTransicionar, STATUS_PERMITIDOS_AO_ESPELHO } = await import("@/lib/job-transicoes")
const { permissaoEfetiva } = await import("@/lib/permissoes")
const { StatusInterno: ENUM_STATUS } = await import("@prisma/client")

beforeEach(() => {
  findUniqueDemanda.mockReset()
  findFirstAresta.mockReset()
  getOrgId.mockReset()
  getOrgId.mockResolvedValue("org-b")
})

// ─────────────────────────────────────────────────────────────────────────────
describe("escopoComEspelho — o que entra no quadro", () => {
  it("soma o que é da empresa com o que ela executa por espelhamento", () => {
    expect(escopoComEspelho("org-b")).toEqual({
      OR: [
        { organizacaoId: "org-b" },
        { compartilhamentos: { some: { organizacaoDestinoId: "org-b", revogadoEm: null } } },
      ],
    })
  })

  it("aresta revogada não entra — o filtro exige revogadoEm nulo", () => {
    const f = escopoComEspelho("org-b") as { OR: Array<Record<string, never>> }
    expect(JSON.stringify(f)).toContain('"revogadoEm":null')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("espelhoDoCard — o chip de cada lado", () => {
  const aresta = {
    organizacaoOrigemId: "org-a",
    organizacaoDestinoId: "org-b",
    nomeOrigem: "Contourline",
    nomeDestino: "Produtora Parceira",
    escopo: "executar" as const,
    revogadoEm: null,
  }

  it("sem aresta, sem chip", () => {
    expect(espelhoDoCard([], "org-a")).toBeNull()
    expect(espelhoDoCard(undefined, "org-a")).toBeNull()
  })

  it("a dona vê para quem terceirizou", () => {
    expect(espelhoDoCard([aresta], "org-a")).toEqual({
      papel: "origem", contraparte: "Produtora Parceira", escopo: "executar",
    })
  })

  it("quem executa vê de quem é o card", () => {
    expect(espelhoDoCard([aresta], "org-b")).toEqual({
      papel: "destino", contraparte: "Contourline", escopo: "executar",
    })
  })

  it("aresta revogada não desenha chip em lado nenhum", () => {
    const morta = { ...aresta, revogadoEm: new Date() }
    expect(espelhoDoCard([morta], "org-a")).toBeNull()
    expect(espelhoDoCard([morta], "org-b")).toBeNull()
  })

  it("uma empresa de fora da aresta não vê chip nenhum", () => {
    expect(espelhoDoCard([aresta], "org-c")).toBeNull()
  })

  it("usa os rótulos congelados, nunca uma relação que atravessa empresa", () => {
    // Se um dia alguém trocar `nomeOrigem` por `origem.nome`, este teste
    // continua passando — mas o payload passaria a carregar a linha inteira da
    // outra empresa. O guarda de verdade é a política `organizacoes_a_propria`;
    // isto aqui é o lembrete escrito.
    expect(espelhoDoCard([aresta], "org-b")?.contraparte).toBe(aresta.nomeOrigem)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("requireDemandaAcesso — quem entra por qual porta", () => {
  it("a dona entra como dona, sem consultar aresta nenhuma", async () => {
    getOrgId.mockResolvedValue("org-a")
    findUniqueDemanda.mockResolvedValue({ organizacaoId: "org-a" })
    const r = await requireDemandaAcesso(null, "dem-1", "executar")
    expect(r).toMatchObject({ papel: "dona", donaId: "org-a", escopo: null })
    expect(findFirstAresta).not.toHaveBeenCalled()
  })

  it("demanda de outra empresa SEM aresta responde 404, não 403", async () => {
    findUniqueDemanda.mockResolvedValue({ organizacaoId: "org-a" })
    findFirstAresta.mockResolvedValue(null)
    const r = await requireDemandaAcesso(null, "dem-1", "acompanhar")
    // 403 confirmaria que o id existe — é a diferença entre "não é seu" e
    // "não existe", e é ela que fecha o IDOR.
    expect((r as Response).status).toBe(404)
  })

  it("com aresta de execução, entra como espelho e sabe de quem é o card", async () => {
    findUniqueDemanda.mockResolvedValue({ organizacaoId: "org-a" })
    findFirstAresta.mockResolvedValue({
      escopo: "executar", organizacaoOrigemId: "org-a", nomeOrigem: "Contourline",
    })
    const r = await requireDemandaAcesso(null, "dem-1", "executar")
    expect(r).toMatchObject({
      papel: "espelho", donaId: "org-a", escopo: "executar", nomeContraparte: "Contourline",
    })
  })

  it("quem só acompanha recebe 403 ao tentar executar — 404 ali seria mentira", async () => {
    findUniqueDemanda.mockResolvedValue({ organizacaoId: "org-a" })
    findFirstAresta.mockResolvedValue({
      escopo: "acompanhar", organizacaoOrigemId: "org-a", nomeOrigem: "Contourline",
    })
    const r = await requireDemandaAcesso(null, "dem-1", "executar")
    // Ela JÁ enxerga o card. Dizer "não existe" produziria um chamado de
    // suporte por design.
    expect((r as Response).status).toBe(403)
  })

  it("quem só acompanha continua acompanhando", async () => {
    findUniqueDemanda.mockResolvedValue({ organizacaoId: "org-a" })
    findFirstAresta.mockResolvedValue({
      escopo: "acompanhar", organizacaoOrigemId: "org-a", nomeOrigem: "Contourline",
    })
    const r = await requireDemandaAcesso(null, "dem-1", "acompanhar")
    expect(r).toMatchObject({ papel: "espelho", escopo: "acompanhar" })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("a guarda de transição conhece o lado da mesa", () => {
  const JOB = {
    videomakerId: "vm-1", editorId: "ed-1",
    linkBrutos: "https://drive/brutos", linkFolderBrutos: null,
    linkFinal: "https://drive/final.mp4", motivoImpedimento: "travado",
  }
  const admin = (origem: "dona" | "espelho") => ({
    id: "u-1", papel: "admin", videomakerId: null, origem,
    permissoes: permissaoEfetiva({
      membro: { papel: "admin", organizacaoId: "org-x", statusUsuario: "ativo" },
      organizacaoId: "org-x",
    }),
  })
  const guardar = (novoStatus: string, origem: "dona" | "espelho", statusAtual: StatusInterno = "pedido_criado") =>
    podeTransicionar({ statusAtual, novoStatus, usuario: admin(origem), demanda: JOB })

  it("o admin da produtora terceirizada NÃO entrega ao cliente", () => {
    const r = guardar("entregue_cliente", "espelho")
    expect(r.ok).toBe(false)
    expect(r.codigo).toBe("fora_do_espelho")
  })

  it("nem aprova, nem posta, nem encerra — é o contrato da origem", () => {
    for (const proibido of ["aprovado", "postado", "postagem_pendente", "encerrado", "expirado"]) {
      expect(guardar(proibido, "espelho").codigo, proibido).toBe("fora_do_espelho")
    }
  })

  it("mas executa: capta, edita e devolve o material", () => {
    for (const permitido of ["captacao_realizada", "brutos_enviados", "editando", "edicao_finalizada"]) {
      expect(guardar(permitido, "espelho").ok, permitido).toBe(true)
    }
  })

  it("a dona continua fazendo tudo o que fazia — nada regrediu", () => {
    for (const alvo of ["aprovado", "entregue_cliente", "postado", "editando"]) {
      expect(guardar(alvo, "dona").ok, alvo).toBe(true)
    }
  })

  // A trava de exaustividade, no mesmo espírito de job-fase.spec.ts: status novo
  // no enum nasce PROIBIDO para o espelho, e é este teste que obriga a decisão a
  // ser tomada em vez de herdada por descuido.
  it("todo StatusInterno é decidido: dentro da lista passa, fora recusa", () => {
    const foraDaLista: string[] = []
    const dentroRecusado: string[] = []
    for (const s of Object.values(ENUM_STATUS) as StatusInterno[]) {
      if (s === "pedido_criado") continue // seria no-op, e no-op não é decisão
      const r = guardar(s, "espelho")
      const naLista = STATUS_PERMITIDOS_AO_ESPELHO.includes(s)
      if (!naLista && r.codigo !== "fora_do_espelho") foraDaLista.push(s)
      if (naLista && !r.ok) dentroRecusado.push(`${s}:${r.codigo}`)
    }
    expect(foraDaLista, "status fora da lista que o espelho conseguiu executar").toEqual([])
    expect(dentroRecusado, "status da lista que a guarda recusou").toEqual([])
  })

  it("o bypass de gestão não atravessa a fronteira entre empresas", () => {
    // Mesmo ator, mesma permissão de admin. A única diferença é de quem é o card.
    expect(guardar("aprovado", "dona").ok).toBe(true)
    expect(guardar("aprovado", "espelho").ok).toBe(false)
  })
})
