import { beforeEach, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

// Reclamação do Gabriel Landin (13/11/2026): "aparece a demanda com o
// descritivo, aí quando aceita, o descritivo some". Depois do aceite, o GET do
// link continua devolvendo tudo o que a página mostra antes: briefing, cidade,
// local, data, pagamento e o kit — junto com a parte da entrega.
const m = vi.hoisted(() => ({ credencial: vi.fn(), convite: vi.fn(), materiais: vi.fn(), nota: vi.fn(), entrega: vi.fn() }))
vi.mock("@/lib/prisma", () => ({ prisma: {
  conviteVideomaker: { findUnique: m.convite },
  materialVideomaker: { findMany: m.materiais },
  notaFiscalUpload: { findFirst: m.nota },
} }))
vi.mock("@/lib/org-por-credencial", () => ({ orgPorCredencial: m.credencial }))
vi.mock("@/lib/entrega-da-gravacao", () => ({ conviteDaEntrega: m.entrega }))
import { GET } from "@/app/api/convites/[token]/route"

const params = { params: Promise.resolve({ token: "token-sintetico" }) }
const consultar = () => GET(new NextRequest("http://localhost/api/convites/token-sintetico"), params)
const convite = (status: string) => ({
  id: "c1", status, versao: 1, videomakerId: "vm", expiresAt: new Date(Date.now() - 86400_000),
  tarifaDiaria: "650.00", condicoes: "Nota fiscal após entrega dos brutos; pagamento em até 15 dias.",
  videomaker: { id: "vm", nome: "Gabriel Landin" },
  demanda: {
    id: "d1", codigo: "VOP-26-3001", titulo: "Treinamento Clínica Aurora", descricao: "Gravar o treinamento do laser com a equipe da clínica.",
    tipoVideo: "Gravação externa", cidade: "Campinas", localGravacao: "Rua das Flores, 10", localEvento: null,
    dataCaptacao: new Date("2026-11-20T17:00:00.000Z"), dataEvento: null, prioridade: "normal",
    clienteFinalNome: "Clínica Aurora", tipoGravacao: "entrega_equipamento", temBrinde: false, brinde: null, levar: "tripé",
    edicaoPor: "equipe", linkBrutos: null, linkFinal: null, statusInterno: "videomaker_aceitou",
  },
})

beforeEach(() => {
  vi.resetAllMocks()
  m.credencial.mockResolvedValue("empresa-a")
  m.materiais.mockResolvedValue([{ id: "g1", titulo: "Guia de captação", tipo: "guia", url: "/api/midia/guia.pdf", texto: null, tipoGravacao: null, ordem: 1 }])
  m.nota.mockResolvedValue(null)
})

it("aceito: devolve o descritivo inteiro, o pagamento e o kit, junto com a entrega (mesmo com o prazo de resposta vencido)", async () => {
  m.convite.mockResolvedValue(convite("aceito"))
  m.entrega.mockResolvedValue({ liberado: true })
  const r = await consultar()
  expect(r.status).toBe(200)
  expect(r.headers.get("cache-control")).toContain("no-store")
  const body = await r.json()
  expect(body.status).toBe("aceito")
  expect(body.entrega).toEqual({ liberada: true, nota: null })
  expect(body.demanda).toMatchObject({
    titulo: "Treinamento Clínica Aurora", descricao: "Gravar o treinamento do laser com a equipe da clínica.",
    cidade: "Campinas", localGravacao: "Rua das Flores, 10", dataCaptacao: "2026-11-20T17:00:00.000Z",
    tipoVideo: "Gravação externa", levar: "tripé", edicaoPor: "equipe",
  })
  expect(body).toMatchObject({ tarifaDiaria: "650.00", condicoes: expect.stringContaining("Nota fiscal") })
  expect(body.kit.materiais).toEqual([{ id: "g1", titulo: "Guia de captação", tipo: "guia", url: expect.any(String) }])
})

it("pendente: a mesma ficha, sem a parte da entrega", async () => {
  m.convite.mockResolvedValue({ ...convite("pendente"), expiresAt: new Date(Date.now() + 86400_000), demanda: { ...convite("pendente").demanda, statusInterno: "videomaker_notificado" } })
  m.entrega.mockResolvedValue({ liberado: false })
  const body = await (await consultar()).json()
  expect(body.entrega).toBeUndefined()
  expect(body.demanda.descricao).toContain("treinamento do laser")
  expect(body.tarifaDiaria).toBe("650.00")
})

it("recusado ou substituído: não reabre o descritivo para quem não vai fazer o job", async () => {
  for (const status of ["recusado", "substituido"]) {
    m.convite.mockResolvedValue(convite(status))
    m.entrega.mockResolvedValue({ liberado: false })
    const r = await consultar()
    expect(r.status).toBe(400)
    const body = await r.json()
    expect(body).toEqual({ error: "Convite já foi respondido", status })
  }
})
