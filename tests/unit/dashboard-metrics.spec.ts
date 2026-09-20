import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"
const mocks = vi.hoisted(() => ({ auth:vi.fn(), org:vi.fn(), count:vi.fn(), demands:vi.fn(), alerts:vi.fn(), editors:vi.fn(), files:vi.fn(), links:vi.fn() }))
vi.mock("@/lib/auth", () => ({ auth:mocks.auth }))
vi.mock("@/lib/org", () => ({ getOrgId:mocks.org, semOrg:() => NextResponse.json({}, {status:403}) }))
vi.mock("@/lib/editor-vinculo", () => ({ vinculosDaEmpresa:mocks.links }))
vi.mock("@/lib/prisma", () => ({ prisma:{demanda:{count:mocks.count,findMany:mocks.demands},alertaIA:{findMany:mocks.alerts},editor:{findMany:mocks.editors},arquivo:{groupBy:mocks.files}} }))
import { GET } from "@/app/api/dashboard/metrics/route"
beforeEach(() => {
 vi.resetAllMocks()
 mocks.auth.mockResolvedValue({user:{id:"u"}})
 mocks.org.mockResolvedValue("empresa-a")
 mocks.count.mockResolvedValue(0)
 mocks.demands.mockResolvedValue([])
 mocks.alerts.mockResolvedValue([])
 mocks.files.mockResolvedValue([])
 mocks.links.mockResolvedValue(new Map([["editor",{cargaLimite:5}]]))
 // A same editor works for two companies. Simulate relational filtering.
 mocks.editors.mockImplementation(async query => [{id:"editor",nome:"Editor",demandas:[
  {organizacaoId:"empresa-a",pesoDemanda:2},
  {organizacaoId:"empresa-b",pesoDemanda:8},
 ].filter(d => !query.include.demandas.where.organizacaoId || d.organizacaoId===query.include.demandas.where.organizacaoId)}])
})
describe("dashboard: escopo e unidade dos indicadores", () => {
 it("não consulta sem sessão", async () => {
  mocks.auth.mockResolvedValue(null)
  expect((await GET()).status).toBe(401)
  expect(mocks.editors).not.toHaveBeenCalled()
 })
 it("não consulta sem empresa", async () => {
  mocks.org.mockResolvedValue(null)
  expect((await GET()).status).toBe(403)
  expect(mocks.count).not.toHaveBeenCalled()
 })
 it("carga e alerta não incluem trabalho do mesmo editor em outra empresa", async () => {
  const data=await (await GET()).json()
  expect(data.cargaEditores).toEqual([{id:"editor",nome:"Editor",cargaAtual:1,cargaLimite:5,status:"ok"}])
  expect(mocks.links).toHaveBeenCalledWith(["editor"],"empresa-a")
 })
 it("entregas mensais contam arquivos finais e fallback de link, não demandas", async () => {
  mocks.demands.mockResolvedValue([{id:"d1",linkFinal:"https://example.test/1"},{id:"d2",linkFinal:"https://example.test/2"},{id:"d3",linkFinal:null}])
  mocks.files.mockResolvedValue([{demandaId:"d1",_count:{id:3}}])
  const data=await (await GET()).json()
  expect(data.metricas.concluidasMes).toBe(4)
 })
})
