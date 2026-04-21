import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const agora = new Date()

  const alertas = await prisma.alertaIA.findMany({
    where: {
      status: "ativo",
      // TDAH: não mostrar alertas em snooze
      OR: [
        { snoozeAte: null },
        { snoozeAte: { lt: agora } },
      ],
    },
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

  // Resolver alerta (aceita "resolver" ou "action:resolver" por retrocompat)
  if ((body.acao === "resolver" || body.action === "resolver") && body.id) {
    const alerta = await prisma.alertaIA.update({
      where: { id: body.id },
      data: { status: "resolvido", resolvedAt: new Date() },
    })
    return NextResponse.json(alerta)
  }

  // Ignorar alerta
  if ((body.acao === "ignorar" || body.action === "ignorar") && body.id) {
    const alerta = await prisma.alertaIA.update({
      where: { id: body.id },
      data: { status: "ignorado" },
    })
    return NextResponse.json(alerta)
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
}

// TDAH: snooze — silenciar alerta temporariamente
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const body = await req.json()

  if (body.acao === "snooze" && body.id && body.minutos) {
    const snoozeAte = new Date(Date.now() + Number(body.minutos) * 60 * 1000)
    const alerta = await prisma.alertaIA.update({
      where: { id: body.id },
      data: { snoozeAte },
    })
    return NextResponse.json(alerta)
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
}
