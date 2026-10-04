import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest, NextResponse } from "next/server"
const mocks = vi.hoisted(() => ({ auth: vi.fn(), guard: vi.fn(), permissions: vi.fn(), update: vi.fn() }))
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }))
vi.mock("@/lib/org", () => ({ requireDemandaOrg: mocks.guard }))
vi.mock("@/lib/permissoes-server", () => ({ permissoesEfetivas: mocks.permissions }))
vi.mock("@/lib/prisma", () => ({ prisma: { demanda: { update: mocks.update } } }))
import { PATCH } from "@/app/api/demandas/[id]/posicao/route"
const invoke = (body: string) => PATCH(new NextRequest("http://localhost/api/demandas/d/posicao", { method: "PATCH", body }), { params: Promise.resolve({ id: "d" }) })
beforeEach(() => {
 vi.resetAllMocks()
 mocks.auth.mockResolvedValue({ user: { id: "u", tipo: "admin" } })
 mocks.guard.mockResolvedValue({ organizacaoId: "org" })
 mocks.permissions.mockResolvedValue({ papel: "editor", permissoes: { moverKanban: true } })
 mocks.update.mockResolvedValue({})
})
describe("autorização e validação da posição", () => {
 it("recusa sessão ausente", async () => {
  mocks.auth.mockResolvedValue(null)
  expect((await invoke('{"posicaoKanban":0}')).status).toBe(401)
  expect(mocks.update).not.toHaveBeenCalled()
 })
 it("recusa outra organização antes de escrever", async () => {
  mocks.guard.mockResolvedValue(NextResponse.json({}, {status:404}))
  expect((await invoke('{"posicaoKanban":0}')).status).toBe(404)
  expect(mocks.update).not.toHaveBeenCalled()
 })
 it("não usa o papel global da sessão para conceder acesso", async () => {
  mocks.permissions.mockResolvedValue({papel:"solicitante",permissoes:{moverKanban:false}})
  expect((await invoke('{"posicaoKanban":0}')).status).toBe(403)
  expect(mocks.update).not.toHaveBeenCalled()
 })
 it("nega vínculo indeterminado", async () => {
  mocks.permissions.mockResolvedValue(null)
  expect((await invoke('{"posicaoKanban":0}')).status).toBe(403)
 })
 it.each(['null', '{}', '{', '{"posicaoKanban":-1}', '{"posicaoKanban":1.2}', '{"posicaoKanban":2147483648}', '{"posicaoKanban":"1"}'])("recusa entrada inválida %s", async body => {
  expect((await invoke(body)).status).toBe(400)
  expect(mocks.update).not.toHaveBeenCalled()
 })
 it("salva somente com permissão efetiva na organização", async () => {
  expect((await invoke('{"posicaoKanban":2}')).status).toBe(200)
  expect(mocks.permissions).toHaveBeenCalledWith("u","org")
  expect(mocks.update).toHaveBeenCalledWith({where:{id:"d"},data:{posicaoKanban:2}})
 })
})
