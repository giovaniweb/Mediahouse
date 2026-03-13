import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/relatorios — lista relatórios salvos
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const tipo = searchParams.get("tipo")
  const limite = parseInt(searchParams.get("limite") ?? "20")

  const relatorios = await prisma.relatorioIA.findMany({
    where: { ...(tipo && { tipo: tipo as never }) },
    orderBy: { createdAt: "desc" },
    take: limite,
    select: {
      id: true,
      tipo: true,
      periodo: true,
      tokens: true,
      modelo: true,
      createdAt: true,
      conteudo: true,
    },
  })

  return NextResponse.json({ relatorios })
}
