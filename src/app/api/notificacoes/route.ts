import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/notificacoes — retorna alertas não lidos para o usuário logado
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const alertas = await prisma.alertaIA.findMany({
    where: { status: "ativo", lida: false },
    include: {
      demanda: { select: { id: true, titulo: true, codigo: true } },
    },
    orderBy: [{ severidade: "desc" }, { createdAt: "desc" }],
    take: 20,
  })

  const total = await prisma.alertaIA.count({
    where: { status: "ativo", lida: false },
  })

  return NextResponse.json({ alertas, total })
}

// PATCH /api/notificacoes — marca todas como lidas
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const body = await req.json().catch(() => ({}))

  if (body.id) {
    // Marca uma específica como lida
    await prisma.alertaIA.update({
      where: { id: body.id },
      data: { lida: true },
    })
  } else {
    // Marca todas como lidas
    await prisma.alertaIA.updateMany({
      where: { status: "ativo", lida: false },
      data: { lida: true },
    })
  }

  return NextResponse.json({ ok: true })
}
