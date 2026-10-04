import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { prismaBase as db } from "@/lib/prisma"
import { gargalosPorEtapa } from "@/lib/gargalos"

const p = `garg-${randomUUID()}`, a = `${p}-a`, b = `${p}-b`, u = `${p}-u`
const agora = new Date("2026-09-30T12:00:00Z")

async function demanda(id: string, org: string, statusVisivel: "entrada" | "producao", statusInterno: "aguardando_triagem" | "planejamento", criada: string) {
  await db.demanda.create({ data: {
    id, organizacaoId: org, area: "audiovisual", codigo: id, titulo: id, descricao: "Fixture", departamento: "teste",
    tipoVideo: "reels", cidade: "Teste", solicitanteId: u, statusVisivel, statusInterno, createdAt: new Date(criada),
  } })
}

beforeAll(async () => {
  await db.organizacao.createMany({ data: [a, b].map((id) => ({ id, nome: id, slug: id })) })
  await db.usuario.create({ data: { id: u, nome: u, tipo: "admin", senhaHash: "teste" } })
  await demanda(`${p}-entrada`, a, "entrada", "aguardando_triagem", "2026-09-20T12:00:00Z")
  await demanda(`${p}-producao`, a, "producao", "planejamento", "2026-09-10T12:00:00Z")
  await demanda(`${p}-outra`, b, "producao", "planejamento", "2026-08-01T12:00:00Z")
  await db.historicoStatus.createMany({ data: [
    { demandaId: `${p}-producao`, statusAnterior: "aguardando_triagem", statusNovo: "planejamento", createdAt: new Date("2026-09-25T12:00:00Z") },
    // Evento que não é status: não pode virar "entrada na etapa".
    { demandaId: `${p}-producao`, statusAnterior: null, statusNovo: "responsavel_alterado", createdAt: new Date("2026-09-29T12:00:00Z") },
    { demandaId: `${p}-outra`, statusAnterior: "aguardando_triagem", statusNovo: "planejamento", createdAt: new Date("2026-09-01T12:00:00Z") },
  ] })
})

afterAll(async () => {
  await db.organizacao.deleteMany({ where: { id: { in: [a, b] } } })
  await db.usuario.delete({ where: { id: u } })
})

describe("gargalosPorEtapa", () => {
  it("conta a espera desde a entrada na etapa, só da própria empresa", async () => {
    const g = await gargalosPorEtapa(a, agora)
    expect(g.find((x) => x.etapa === "entrada")).toMatchObject({ demandas: 1, diasMedios: 10, semHistorico: 0 })
    expect(g.find((x) => x.etapa === "producao")).toMatchObject({ demandas: 1, diasMedios: 5, maisAntiga: { codigo: `${p}-producao`, dias: 5 } })
    expect(g.filter((x) => !["entrada", "producao"].includes(x.etapa)).every((x) => x.demandas === 0)).toBe(true)

    const outra = await gargalosPorEtapa(b, agora)
    expect(outra.find((x) => x.etapa === "producao")).toMatchObject({ demandas: 1, diasMedios: 29 })
  })
})
