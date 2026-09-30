import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
const { assinar } = vi.hoisted(() => ({ assinar: vi.fn() }))
vi.mock("@/lib/midia", async importOriginal => ({ ...await importOriginal<object>(), urlAssinadaDeLeitura: assinar }))
import { prismaBase as db } from "@/lib/prisma"
import { enqueueTranscode } from "@/lib/transcode"
const p = `transcode-${randomUUID()}`, a = `${p}-a`, b = `${p}-b`, d = `${p}-d`, outro = `${p}-outro`, arquivoId = `${p}-arquivo`
const url = `/api/midia/org/${a}/videos/${d}/final/v.mov`
const opts = { organizacaoId: a, demandaId: d, arquivoId, sourceUrl: url }
beforeAll(async () => {
  await db.organizacao.createMany({ data: [a,b].map(id => ({ id, nome: id, slug: id })) })
  await db.usuario.create({ data: { id: p, nome: p, tipo: "admin", senhaHash: "sem-login" } })
  await db.demanda.createMany({ data: [d,outro].map(id => ({ id, organizacaoId: a, solicitanteId: p, codigo: id, titulo: id, descricao: "teste", cidade: "Teste", departamento: "growth", tipoVideo: "reels" })) })
  await db.arquivo.create({ data: { id: arquivoId, demandaId: d, url, nomeArquivo: "v.mov", tipoArquivo: "final" } })
})
beforeEach(async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://storage.test")
  vi.stubEnv("TRANSCODE_WORKER_URL", "https://worker.test")
  vi.stubEnv("TRANSCODE_SECRET", "sintetico")
  assinar.mockReset().mockResolvedValue("https://storage.test/signed")
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 202 }))
  await db.arquivo.update({ where: { id: arquivoId }, data: { url, originalUrl: null } })
  await db.demanda.update({ where: { id: d }, data: { linkFinal: url } })
})
afterAll(async () => {
  vi.unstubAllEnvs()
  await db.organizacao.deleteMany({ where: { id: { in: [a,b] } } })
  await db.usuario.delete({ where: { id: p } })
  await db.$disconnect()
})
describe("fonte de conversão vinculada no banco", () => {
  it("processa arquivo privado registrado e mantém a mesma identidade no linkFinal legado", async () => {
    expect(await enqueueTranscode(opts)).toBe(true)
    expect(await enqueueTranscode({ ...opts, arquivoId: undefined })).toBe(true)
    expect(assinar.mock.calls.map(c => c[0])).toEqual([`org/${a}/videos/${d}/final/v.mov`, `org/${a}/videos/${d}/final/v.mov`])
  })
  it("não empresta registro a outra demanda ou organização, nem aceita URL não registrada", async () => {
    expect(await enqueueTranscode({ ...opts, demandaId: outro })).toBe(false)
    expect(await enqueueTranscode({ ...opts, organizacaoId: b })).toBe(false)
    expect(await enqueueTranscode({ ...opts, sourceUrl: url.replace("v.mov", "outro.mov") })).toBe(false)
    expect(assinar).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled()
  })
  it("preserva a autorização do original depois de a reprodução virar MP4", async () => {
    await db.arquivo.update({ where: { id: arquivoId }, data: { originalUrl: url, url: url.replace("v.mov", "preview.mp4") } })
    expect(await enqueueTranscode(opts)).toBe(true)
  })
  it("renova assinatura expirada registrada sem enviar o token antigo ao worker", async () => {
    const expirada = `https://storage.test/storage/v1/object/sign/midia/org/${a}/videos/${d}/final/v.mov?token=expirado`
    await db.arquivo.update({ where: { id: arquivoId }, data: { url: expirada } })
    expect(await enqueueTranscode({ ...opts, sourceUrl: expirada })).toBe(true)
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string).sourceUrl).toBe("https://storage.test/signed")
  })
  it("URL externa continua no cadastro mas não é baixada pelo serviço", async () => {
    const externa = "https://example.test/v.mov"
    await db.arquivo.update({ where: { id: arquivoId }, data: { url: externa } })
    expect(await enqueueTranscode({ ...opts, sourceUrl: externa })).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
    expect((await db.arquivo.findUniqueOrThrow({ where: { id: arquivoId } })).url).toBe(externa)
  })
})
