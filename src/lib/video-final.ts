import { prisma } from "@/lib/prisma"
import { precisaTranscodeConferindo, enqueueTranscode } from "@/lib/transcode"

/**
 * Registra uma nova versão do vídeo final de uma demanda e devolve o id do
 * Arquivo. Corpo movido de api/demandas/[id]/upload-video (30/09/2026) para o
 * Cutflow registrar a entrega do mesmo jeito que a tela. `nomeArquivo` é
 * opcional: link do Drive termina em "/view", que não é nome de arquivo.
 * `organizacaoId` é obrigatório e conferido contra o card.
 */
export async function criarArquivoFinal(
  organizacaoId: string,
  id: string,
  url: string,
  thumbnailUrl?: string,
  nomeArquivoInformado?: string
): Promise<string> {
  // Quem chama já conferiu a empresa; a função confere de novo porque grava num
  // card por id, e um id de outra empresa não pode ganhar vídeo por engano.
  const dono = await prisma.demanda.findFirst({ where: { id, organizacaoId }, select: { id: true } })
  if (!dono) throw new Error("Demanda não encontrada nesta empresa.")
  // Conta quantos registros já existem para atribuir sequência correta
  const existingCount = await prisma.arquivo.count({
    where: { demandaId: id, tipoArquivo: "final" },
  })
  const nomeArquivo = nomeArquivoInformado ?? url.split("/").pop()?.split("?")[0] ?? "video.mp4"
  // Confere o tipo real: arquivo sem extensão passava batido e chegava ao
  // cliente como quicktime, que o Chrome não toca.
  const ehTranscode = await precisaTranscodeConferindo(url)
  const arq = await prisma.arquivo.create({
    data: {
      demandaId: id,
      tipoArquivo: "final",
      nomeArquivo,
      url,
      sequencia: existingCount + 1,
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
      // "processing" só depois de o worker ACEITAR — ver abaixo. Marcar aqui
      // deixava o arquivo eternamente "convertendo" mesmo sem worker nenhum.
    },
  })

  // .mov/HEVC → enfileira conversão para MP4 (toca em qualquer dispositivo).
  // O estado gravado reflete o que de fato aconteceu: "processing" quando o
  // worker aceitou, "sem_worker" quando não há para onde mandar. A diferença
  // importa — a segunda é um problema de configuração que precisa aparecer,
  // não um vídeo que está convertendo.
  if (ehTranscode) {
    const aceito = await enqueueTranscode({ arquivoId: arq.id, demandaId: id, sourceUrl: url })
    await prisma.arquivo.update({
      where: { id: arq.id },
      data: { transcodeStatus: aceito ? "processing" : "sem_worker" },
    }).catch(() => null)
  }
  return arq.id
}
