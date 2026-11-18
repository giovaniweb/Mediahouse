import { workerMidiaAtivo } from "@/lib/midia-worker-config"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { precisaTranscode, enqueueTranscode } from "@/lib/transcode"
import { requireDemandaOrg } from "@/lib/org"
import { requirePapel } from "@/lib/papel"

type Params = { params: Promise<{ id: string }> }

// POST /api/demandas/[id]/reconverter — força a conversão do vídeo final para MP4.
// Útil para vídeos .mov/HEVC que já existiam antes do worker.
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  // Papel na empresa ATIVA, não o `tipo` global (auditoria de 18/11/2026):
  // quem é admin numa empresa e só solicitante noutra não dispara aqui.
  const negado = requirePapel(session, "admin", "gestor")
  if (negado) return negado

  const { id } = await params
  const guard = await requireDemandaOrg(session, id)
  if (guard instanceof NextResponse) return guard
  if (workerMidiaAtivo(guard.organizacaoId)) return NextResponse.json({ error: "Conversão gerenciada pela fila de mídia; reconversão legada desativada nesta empresa." }, { status: 409 })

  // Pega o Arquivo final ativo (maior sequência) que ainda seja .mov
  const arq = await prisma.arquivo.findFirst({
    where: { demandaId: id, tipoArquivo: "final" },
    orderBy: { sequencia: "desc" },
  })

  // Fallback: demandas legadas só têm linkFinal (sem registro Arquivo)
  if (!arq) {
    const dem = await prisma.demanda.findUnique({ where: { id }, select: { linkFinal: true } })
    if (!dem?.linkFinal || !precisaTranscode(dem.linkFinal)) {
      return NextResponse.json({ error: "Nenhum vídeo .mov para converter" }, { status: 400 })
    }
    const aceito = await enqueueTranscode({ organizacaoId: guard.organizacaoId, demandaId: id, sourceUrl: dem.linkFinal })
    return NextResponse.json({ ok: true, enfileirado: aceito, legado: true })
  }

  if (arq.previewJobId) return NextResponse.json({ error: "Prévia gerenciada pelo worker v2" }, { status: 409 })
  const fonte = arq.originalUrl ?? arq.url
  if (!precisaTranscode(fonte)) {
    return NextResponse.json({ error: "Vídeo já está em MP4 (nada a converter)" }, { status: 400 })
  }

  const aceito = await enqueueTranscode({ organizacaoId: guard.organizacaoId, arquivoId: arq.id, demandaId: id, sourceUrl: fonte })

  await prisma.arquivo.update({ where: { id: arq.id }, data: { transcodeStatus: aceito ? "processing" : "sem_worker" } })
  return NextResponse.json({ ok: true, enfileirado: aceito })
}
