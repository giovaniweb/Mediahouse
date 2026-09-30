import { identificarMidia } from "@/lib/midia-identidade"

/** Somente depois de autorizar a demanda. Metadados não concedem acesso ao objeto.
 * Fontes não classificáveis continuam legíveis pelo caminho legado, sem inventar identidade. */
export function metadadosFonte(url: string, organizacaoId: string, demandaId: string) {
  const id = identificarMidia(url)
  if (!id) return {}
  if (id.provedor === "supabase") {
    if (id.bucket === "midia") {
      const p = id.objectKey.split("/")
      if (p[1] !== organizacaoId || !["videos", "docs"].includes(p[2]) ||
        (p[3] !== demandaId && !(p[2] === "docs" && p[3] === "whatsapp"))) return {}
    }
    return { fonteProvedor: id.provedor, fonteBucket: id.bucket, fonteObjectKey: id.objectKey, fonteVersao: 1 }
  }
  return { fonteProvedor: id.provedor, fonteReferencia: id.provedor === "drive" ? id.fileId : id.referencia, fonteVersao: 1 }
}
