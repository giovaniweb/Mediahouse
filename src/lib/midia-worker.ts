import { z } from "zod"
import type { Prisma, JobAutomacao, Arquivo } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { criarFila, type LeaseJob } from "@/lib/fila-duravel"
import { CONVERTER_MIDIA, PERFIL_PREVIEW, prepararMidias } from "@/lib/midia-fila"
import { videoDaDemanda } from "@/lib/midia-identidade"
import { urlAssinadaDeLeitura, urlDeUpload, urlDaMidia } from "@/lib/midia"

const fila = criarFila(prisma)
const segmento = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/)
export const leaseSchema = z.object({ jobId: segmento, leaseToken: segmento })
export const resultadoMidiaSchema = leaseSchema.extend({ fonteVersao: z.number().int().positive(), perfil: z.literal(PERFIL_PREVIEW),
  objectKey: z.string().max(1024), sha256: z.string().regex(/^[a-f0-9]{64}$/), tamanho: z.number().int().positive().max(100 * 1024 * 1024),
  mime: z.literal("video/mp4"), codec: z.literal("h264"), codecAudio: z.enum(["aac"]).nullable(),
  largura: z.number().int().min(2).max(1280), altura: z.number().int().min(2).max(1280), duracao: z.number().positive().max(600) }).strict()
export type ResultadoMidia = z.infer<typeof resultadoMidiaSchema>
type Identificador = z.infer<typeof leaseSchema>
class FonteInvalida extends Error {}
const lease = (org: string, p: Identificador): LeaseJob => ({ organizacaoId: org, id: p.jobId, leaseToken: p.leaseToken })

export function destinoPreview(a: Arquivo, j: JobAutomacao, token: string) {
  return `org/${j.organizacaoId}/videos/${a.demandaId}/previews/${a.id}/${a.fonteVersao}/${PERFIL_PREVIEW}/${j.id}-${token}.mp4`
}
async function fonte(tx: Prisma.TransactionClient, j: JobAutomacao) {
  const p = j.payload as Record<string, unknown>
  if (j.tipo !== CONVERTER_MIDIA || j.versao !== 1 || !p || p.perfil !== PERFIL_PREVIEW || !Number.isSafeInteger(p.fonteVersao)) throw new FonteInvalida()
  const a = await tx.arquivo.findFirst({ where: { id: j.referencia, tipoArquivo: "final", demanda: { organizacaoId: j.organizacaoId } } })
  if (!a || a.fonteVersao !== p.fonteVersao || a.fonteProvedor !== "supabase" || !a.fonteBucket || !a.fonteObjectKey ||
    !videoDaDemanda({ provedor: "supabase", bucket: a.fonteBucket, objectKey: a.fonteObjectKey }, j.organizacaoId, a.demandaId)) throw new FonteInvalida()
  return a
}

export async function reivindicarConversao(organizacaoId: string) {
  return comOrg(organizacaoId, async () => {
    await prepararMidias(organizacaoId)
    const [j] = await fila.reivindicar(organizacaoId, 1, [CONVERTER_MIDIA], 1)
    if (!j) return null
    const l = lease(organizacaoId, { jobId: j.id, leaseToken: j.leaseToken! })
    try {
      const a = await fila.comLease(l, (tx, atual) => fonte(tx, atual))
      if (!a) return null
      // Nunca inicia outro serviço por cima de uma conversão legada em andamento.
      if (a.transcodeStatus === "processing") {
        await fila.falhar(l, "objeto_invalido", false); return null
      }
      if (["done", "skipped"].includes(a.transcodeStatus ?? "")) {
        await fila.concluirLocal(l, async (tx, atual) => { await fonte(tx, atual) }); return null
      }
      if (a.tamanho !== null && a.tamanho > 100 * 1024 * 1024) throw new FonteInvalida()
      const sourceUrl = a.fonteBucket === "midia" ? await urlAssinadaDeLeitura(a.fonteObjectKey!, 1200)
        : `${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin}/storage/v1/object/public/uploads/${a.fonteObjectKey}`
      const destino = destinoPreview(a, j, l.leaseToken)
      const upload = await urlDeUpload(destino)
      if (!sourceUrl || !upload) throw new Error("storage_indisponivel")
      // A assinatura acontece fora da transação; conferir novamente após a rede.
      const atual = await fila.comLease(l, async (tx, job) => {
        const novo = await fonte(tx, job)
        if (novo.fonteObjectKey !== a.fonteObjectKey || novo.fonteBucket !== a.fonteBucket || novo.fonteSha256 !== a.fonteSha256 || novo.url !== a.url || novo.transcodeStatus !== a.transcodeStatus) throw new FonteInvalida()
        return true
      })
      if (!atual || !await fila.renovar(l)) return null
      return { jobId: j.id, leaseToken: l.leaseToken, organizacaoId, demandaId: a.demandaId, arquivoId: a.id,
        fonteVersao: a.fonteVersao!, perfil: PERFIL_PREVIEW, bucket: a.fonteBucket!, objectKey: a.fonteObjectKey!, sourceUrl, uploadUrl: upload.uploadUrl,
        ...(a.fonteSha256 ? { sha256: a.fonteSha256 } : {}) }
    } catch (e) {
      await fila.falhar(l, e instanceof FonteInvalida ? "objeto_invalido" : "falha_temporaria", !(e instanceof FonteInvalida))
      return null
    }
  })
}

