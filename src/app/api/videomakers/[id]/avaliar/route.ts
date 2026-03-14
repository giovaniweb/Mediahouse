import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// POST /api/videomakers/[id]/avaliar — avaliação interna ou pública (via QR)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const { nota, comentario, demandaId, origem } = body

  if (!nota || nota < 1 || nota > 5) {
    return NextResponse.json({ error: "Nota deve ser entre 1 e 5" }, { status: 400 })
  }

  const vm = await prisma.videomaker.findUnique({ where: { id } })
  if (!vm) return NextResponse.json({ error: "Videomaker não encontrado" }, { status: 404 })

  // Criar avaliação
  const avaliacao = await prisma.avaliacaoVideomaker.create({
    data: {
      videomakerId: id,
      nota: parseInt(nota),
      comentario: comentario ?? null,
      demandaId: demandaId ?? null,
      origem: origem ?? "interno",
    },
  })

  // Recalcular média
  const todasAvaliacoes = await prisma.avaliacaoVideomaker.findMany({
    where: { videomakerId: id },
    select: { nota: true },
  })
  const media = todasAvaliacoes.reduce((sum, a) => sum + a.nota, 0) / todasAvaliacoes.length

  await prisma.videomaker.update({
    where: { id },
    data: { avaliacao: Math.round(media * 10) / 10 },
  })

  return NextResponse.json({ avaliacao, novaMedia: Math.round(media * 10) / 10 }, { status: 201 })
}

// GET /api/videomakers/[id]/avaliar — listar avaliações
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const avaliacoes = await prisma.avaliacaoVideomaker.findMany({
    where: { videomakerId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  const media = avaliacoes.length
    ? avaliacoes.reduce((s, a) => s + a.nota, 0) / avaliacoes.length
    : 0

  return NextResponse.json({ avaliacoes, media: Math.round(media * 10) / 10, total: avaliacoes.length })
}
