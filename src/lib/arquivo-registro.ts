import { registrarIntencaoMidia } from "@/lib/midia-fila"
import { prisma } from "@/lib/prisma"
import { metadadosFonte } from "@/lib/arquivo-fonte"
import { identificarMidia } from "@/lib/midia-identidade"

export type RegistroArquivo = {
  organizacaoId: string
  demandaId: string
  tipo: "final" | "bruto" | "documento"
  url: string
  nomeArquivo: string
  thumbnailUrl?: string
  // Somente o caminho que recebeu os bytes no servidor preenche estes campos.
  tamanho?: number
  mimeDeclarado?: string
  sha256?: string
}

export function fonteUploadValida(url: string, org: string, demanda: string, tipo: RegistroArquivo["tipo"] | "thumbnail"): boolean {
  const id = identificarMidia(url)
  if (!id) return false
  if (id.provedor !== "supabase") return true // referência externa, nunca autorização para download
  const p = id.objectKey.split("/")
  if (id.bucket !== "midia") return p[0] === (tipo === "documento" ? "docs" : tipo === "thumbnail" ? "thumbnails" : "videos") && p[1] === demanda
  return p[1] === org && p[3] === demanda && p[2] === (tipo === "documento" ? "docs" : tipo === "thumbnail" ? "thumbnails" : "videos")
}

/** O chamador autoriza o usuário; o serviço revalida o dono e grava arquivo/link juntos. */
export async function registrarArquivoDemanda(p: RegistroArquivo) {
  if (!fonteUploadValida(p.url, p.organizacaoId, p.demandaId, p.tipo) ||
    (p.thumbnailUrl && !fonteUploadValida(p.thumbnailUrl, p.organizacaoId, p.demandaId, "thumbnail"))) throw new Error("Referência de mídia inválida")
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`arquivo:${p.demandaId}`}, 0))`
    const demanda = await tx.demanda.findFirst({ where: { id: p.demandaId, organizacaoId: p.organizacaoId }, select: { id: true } })
    if (!demanda) throw new Error("Demanda não encontrada")
    // Reenvio da confirmação de upload não cria outra entrega nem altera sua versão.
    const existente = await tx.arquivo.findFirst({ where: { demandaId: p.demandaId, tipoArquivo: p.tipo, OR: [{ url: p.url }, { originalUrl: p.url }] }, orderBy: { createdAt: "asc" } })
    if (existente) return { arquivo: existente, criado: false }
    const ultima = await tx.arquivo.aggregate({ where: { demandaId: p.demandaId, tipoArquivo: p.tipo }, _max: { sequencia: true } })
    const arquivo = await tx.arquivo.create({ data: {
      demandaId: p.demandaId, tipoArquivo: p.tipo, url: p.url, nomeArquivo: p.nomeArquivo,
      ...metadadosFonte(p.url, p.organizacaoId, p.demandaId),
      sequencia: (ultima._max.sequencia ?? 0) + 1,
      thumbnailUrl: p.thumbnailUrl, tamanho: p.tamanho, fonteMimeDeclarado: p.mimeDeclarado, fonteSha256: p.sha256,
    } })
    if (p.tipo !== "documento") await tx.demanda.update({ where: { id: demanda.id }, data: {
      [p.tipo === "final" ? "linkFinal" : "linkBrutos"]: p.url,
      ...(p.tipo === "final" && p.thumbnailUrl ? { thumbnailUrl: p.thumbnailUrl } : {}),
    } })
    await registrarIntencaoMidia(tx, p.organizacaoId, arquivo)
    return { arquivo, criado: true }
  })
}
