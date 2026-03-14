import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const vm = await prisma.videomaker.findUnique({
    where: { id },
    select: { id: true, nome: true, cidade: true, estado: true },
  })
  if (!vm) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  return NextResponse.json({ videomaker: vm })
}
