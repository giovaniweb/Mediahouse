import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET — lista fabricantes
export async function GET() {
  const fabricantes = await prisma.fabricante.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    include: { _count: { select: { produtos: true } } },
  })
  return NextResponse.json(fabricantes)
}

// POST — cria fabricante
export async function POST(req: NextRequest) {
  const body = await req.json()
  const nome = body.nome?.trim()
  if (!nome) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 })

  const fab = await prisma.fabricante.upsert({
    where: { nome },
    update: { ativo: true },
    create: { nome },
  })
  return NextResponse.json(fab)
}