export async function renovarConversao(organizacaoId: string, p: Identificador) {
  const l = lease(organizacaoId, p)
  try {
    if (!await fila.comLease(l, (tx, j) => fonte(tx, j))) return false
    return fila.renovar(l)
  } catch { return false }
}
export async function falharConversao(organizacaoId: string, p: Identificador, recuperavel: boolean) {
  const l = lease(organizacaoId, p)
  const valido = await fila.comLease(l, async (_tx, j) => j.tipo === CONVERTER_MIDIA && j.versao === 1)
  return !!valido && fila.falhar(l, recuperavel ? "falha_temporaria" : "objeto_invalido", recuperavel)
}

function conferirResultado(a: Arquivo, j: JobAutomacao, r: ResultadoMidia) {
  if (r.fonteVersao !== a.fonteVersao || r.objectKey !== destinoPreview(a, j, r.leaseToken)) throw new FonteInvalida()
}
/** Retry após commit perdido só acusa sucesso se corresponder ao recibo persistido. */
async function recibo(organizacaoId: string, r: ResultadoMidia) {
  const j = await prisma.jobAutomacao.findFirst({ where: { id: r.jobId, organizacaoId, tipo: CONVERTER_MIDIA, estado: "concluido" } })
  if (!j) return false
  const a = await prisma.arquivo.findFirst({ where: { id: j.referencia, demanda: { organizacaoId, organizacao: { ativo: true } },
    previewJobId: r.jobId, previewObjectKey: r.objectKey, previewFonteVersao: r.fonteVersao, fonteVersao: r.fonteVersao,
    previewSha256: r.sha256, previewTamanho: r.tamanho } })
  if (!a) return false
  conferirResultado(a, j, r)
  return true
}
export async function concluirConversao(organizacaoId: string, resultado: ResultadoMidia) {
  const r = resultadoMidiaSchema.parse(resultado), l = lease(organizacaoId, r)
  return comOrg(organizacaoId, async () => {
    try {
      if (await recibo(organizacaoId, r)) return true
      const snapshot = await fila.comLease(l, async (tx, j) => {
        const a = await fonte(tx, j); conferirResultado(a, j, r); return a
      })
      if (!snapshot) return false
      // O callback não promove uma URL arbitrária. Confere o objeto exato no storage.
      const url = await urlAssinadaDeLeitura(r.objectKey, 60)
      if (!url) throw new Error("storage_indisponivel")
      const head = await fetch(url, { method: "HEAD", redirect: "error", signal: AbortSignal.timeout(8000) })
      if (!head.ok) throw new Error("storage_indisponivel")
      if (head.headers.get("content-type")?.split(";")[0] !== "video/mp4" || Number(head.headers.get("content-length")) !== r.tamanho) return false
      const concluiu = await fila.concluirLocal(l, async (tx, j) => {
        const a = await fonte(tx, j); conferirResultado(a, j, r)
        if (a.url !== snapshot.url || a.fonteObjectKey !== snapshot.fonteObjectKey || a.fonteBucket !== snapshot.fonteBucket || a.fonteSha256 !== snapshot.fonteSha256 || a.transcodeStatus === "processing") throw new FonteInvalida()
        const previewUrl = urlDaMidia(r.objectKey)
        const aplicado = await tx.arquivo.updateMany({ where: { id: a.id, fonteVersao: r.fonteVersao, url: a.url, fonteObjectKey: a.fonteObjectKey, fonteBucket: a.fonteBucket, fonteSha256: a.fonteSha256, transcodeStatus: a.transcodeStatus }, data: { originalUrl: a.originalUrl ?? a.url, url: previewUrl,
          previewObjectKey: r.objectKey, previewJobId: r.jobId, previewFonteVersao: r.fonteVersao,
          previewSha256: r.sha256, previewTamanho: r.tamanho, transcodeStatus: "done" } })
        if (aplicado.count !== 1) throw new FonteInvalida()
        await tx.demanda.updateMany({ where: { id: a.demandaId, organizacaoId, linkFinal: a.url }, data: { linkFinal: previewUrl } })
        await tx.aprovacaoVideo.updateMany({ where: { demandaId: a.demandaId, urlVideo: a.url, status: "pendente" }, data: { urlVideo: previewUrl } })
      })
      return concluiu || await recibo(organizacaoId, r)
    } catch (e) { if (e instanceof FonteInvalida) return false; throw e }
  })
}
