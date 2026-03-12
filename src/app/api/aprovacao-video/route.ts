import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// POST /api/aprovacao-video — cria link de aprovação de vídeo para uma demanda
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const body = await req.json()
  const { demandaId, urlVideo, nomeVideo, expiresInDays } = body

  if (!demandaId || !urlVideo) {
    return NextResponse.json({ error: "demandaId e urlVideo são obrigatórios" }, { status: 400 })
  }

  const demanda = await prisma.demanda.findUnique({ where: { id: demandaId } })
  if (!demanda) return NextResponse.json({ error: "Demanda não encontrada" }, { status: 404 })

  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : null

  const aprovacao = await prisma.aprovacaoVideo.create({
    data: {
      demandaId,
      urlVideo,
      nomeVideo: nomeVideo ?? demanda.titulo,
      status: "pendente",
      expiresAt,
    },
  })

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
  const link = `${baseUrl}/aprovar/${aprovacao.token}`

  // Atualiza demanda com link do cliente
  await prisma.demanda.update({
    where: { id: demandaId },
    data: { linkCliente: link },
  })

  return NextResponse.json({ ok: true, token: aprovacao.token, link })
}
