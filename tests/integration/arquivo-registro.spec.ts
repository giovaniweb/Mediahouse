import { prepararMidias, registrarIntencaoMidia, PREPARAR_MIDIA, CONVERTER_MIDIA } from "@/lib/midia-fila"
import { criarFila } from "@/lib/fila-duravel"
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID, createHash } from "node:crypto"
import { NextRequest } from "next/server"
const estado = vi.hoisted(() => ({ org: "", url: "" }))
vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "teste" } }) }))
vi.mock("@/lib/org", () => ({ requireDemandaOrg: async () => ({ organizacaoId: estado.org }) }))
vi.mock("@/lib/midia", async importOriginal => ({ ...await importOriginal<object>(), subirArquivo: vi.fn(async () => estado.url) }))
vi.mock("@/lib/transcode", () => ({ precisaTranscodeConferindo: vi.fn(async () => false), enqueueTranscode: vi.fn(async () => false) }))
import { prismaBase as db } from "@/lib/prisma"
import { registrarArquivoDemanda } from "@/lib/arquivo-registro"
import { PATCH, POST } from "@/app/api/demandas/[id]/upload-video/route"
const p = `registro-${randomUUID()}`, a = `${p}-a`, b = `${p}-b`, d = `${p}-d`
const url = (nome = "v.mp4", tipo = "videos") => `/api/midia/org/${a}/${tipo}/${d}/${nome}`
const params = { params: Promise.resolve({ id: d }) }
const registrar = (nome = "v.mp4") => registrarArquivoDemanda({ organizacaoId: a, demandaId: d, tipo: "final", url: url(nome), nomeArquivo: nome })
const patch = (body: object) => PATCH(new NextRequest(`http://localhost/api/demandas/${d}/upload-video`, { method: "PATCH", body: JSON.stringify(body) }), params)
beforeAll(async () => {
  await db.organizacao.createMany({ data: [a,b].map(id => ({ id, nome: id, slug: id })) })
  await db.usuario.create({ data: { id: p, nome: p, tipo: "admin", senhaHash: "sem-login" } })
  await db.demanda.create({ data: { id: d, organizacaoId: a, solicitanteId: p, codigo: d, titulo: d, descricao: "teste", cidade: "Teste", departamento: "growth", tipoVideo: "reels" } })
})
beforeEach(async () => {
  estado.org = a
  await db.jobAutomacao.deleteMany({ where: { organizacaoId: a } })
  await db.arquivo.deleteMany({ where: { demandaId: d } })
  await db.demanda.update({ where: { id: d }, data: { linkFinal: null, linkBrutos: null } })
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://storage.test")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sintetico")
})
afterAll(async () => {
  vi.unstubAllEnvs()
  await db.organizacao.deleteMany({ where: { id: { in: [a,b] } } })
  await db.usuario.delete({ where: { id: p } })
  await db.$disconnect()
})
describe("registro de arquivos e demanda", () => {
  it("confirmações concorrentes criam uma só entrega com identidade", async () => {
    const r = await Promise.all([registrar(), registrar(), registrar()])
    expect(new Set(r.map(x => x.arquivo.id)).size).toBe(1)
    expect(r.filter(x => x.criado)).toHaveLength(1)
    expect(await db.jobAutomacao.count({ where: { organizacaoId: a, tipo: PREPARAR_MIDIA } })).toBe(1)
    expect(r[0].arquivo).toMatchObject({ fonteProvedor: "supabase", fonteBucket: "midia", fonteObjectKey: `org/${a}/videos/${d}/v.mp4`, fonteVersao: 1, fonteSha256: null, fonteMimeDeclarado: null })
    expect((await db.demanda.findUniqueOrThrow({ where: { id: d } })).linkFinal).toBe(url())
  })
  it("sequência usa o maior número existente e não a contagem", async () => {
    const primeiro = await registrar()
    await db.arquivo.update({ where: { id: primeiro.arquivo.id }, data: { sequencia: 7 } })
    expect((await registrar("novo.mp4")).arquivo.sequencia).toBe(8)
    await registrar()
    expect((await db.demanda.findUniqueOrThrow({ where: { id: d } })).linkFinal).toBe(url("novo.mp4"))
  })
  it("revalida dono mesmo quando a referência é externa", async () => {
    await expect(registrarArquivoDemanda({ organizacaoId: b, demandaId: d, tipo: "final", url: "https://example.com/v.mp4", nomeArquivo: "v" })).rejects.toThrow("Demanda não encontrada")
    expect(await db.arquivo.count({ where: { demandaId: d } })).toBe(0)
  })
  it("PATCH recusa objeto de outra demanda e metadados forjados não são persistidos", async () => {
    expect((await patch({ tipo: "final", url: url().replace(`/${d}/`, "/outra/") })).status).toBe(422)
    expect((await patch({ tipo: "final", url: url(), fonteSha256: "inventado", tamanho: 123 })).status).toBe(200)
    const arq = await db.arquivo.findFirstOrThrow({ where: { demandaId: d } })
    expect(arq.fonteSha256).toBeNull(); expect(arq.tamanho).toBeNull()
  })
  it("documento e bruto criam registros sem trocar o final", async () => {
    await registrar()
    expect((await patch({ tipo: "documento", url: url("briefing.pdf", "docs") })).status).toBe(200)
    expect((await patch({ tipo: "brutos", url: url("brutos.zip") })).status).toBe(200)
    expect(await db.arquivo.count({ where: { demandaId: d } })).toBe(3)
    expect(await db.demanda.findUniqueOrThrow({ where: { id: d } })).toMatchObject({ linkFinal: url(), linkBrutos: url("brutos.zip") })
  })
  it("POST grava tamanho e hash reais; documento não altera linkBrutos", async () => {
    estado.url = url("anexo.zip", "docs")
    const form = new FormData(); form.set("tipo", "documento"); form.set("file", new File(["bytes-sinteticos"], "anexo.zip", { type: "application/zip" }))
    const res = await POST(new NextRequest(`http://localhost/api/demandas/${d}/upload-video`, { method: "POST", body: form }), params)
    expect(res.status).toBe(200)
    expect(await db.arquivo.findFirstOrThrow({ where: { demandaId: d } })).toMatchObject({ tipoArquivo: "documento", tamanho: 16, fonteMimeDeclarado: "application/zip", fonteSha256: createHash("sha256").update("bytes-sinteticos").digest("hex") })
    expect((await db.demanda.findUniqueOrThrow({ where: { id: d } })).linkBrutos).toBeNull()
  })
  it("Drive mantém fileId, enquanto legado sem metadados continua legível", async () => {
    await patch({ tipo: "final", url: "https://drive.google.com/file/d/abc/view" })
    expect(await db.arquivo.findFirstOrThrow({ where: { demandaId: d } })).toMatchObject({ fonteProvedor: "drive", fonteReferencia: "abc", url: "https://drive.google.com/file/d/abc/view" })
    const legado = await db.arquivo.create({ data: { demandaId: d, tipoArquivo: "final", nomeArquivo: "legado", url: "https://example.com/legado" } })
    expect(legado.fonteVersao).toBeNull(); expect(legado.fonteProvedor).toBeNull()
  })
  it("prepara sem rede após interromper a requisição que registrou o upload", async () => {
    const { arquivo } = await registrar()
    expect(await prepararMidias(a)).toMatchObject({ concluidos: 1, falhos: 0 })
    const jobs = await db.jobAutomacao.findMany({ where: { organizacaoId: a }, orderBy: { tipo: "asc" } })
    expect(jobs.find(j => j.tipo === PREPARAR_MIDIA)?.estado).toBe("concluido")
    expect(jobs.find(j => j.tipo === CONVERTER_MIDIA)).toMatchObject({ estado: "pendente", referencia: arquivo.id, payload: { fonteVersao: 1, perfil: "h264-720p-v1" } })
    expect(JSON.stringify(jobs.map(j => j.payload))).not.toContain("/api/midia")
    expect((await prepararMidias(a)).reivindicados).toBe(0)
    expect((await db.arquivo.findUniqueOrThrow({ where: { id: arquivo.id } })).transcodeStatus).toBeNull()
  })
  it("retoma lease vencido sem duplicar a intenção de conversão", async () => {
    await registrar()
    const [j] = await criarFila(db).reivindicar(a, 1, [PREPARAR_MIDIA])
    await db.jobAutomacao.update({ where: { id: j.id }, data: { leaseAte: new Date(0) } })
    expect((await prepararMidias(a)).concluidos).toBe(1)
    expect(await db.jobAutomacao.count({ where: { organizacaoId: a, tipo: CONVERTER_MIDIA } })).toBe(1)
    expect((await db.jobAutomacao.findUniqueOrThrow({ where: { id: j.id } })).tentativas).toBe(2)
  })
  it("versão antiga é rejeitada; outra empresa não prepara a mídia", async () => {
    const { arquivo } = await registrar()
    expect((await prepararMidias(b)).reivindicados).toBe(0)
    await db.arquivo.update({ where: { id: arquivo.id }, data: { fonteVersao: 2 } })
    expect((await prepararMidias(a)).falhos).toBe(1)
    expect(await db.jobAutomacao.count({ where: { organizacaoId: a, tipo: CONVERTER_MIDIA } })).toBe(0)
  })
  it("rollback elimina tanto o arquivo quanto a intenção", async () => {
    await expect(db.$transaction(async tx => {
      const arquivo = await tx.arquivo.create({ data: { demandaId: d, tipoArquivo: "final", url: url(), nomeArquivo: "v.mp4", fonteProvedor: "supabase", fonteBucket: "midia", fonteObjectKey: `org/${a}/videos/${d}/v.mp4`, fonteVersao: 1 } })
      await registrarIntencaoMidia(tx, a, arquivo)
      throw new Error("rollback sintético")
    })).rejects.toThrow("rollback sintético")
    expect(await db.arquivo.count({ where: { demandaId: d } })).toBe(0)
    expect(await db.jobAutomacao.count({ where: { organizacaoId: a } })).toBe(0)
  })
  it("referências Drive e documentos não geram conversões locais", async () => {
    await patch({ tipo: "final", url: "https://drive.google.com/file/d/abc/view" })
    await patch({ tipo: "documento", url: url("briefing.pdf", "docs") })
    expect(await db.jobAutomacao.count({ where: { organizacaoId: a } })).toBe(0)
  })

})
