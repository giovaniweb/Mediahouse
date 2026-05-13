import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET /api/publico/produtos — lista produtos ativos para filtro da galeria (sem auth)
export async function GET() {
  const produtos = await prisma.produto.findMany({
    where: { ativo: true },
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
  })
  return NextResponse.json({ produtos })
}
