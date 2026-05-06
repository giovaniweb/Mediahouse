import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/me/videomaker — retorna perfil + demandas + NFs do videomaker logado
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const videomaker = await prisma.videomaker.findFirst({
    where: { usuarioId: session.user.id },
    include: {
      demandas: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          codigo: true,
          titulo: true,
          tipoVideo: true,
          statusVisivel: true,
          statusInterno: true,
          prioridade: true,
          dataLimite: true,
          dataCaptacao: true,
          linkBrutos: true,
          linkFinal: true,
          linkFolderBrutos: true,
          linkFolderFinal: true,
          finalizadaEm: true,
          createdAt: true,
        },
      },
      notasFiscais: {
        orderBy: { createdAt: "desc" },
        include: {
          demanda: { select: { codigo: true, titulo: true } },
        },
      },
    },
  })

  if (!videomaker) {
    return NextResponse.json({ videomaker: null })
  }

  return NextResponse.json({ videomaker })
}
