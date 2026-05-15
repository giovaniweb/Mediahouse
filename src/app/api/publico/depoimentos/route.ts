import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET /api/publico/depoimentos — público, sem auth
export async function GET() {
  try {
    const depoimentos = await prisma.depoimento.findMany({
      where: { ativo: true },
      orderBy: { ordem: "asc" },
      select: {
        id: true,
        nome: true,
        cidade: true,
        videoUrl: true,
        thumbnailUrl: true,
        descricao: true,
      },
    })
    return NextResponse.json({ depoimentos })
  } catch (e) {
    console.error("[Depoimentos] Erro ao buscar:", e)
    return NextResponse.json({ depoimentos: [] })
  }
}
