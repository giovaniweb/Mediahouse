import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { enqueueTranscode } from "@/lib/transcode"

// POST /api/admin/transcode-hevc
// Enfileira a conversão para MP4 de todos os vídeos finais .mov/.qt que ainda não foram convertidos.
export async function POST(req: NextRequest) {
  const session = await auth()
  const tipo = (session?.user as { tipo?: string } | undefined)?.tipo
  if (!session || !["admin", "gestor"].includes(tipo ?? "")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 })
  }

  // Arquivos finais .mov/.qt ainda não convertidos (transcodeStatus != done)
  const arquivos = await prisma.arquivo.findMany({
    where: {
      tipoArquivo: "final",
      OR: [{ url: { endsWith: ".mov" } }, { url: { endsWith: ".MOV" } }, { url: { endsWith: ".qt" } }],
      NOT: { transcodeStatus: "done" },
    },
    select: { id: true, demandaId: true, url: true },
  })

  let enfileirados = 0
  for (const a of arquivos) {
    await prisma.arquivo.update({ where: { id: a.id }, data: { transcodeStatus: "processing" } }).catch(() => null)
    await enqueueTranscode({ arquivoId: a.id, demandaId: a.demandaId, sourceUrl: a.url })
    enfileirados++
  }

  // Demandas legadas: linkFinal .mov sem registro Arquivo final
  const legadas = await prisma.demanda.findMany({
    where: {
      OR: [{ linkFinal: { endsWith: ".mov" } }, { linkFinal: { endsWith: ".MOV" } }, { linkFinal: { endsWith: ".qt" } }],
      arquivos: { none: { tipoArquivo: "final" } },
    },
    select: { id: true, linkFinal: true },
  })
  for (const d of legadas) {
    if (!d.linkFinal) continue
    await enqueueTranscode({ demandaId: d.id, sourceUrl: d.linkFinal })
    enfileirados++
  }

  return NextResponse.json({ ok: true, enfileirados })
}
