import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// POST /api/me/nf-token
// Retorna (ou cria) um token de upload de NF para a demanda indicada.
// O videomaker logado deve estar vinculado à demanda.
export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const body = await req.json()
  const { demandaId } = body as { demandaId?: string }
  if (!demandaId) return NextResponse.json({ error: "demandaId obrigatório" }, { status: 400 })

  // Busca o videomaker vinculado ao usuário
  const videomaker = await prisma.videomaker.findFirst({
    where: { usuarioId: session.user.id },
    select: { id: true },
  })
  if (!videomaker) return NextResponse.json({ error: "Perfil de videomaker não encontrado" }, { status: 404 })

  // Valida que a demanda pertence ao videomaker
  const demanda = await prisma.demanda.findFirst({
    where: { id: demandaId, videomakerId: videomaker.id },
    select: { id: true, codigo: true },
  })
  if (!demanda) return NextResponse.json({ error: "Demanda não encontrada ou não pertence a você" }, { status: 404 })

  // Busca NF existente ou cria nova
  const existing = await prisma.notaFiscalUpload.findFirst({
    where: { demandaId, videomakerId: videomaker.id },
    orderBy: { createdAt: "desc" },
  })

  if (existing) {
    return NextResponse.json({ token: existing.token, status: existing.status })
  }

  // Cria nova entrada de NF
  const nova = await prisma.notaFiscalUpload.create({
    data: {
      demandaId,
      videomakerId: videomaker.id,
      status: "pendente",
    },
  })

  return NextResponse.json({ token: nova.token, status: nova.status })
}
