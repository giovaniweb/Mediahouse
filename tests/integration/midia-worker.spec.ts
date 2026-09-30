import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
const mocks = vi.hoisted(() => ({ leitura: vi.fn(), upload: vi.fn() }))
vi.mock("@/lib/midia", async importOriginal => ({ ...await importOriginal<object>(), urlAssinadaDeLeitura: mocks.leitura, urlDeUpload: mocks.upload }))
import { prismaBase as db } from "@/lib/prisma"
import { registrarArquivoDemanda } from "@/lib/arquivo-registro"
import { reivindicarConversao, renovarConversao, concluirConversao, type ResultadoMidia } from "@/lib/midia-worker"
import { POST } from "@/app/api/transcode/worker/route"
import { POST as callbackLegado } from "@/app/api/transcode/callback/route"
const p = `worker-${randomUUID()}`, a = `${p}-a`, b = `${p}-b`, d = `${p}-d`
const original = `/api/midia/org/${a}/videos/${d}/original.mov`
const call = (body: object, auth = "Bearer teste-v2") => POST(new NextRequest("http://localhost/api/transcode/worker", { method: "POST", headers: { authorization: auth }, body: JSON.stringify(body) }))
const criar = async (nome = "original.mov") => (await registrarArquivoDemanda({ organizacaoId: a, demandaId: d, tipo: "final", url: original.replace("original.mov", nome), nomeArquivo: nome })).arquivo
function resultado(j: NonNullable<Awaited<ReturnType<typeof reivindicarConversao>>>): ResultadoMidia {
  return { jobId: j.jobId, leaseToken: j.leaseToken, fonteVersao: j.fonteVersao, perfil: "h264-720p-v1",
    objectKey: new URL(j.uploadUrl).pathname.replace("/storage/v1/object/upload/sign/midia/", ""), tamanho: 123,
    sha256: "a".repeat(64), mime: "video/mp4", codec: "h264", codecAudio: null, largura: 160, altura: 90, duracao: 1 }
}
beforeAll(async () => {
  await db.organizacao.createMany({ data: [a,b].map(id => ({ id, nome: id, slug: id })) })
  await db.usuario.create({ data: { id: p, nome: p, tipo: "admin", senhaHash: "sem-login" } })
  await db.demanda.create({ data: { id: d, organizacaoId: a, solicitanteId: p, codigo: d, titulo: d, descricao: "teste", cidade: "Teste", departamento: "growth", tipoVideo: "reels" } })
})
beforeEach(async () => {
  vi.stubEnv("MIDIA_WORKER_V2_ATIVO", "sim"); vi.stubEnv("MIDIA_WORKER_SECRET", "teste-v2"); vi.stubEnv("MIDIA_WORKER_ORGANIZACAO_ID", a)
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://storage.test")
  vi.stubEnv("TRANSCODE_SECRET", "legado")
  mocks.leitura.mockReset().mockImplementation(async c => `https://storage.test/storage/v1/object/sign/midia/${c}?token=temporario`)
  mocks.upload.mockReset().mockImplementation(async c => ({ uploadUrl: `https://storage.test/storage/v1/object/upload/sign/midia/${c}?token=temporario`, url: `/api/midia/${c}` }))
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, headers: new Headers({ "content-type": "video/mp4", "content-length": "123" }) }))
  await db.jobAutomacao.deleteMany({ where: { organizacaoId: a } })
  await db.arquivo.deleteMany({ where: { demandaId: d } })
  await db.organizacao.update({ where: { id: a }, data: { ativo: true } })
  await db.demanda.update({ where: { id: d }, data: { linkFinal: null } })
})
afterAll(async () => {
  vi.unstubAllEnvs()
  await db.organizacao.deleteMany({ where: { id: { in: [a,b] } } })
  await db.usuario.delete({ where: { id: p } })
  await db.$disconnect()
})
describe("protocolo do worker durável", () => {
  it("desligado por padrão; segredo e contrato impedem escolher empresa por payload", async () => {
    vi.stubEnv("MIDIA_WORKER_V2_ATIVO", "nao")
    expect((await call({ acao: "reivindicar" })).status).toBe(503)
    vi.stubEnv("MIDIA_WORKER_V2_ATIVO", "sim")
    expect((await call({ acao: "reivindicar" }, "Bearer errado")).status).toBe(401)
    expect((await call({ acao: "reivindicar", organizacaoId: b })).status).toBe(400)
  })
  it("reivindicações concorrentes em processos diferentes concedem um só lease", async () => {
    await criar(); await criar("outro.mov")
    const jobs = (await Promise.all([reivindicarConversao(a), reivindicarConversao(a)])).filter(Boolean)
    expect(jobs).toHaveLength(1)
    expect(await renovarConversao(a, jobs[0]!)).toBe(true)
    expect(await renovarConversao(b, jobs[0]!)).toBe(false)
    expect(await reivindicarConversao(a)).toBeNull()
  })
  it("callback confirma objeto, preserva fonte e publicação e pode ser repetido", async () => {
    const arq = await criar()
    await db.arquivo.update({ where: { id: arq.id }, data: { publicacaoUrl: original, publicadoEm: new Date() } })
    const j = (await reivindicarConversao(a))!, r = resultado(j)
    expect(j.sourceUrl).toContain("/sign/midia/")
    expect(await concluirConversao(a, r)).toBe(true)
    expect(await concluirConversao(a, r)).toBe(true)
    const salvo = await db.arquivo.findUniqueOrThrow({ where: { id: arq.id } })
    expect(salvo).toMatchObject({ originalUrl: original, fonteObjectKey: `org/${a}/videos/${d}/original.mov`, url: `/api/midia/${r.objectKey}`, previewSha256: r.sha256, previewJobId: j.jobId, previewTamanho: 123, transcodeStatus: "done", publicacaoUrl: original })
    expect((await db.demanda.findUniqueOrThrow({ where: { id: d } })).linkFinal).toBe(salvo.url)
    expect((await criar()).id).toBe(arq.id)
    expect(await db.arquivo.count({ where: { demandaId: d } })).toBe(1)
    expect(await db.eventoJob.count({ where: { jobId: j.jobId, evento: "concluido" } })).toBe(1)
    expect(await concluirConversao(a, { ...r, sha256: "b".repeat(64) })).toBe(false)
  })
  it("lease vencido não publica; retomada usa outro objeto de saída", async () => {
    await criar(); const velho = (await reivindicarConversao(a))!, r = resultado(velho)
    await db.jobAutomacao.update({ where: { id: velho.jobId }, data: { leaseAte: new Date(0) } })
    expect(await concluirConversao(a, r)).toBe(false)
    const novo = (await reivindicarConversao(a))!
    expect(novo.leaseToken).not.toBe(velho.leaseToken)
    expect(resultado(novo).objectKey).not.toBe(r.objectKey)
    expect(await concluirConversao(a, r)).toBe(false)
    expect(await concluirConversao(a, resultado(novo))).toBe(true)
  })
  it("versão alterada ou empresa pausada corta renovação e conclusão", async () => {
    const arq = await criar(), j = (await reivindicarConversao(a))!
    await db.arquivo.update({ where: { id: arq.id }, data: { fonteVersao: 2 } })
    expect(await renovarConversao(a, j)).toBe(false)
    expect(await concluirConversao(a, resultado(j))).toBe(false)
    await db.arquivo.update({ where: { id: arq.id }, data: { fonteVersao: 1 } })
    await db.organizacao.update({ where: { id: a }, data: { ativo: false } })
    expect(await concluirConversao(a, resultado(j))).toBe(false)
  })
  it("storage indisponível mantém recibo repetível via HTTP 503", async () => {
    await criar(); const j = (await reivindicarConversao(a))!, r = resultado(j)
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response)
    expect((await call({ acao: "concluir", resultado: r })).status).toBe(503)
    expect((await db.jobAutomacao.findUniqueOrThrow({ where: { id: j.jobId } })).estado).toBe("executando")
    expect((await call({ acao: "concluir", resultado: r })).status).toBe(200)
  })
  it("recusa resultado fora do destino assinado e tamanho incompatível", async () => {
    await criar(); const j = (await reivindicarConversao(a))!, r = resultado(j)
    expect(await concluirConversao(a, { ...r, objectKey: r.objectKey.replace(`/org/${a}/`, "/org/outra/") + ".outro" })).toBe(false)
    expect(await concluirConversao(a, { ...r, tamanho: 124 })).toBe(false)
    expect((await db.demanda.findUniqueOrThrow({ where: { id: d } })).linkFinal).toBe(original)
  })
  it.each(["processing", "done", "skipped"])("não duplica conversão legada %s", async status => {
    const arq = await criar(); await db.arquivo.update({ where: { id: arq.id }, data: { transcodeStatus: status } })
    expect(await reivindicarConversao(a)).toBeNull(); expect(mocks.upload).not.toHaveBeenCalled()
  })
  it("callback legado não sobrescreve a empresa ativada nem uma prévia v2 após desligamento", async () => {
    const arq = await criar()
    const chamar = () => callbackLegado(new NextRequest("http://localhost/api/transcode/callback", { method: "POST", headers: { authorization: "Bearer legado" }, body: JSON.stringify({ arquivoId: arq.id, status: "done", mp4Url: "https://example.com/velho.mp4" }) }))
    expect((await chamar()).status).toBe(409)
    const j = (await reivindicarConversao(a))!
    expect(await concluirConversao(a, resultado(j))).toBe(true)
    vi.stubEnv("MIDIA_WORKER_V2_ATIVO", "nao")
    expect((await chamar()).status).toBe(409)
  })
})
