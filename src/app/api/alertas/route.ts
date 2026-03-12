import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const alertas = await prisma.alertaIA.findMany({
    where: { status: "ativo" },
    include: {
      demanda: { select: { id: true, titulo: true, codigo: true, prioridade: true } },
    },
    orderBy: [{ severidade: "desc" }, { createdAt: "desc" }],
  })

  return NextResponse.json({ alertas })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const body = await req.json()

  // Resolver alerta
  if (body.action === "resolver" && body.id) {
    const alerta = await prisma.alertaIA.update({
      where: { id: body.id },
      data: { status: "resolvido", resolvedAt: new Date() },
    })
    return NextResponse.json(alerta)
  }

  // Ignorar alerta
  if (body.action === "ignorar" && body.id) {
    const alerta = await prisma.alertaIA.update({
      where: { id: body.id },
      data: { status: "ignorado" },
    })
    return NextResponse.json(alerta)
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
}
