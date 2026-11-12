// Franquia de armazenamento por empresa (Onda 2A, 21/10/2026).
//
// O valor do plano ainda está em decisão (10 GB ou 50 GB). Fica numa variável
// só, FRANQUIA_ARMAZENAMENTO_GB, com 10 GB quando ela falta: mudar de ideia é
// trocar a variável, sem deploy de código.
//
// Hoje a franquia segura uma coisa: o conversor de vídeo não gera versão leve
// nova para quem já passou dela (a versão leve também ocupa espaço). O arquivo
// enviado não é recusado por isso — o limite por arquivo é o da Onda 1.
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"

const GB = 1024 ** 3

export function franquiaBytes(): number {
  const gb = Number(process.env.FRANQUIA_ARMAZENAMENTO_GB)
  return (Number.isFinite(gb) && gb > 0 ? gb : 10) * GB
}

/** Bytes que a empresa ocupa: os arquivos das demandas e as versões leves. */
export async function usoArmazenamento(organizacaoId: string): Promise<number> {
  const soma = await comOrg(organizacaoId, () => prisma.arquivo.aggregate({
    where: { demanda: { organizacaoId } },
    _sum: { tamanho: true, previewTamanho: true },
  }))
  return Number(soma._sum.tamanho ?? 0) + Number(soma._sum.previewTamanho ?? 0)
}

export async function dentroDaFranquia(organizacaoId: string): Promise<boolean> {
  return (await usoArmazenamento(organizacaoId)) < franquiaBytes()
}
