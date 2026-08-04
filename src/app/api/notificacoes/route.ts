import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId } from "@/lib/org"

// GET /api/notificacoes — alertas não lidos: broadcast (usuarioId null) + direcionados
// ao usuário logado, escopados à org ativa (mantém legado sem org).
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const organizacaoId = await getOrgId(session)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    status: "ativo",
    lida: false,
    AND: [
      { OR: [{ usuarioId: null }, { usuarioId: session.user.id }] },
      ...(organizacaoId ? [{ OR: [{ organizacaoId }, { organizacaoId: null }] }] : []),
    ],
  }

  const alertas = await prisma.alertaIA.findMany({
    where,
    include: {
      demanda: { select: { id: true, titulo: true, codigo: true } },
    },
    orderBy: [{ severidade: "desc" }, { createdAt: "desc" }],
    take: 20,
  })

  const total = await prisma.alertaIA.count({ where })

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
    // Marca como lidas só as do próprio usuário + broadcast (não as direcionadas a outros)
    const organizacaoId = await getOrgId(session)
    await prisma.alertaIA.updateMany({
      where: {
        status: "ativo",
        lida: false,
        AND: [
          { OR: [{ usuarioId: null }, { usuarioId: session.user.id }] },
          ...(organizacaoId ? [{ OR: [{ organizacaoId }, { organizacaoId: null }] }] : []),
        ],
      },
      data: { lida: true },
    })
  }

  return NextResponse.json({ ok: true })
}
