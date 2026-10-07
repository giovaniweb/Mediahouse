import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { contratoEfetivo, quadroDoCard } from "@/lib/quadro-do-card"
import { whereDoQuadro } from "@/lib/quadro-do-card-server"

// A consulta que os quadros usam (whereDoQuadro) e a regra pura (quadroDoCard)
// têm de concordar card a card, e Jobs e Demandas têm de ser complementares:
// nenhum card fora dos dois, nenhum nos dois. Banco real, dados sintéticos.
const p = `quadro-${randomUUID().slice(0, 8)}`, org = `${p}-org`, outra = `${p}-outra`, usuario = `${p}-u`
const vm = {
  externo: `${p}-vm-ext`,        // vínculo externo nesta empresa
  interno: `${p}-vm-int`,        // vínculo interno nesta empresa
  globalInterno: `${p}-vm-gint`, // sem vínculo aqui; cadastro global interno
  globalExterno: `${p}-vm-gext`, // sem vínculo aqui; cadastro global padrão (externo)
  internoNaOutra: `${p}-vm-out`, // interno noutra empresa, externo nesta
}

const combinacoes: { tipoVideo: string; departamento: string; videomakerId: string | null }[] = []
for (const marca of [
  { tipoVideo: "cobertura_evento", departamento: "eventos" },
  { tipoVideo: "cobertura_evento", departamento: "audiovisual" },
  { tipoVideo: "reels", departamento: "eventos" }, // o furo: só o departamento
  { tipoVideo: "reels", departamento: "audiovisual" },
]) {
  for (const videomakerId of [null, ...Object.values(vm)]) combinacoes.push({ ...marca, videomakerId })
}

beforeAll(async () => {
  await db.organizacao.create({ data: { id: org, nome: org, slug: org } })
  await db.organizacao.create({ data: { id: outra, nome: outra, slug: outra } })
  await db.usuario.create({ data: { id: usuario, nome: usuario, tipo: "admin", senhaHash: "sem-login" } })
  const base = { redesSociais: [], areasAtuacao: [], habilidades: [], equipamentos: [] }
  await db.videomaker.create({ data: { id: vm.externo, nome: "Ext", ...base, tipoContrato: "interno" } })
  await db.videomaker.create({ data: { id: vm.interno, nome: "Int", ...base } })
  await db.videomaker.create({ data: { id: vm.globalInterno, nome: "GInt", ...base, tipoContrato: "interno" } })
  await db.videomaker.create({ data: { id: vm.globalExterno, nome: "GExt", ...base } })
  await db.videomaker.create({ data: { id: vm.internoNaOutra, nome: "Out", ...base } })
  await db.videomakerOrganizacao.createMany({ data: [
    // O vínculo da empresa vence o cadastro global (que diz interno).
    { videomakerId: vm.externo, organizacaoId: org, tipoContrato: "externo" },
    { videomakerId: vm.interno, organizacaoId: org, tipoContrato: "interno" },
    { videomakerId: vm.internoNaOutra, organizacaoId: org, tipoContrato: "externo" },
    { videomakerId: vm.internoNaOutra, organizacaoId: outra, tipoContrato: "interno" },
  ] })
  await db.demanda.createMany({ data: combinacoes.map((c, i) => ({
    ...c, organizacaoId: org, codigo: `${p}-${i}`, titulo: `Card ${i}`, descricao: "Teste", cidade: "Teste",
    area: "audiovisual" as const, solicitanteId: usuario, statusInterno: "planejamento" as const, statusVisivel: "producao" as const,
  })) })
})

afterAll(async () => {
  await db.demanda.deleteMany({ where: { organizacaoId: org } })
  await db.organizacao.deleteMany({ where: { id: { in: [org, outra] } } })
  await db.videomaker.deleteMany({ where: { id: { in: Object.values(vm) } } })
  await db.usuario.deleteMany({ where: { id: usuario } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})

describe("em que quadro o card mora", () => {
  it("a consulta e a regra pura concordam, e os dois quadros são complementares", async () => {
    const cards = await db.demanda.findMany({
      where: { organizacaoId: org },
      select: {
        id: true, tipoVideo: true, departamento: true, videomakerId: true,
        videomaker: { select: { tipoContrato: true, vinculos: { where: { organizacaoId: org }, select: { tipoContrato: true } } } },
      },
    })
    expect(cards).toHaveLength(combinacoes.length)
    const ids = async (quadro: "jobs" | "demandas") => new Set((await db.demanda.findMany({
      where: { AND: [{ organizacaoId: org }, whereDoQuadro(quadro, org)] }, select: { id: true },
    })).map((d) => d.id))
    const jobs = await ids("jobs"), demandas = await ids("demandas")

    for (const c of cards) {
      const contratoVideomaker = c.videomaker ? contratoEfetivo(c.videomaker.vinculos[0]?.tipoContrato, c.videomaker.tipoContrato) : null
      const esperado = quadroDoCard({ ...c, contratoVideomaker })
      const rotulo = `${c.tipoVideo}/${c.departamento}/${c.videomakerId ?? "sem vm"}`
      expect(jobs.has(c.id) ? "jobs" : demandas.has(c.id) ? "demandas" : "nenhum", rotulo).toBe(esperado)
      expect(jobs.has(c.id) && demandas.has(c.id), `${rotulo} nos dois quadros`).toBe(false)
    }
  })

  it("o furo fechado: marcado só pelo departamento e sem videomaker vai para Jobs", async () => {
    const furo = await db.demanda.findFirstOrThrow({ where: { organizacaoId: org, tipoVideo: "reels", departamento: "eventos", videomakerId: null } })
    expect(await db.demanda.count({ where: { AND: [{ id: furo.id }, whereDoQuadro("jobs", org)] } })).toBe(1)
  })

  it("videomaker interno tira a cobertura de Jobs; externo leva qualquer card para Jobs", async () => {
    const onde = async (tipoVideo: string, videomakerId: string) => {
      const d = await db.demanda.findFirstOrThrow({ where: { organizacaoId: org, tipoVideo, departamento: "audiovisual", videomakerId } })
      return (await db.demanda.count({ where: { AND: [{ id: d.id }, whereDoQuadro("jobs", org)] } })) ? "jobs" : "demandas"
    }
    expect(await onde("cobertura_evento", vm.interno)).toBe("demandas")
    expect(await onde("cobertura_evento", vm.globalInterno)).toBe("demandas")
    expect(await onde("reels", vm.externo)).toBe("jobs")
    expect(await onde("reels", vm.globalExterno)).toBe("jobs")
    // O contrato é o desta empresa, não o de outra.
    expect(await onde("reels", vm.internoNaOutra)).toBe("jobs")
  })
})
