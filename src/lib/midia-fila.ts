import type { Arquivo, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { criarFila, enfileirar, type LeaseJob } from "@/lib/fila-duravel"
import { videoDaDemanda } from "@/lib/midia-identidade"

export const PREPARAR_MIDIA = "midia.preparar"
export const CONVERTER_MIDIA = "midia.converter"
export const PERFIL_PREVIEW = "h264-720p-v1"
type Fonte = Pick<Arquivo, "id" | "demandaId" | "tipoArquivo" | "fonteProvedor" | "fonteBucket" | "fonteObjectKey" | "fonteVersao">
function elegivel(a: Fonte, org: string) {
  return a.tipoArquivo === "final" && a.fonteProvedor === "supabase" && a.fonteBucket && a.fonteObjectKey &&
    a.fonteVersao !== null && a.fonteVersao > 0 && videoDaDemanda({ provedor: "supabase", bucket: a.fonteBucket, objectKey: a.fonteObjectKey }, org, a.demandaId)
}

/** Na transação do arquivo; só IDs/versão/perfil, nunca URL assinada ou credenciais. */
export async function registrarIntencaoMidia(tx: Prisma.TransactionClient, organizacaoId: string, arquivo: Fonte) {
  if (!elegivel(arquivo, organizacaoId)) return null
  const [r] = await tx.$queryRaw<{ agora: Date }[]>`SELECT (clock_timestamp() AT TIME ZONE 'UTC') AS agora`
  return enfileirar(tx, { organizacaoId, tipo: PREPARAR_MIDIA, referencia: arquivo.id,
    chave: `${arquivo.id}:${arquivo.fonteVersao}:${PERFIL_PREVIEW}`,
    payload: { fonteVersao: arquivo.fonteVersao!, perfil: PERFIL_PREVIEW },
    expiraEm: new Date(r.agora.getTime() + 7 * 86400_000) })
}

class FonteObsoleta extends Error {}
/** Preparação puramente local. A conversão externa só será consumida pelo worker M02. */
export async function prepararMidias(organizacaoId: string) {
  const fila = criarFila(prisma)
  const jobs = await fila.reivindicar(organizacaoId, 2, [PREPARAR_MIDIA])
  const resumo = { reivindicados: jobs.length, concluidos: 0, falhos: 0, obsoletos: 0 }
  for (const job of jobs) {
    const lease: LeaseJob = { ...job, leaseToken: job.leaseToken! }
    try {
      const concluido = await fila.concluirLocal(lease, async (tx, atual) => {
        const p = atual.payload as Record<string, unknown>
        if (atual.versao !== 1 || !p || p.perfil !== PERFIL_PREVIEW || !Number.isSafeInteger(p.fonteVersao) ||
          Object.keys(p).some(k => !["perfil", "fonteVersao"].includes(k))) throw new FonteObsoleta()
        const arquivo = await tx.arquivo.findFirst({ where: { id: atual.referencia, demanda: { organizacaoId } } })
        if (!arquivo || !elegivel(arquivo, organizacaoId) || arquivo.fonteVersao !== p.fonteVersao) throw new FonteObsoleta()
        // Arquivo, versão e perfil são a chave. O consumidor M02 deve revalidar
        // novamente antes da rede, inclusive resultado do caminho legado.
        await enfileirar(tx, { organizacaoId, tipo: CONVERTER_MIDIA, referencia: arquivo.id,
          chave: `${arquivo.id}:${arquivo.fonteVersao}:${PERFIL_PREVIEW}`,
          payload: { fonteVersao: arquivo.fonteVersao!, perfil: PERFIL_PREVIEW }, expiraEm: atual.expiraEm })
      })
      if (concluido) resumo.concluidos++; else resumo.obsoletos++
    } catch (e) {
      const invalido = e instanceof FonteObsoleta
      if (await fila.falhar(lease, invalido ? "objeto_invalido" : "falha_temporaria", !invalido)) resumo.falhos++
      else resumo.obsoletos++
    }
  }
  return resumo
}
