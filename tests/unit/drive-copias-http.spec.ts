import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"
const mocks = vi.hoisted(() => ({ acesso: vi.fn(), status: vi.fn(), enfileirar: vi.fn(), executar: vi.fn(), ativo: vi.fn() }))
vi.mock("@/lib/acesso", () => ({ requireAcesso: mocks.acesso }))
vi.mock("@/lib/drive-copias", () => ({ driveCopiaAtiva: mocks.ativo, enfileirarCopiasDrive: mocks.enfileirar, statusCopiasDrive: mocks.status, executarCopiaDrive: mocks.executar }))
vi.mock("@/lib/automacoes-saude", () => ({ acompanharConsumidor: async (_org: string, _nome: string, executar: () => Promise<{ dados: unknown }>) => (await executar()).dados }))
import { GET, POST } from "@/app/api/admin/sync-drive/route"
import { GET as cron } from "@/app/api/cron/drive/route"
beforeEach(() => { vi.resetAllMocks(); mocks.acesso.mockResolvedValue({ organizacaoId: "empresa-a", usuarioId: "admin" }); mocks.ativo.mockReturnValue(true) })
afterEach(() => vi.unstubAllEnvs())
const post = (body: string) => POST(new NextRequest("https://flow.test/api/admin/sync-drive",{ method: "POST", body }))
it("sem capacidade administrativa não consulta nem enfileira", async () => {
  mocks.acesso.mockResolvedValue(NextResponse.json({ error: "Sem permissão" },{ status: 403 }))
  expect((await GET()).status).toBe(403); expect((await post("{}")).status).toBe(403)
  expect(mocks.status).not.toHaveBeenCalled(); expect(mocks.enfileirar).not.toHaveBeenCalled(); expect(mocks.acesso).toHaveBeenCalledWith("gerenciarConfig")
})
it("JSON inválido não vira solicitação de biblioteca inteira", async () => {
  expect((await post("quebrado")).status).toBe(400); expect((await post('{"cursor":4}')).status).toBe(400); expect(mocks.enfileirar).not.toHaveBeenCalled()
})
it("origem da empresa é o guard; 202 significa enfileirado", async () => {
  mocks.enfileirar.mockResolvedValue({ enfileirados: 1, existentes: 0, ignorados: 0, proximoCursor: null })
  const r = await post('{"organizacaoId":"invasor"}'); expect(r.status).toBe(202)
  expect(mocks.enfileirar).toHaveBeenCalledWith(expect.anything(),"empresa-a",undefined); expect((await r.json()).enfileirados).toBe(1)
})
it("falha de consulta retorna 503 sem inventar zero cópias", async () => {
  mocks.status.mockRejectedValue(new Error("SEGREDO")); const r = await GET(); expect(r.status).toBe(503); expect(await r.text()).not.toContain("SEGREDO")
})
it("resultado não pode ser compartilhado pelo cache", async () => {
  mocks.status.mockResolvedValue({ ativo: true, estados: { concluido: 1 } }); expect((await GET()).headers.get("Cache-Control")).toContain("no-store")
})
it("piloto desativado não enfileira", async () => {
  mocks.ativo.mockReturnValue(false); expect((await post("{}")).status).toBe(409); expect(mocks.enfileirar).not.toHaveBeenCalled()
})
it("cron rejeita segredo incorreto e escolhe empresa somente no servidor", async () => {
  vi.stubEnv("CRON_SECRET","segredo-local"); vi.stubEnv("DRIVE_SYNC_ORGANIZACAO_ID","piloto-a")
  expect((await cron(new NextRequest("https://flow.test/api/cron/drive"))).status).toBe(401); expect(mocks.executar).not.toHaveBeenCalled()
  mocks.executar.mockResolvedValue({ estado: "sem_trabalho" })
  await cron(new NextRequest("https://flow.test/api/cron/drive?organizacaoId=invasor",{ headers: { Authorization: "Bearer segredo-local" } }))
  expect(mocks.executar).toHaveBeenCalledWith(expect.anything(),"piloto-a")
})
