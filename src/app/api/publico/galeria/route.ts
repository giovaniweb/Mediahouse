import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET /api/publico/galeria — lista vídeos finalizados com linkFinal (sem auth)
// Query params: page, limit, tipo, search
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const page = Math.max(1, parseInt(sp.get("page") ?? "1"))
  const limit = Math.min(48, Math.max(1, parseInt(sp.get("limit") ?? "24")))
  const tipo = sp.get("tipo") ?? ""
  const search = sp.get("search") ?? ""
  const skip = (page - 1) * limit

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    statusVisivel: "finalizado",
    linkFinal: { not: null },
    ...(tipo ? { tipoVideo: tipo } : {}),
    ...(search ? {
      OR: [
        { titulo: { contains: search, mode: "insensitive" } },
        { codigo: { contains: search, mode: "insensitive" } },
      ],
    } : {}),
  }

  const [total, videos] = await Promise.all([
    prisma.demanda.count({ where }),
    prisma.demanda.findMany({
      where,
      select: {
        id: true,
        codigo: true,
        titulo: true,
        tipoVideo: true,
        departamento: true,
        linkFinal: true,
        finalizadaEm: true,
        updatedAt: true,
      },
      orderBy: [
        { finalizadaEm: "desc" },
        { updatedAt: "desc" },
      ],
      skip,
      take: limit,
    }),
  ])

  return NextResponse.json({
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    videos,
  })
}
