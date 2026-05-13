import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET /api/publico/galeria — lista vídeos finalizados/para_postar (sem auth)
// Query params: page, limit, tipo, search, produtoId
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const page = Math.max(1, parseInt(sp.get("page") ?? "1"))
  const limit = Math.min(48, Math.max(1, parseInt(sp.get("limit") ?? "24")))
  const tipo = sp.get("tipo") ?? ""
  const search = sp.get("search") ?? ""
  const produtoId = sp.get("produtoId") ?? ""
  const skip = (page - 1) * limit

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    statusVisivel: { in: ["finalizado", "para_postar"] },
    linkFinal: { not: null },
    ...(tipo ? { tipoVideo: tipo } : {}),
    ...(produtoId ? { produtos: { some: { produtoId } } } : {}),
    ...(search ? {
      OR: [
        { titulo: { contains: search, mode: "insensitive" } },
        { codigo: { contains: search, mode: "insensitive" } },
        { departamento: { contains: search, mode: "insensitive" } },
        { produtos: { some: { produto: { nome: { contains: search, mode: "insensitive" } } } } },
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
        thumbnailUrl: true,
        finalizadaEm: true,
        updatedAt: true,
        produtos: {
          select: { produto: { select: { id: true, nome: true } } },
          take: 1,
        },
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
    videos: videos.map((v) => ({
      id: v.id,
      codigo: v.codigo,
      titulo: v.titulo,
      tipoVideo: v.tipoVideo,
      departamento: v.departamento,
      linkFinal: v.linkFinal,
      thumbnailUrl: v.thumbnailUrl ?? null,
      finalizadaEm: v.finalizadaEm,
      updatedAt: v.updatedAt,
      produto: v.produtos[0]?.produto?.nome ?? null,
      produtoId: v.produtos[0]?.produto?.id ?? null,
    })),
  })
}
