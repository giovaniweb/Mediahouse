import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import type { Prisma } from "@prisma/client"

// GET /api/notificacoes — alertas não lidos: broadcast (usuarioId null) +
// direcionados ao usuário logado, da empresa ativa.
//
// O filtro de empresa era CONDICIONAL: `...(organizacaoId ? [filtro] : [])`.
// Quem não tinha empresa ativa não caía numa lista vazia — caía numa consulta
// SEM filtro nenhum, e recebia o sino de notificações com o alerta de todas as
// empresas da plataforma. O ramo que parecia "tolerar o legado" era o que abria
// a porta.
//
// O `{ organizacaoId: null }` também sai: alerta sem dono deixou de existir
// quando a coluna virou NOT NULL.
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const where: Prisma.AlertaIAWhereInput = {
    status: "ativo",
    lida: false,
    organizacaoId,
    OR: [{ usuarioId: null }, { usuarioId: session.user.id }],
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

  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  if (body.id) {
    // Marca uma específica como lida — só se for do próprio usuário (ou
    // broadcast) e da org ativa. Antes, `update` por id deixava qualquer usuário
    // marcar como lida a notificação de qualquer pessoa de qualquer empresa.
    await prisma.alertaIA.updateMany({
      where: {
        id: body.id,
        organizacaoId,
        OR: [{ usuarioId: null }, { usuarioId: session.user.id }],
      },
      data: { lida: true },
    })
  } else {
    // Marca como lidas só as do próprio usuário + broadcast (não as direcionadas a outros)
    await prisma.alertaIA.updateMany({
      where: {
        status: "ativo",
        lida: false,
        organizacaoId,
        OR: [{ usuarioId: null }, { usuarioId: session.user.id }],
      },
      data: { lida: true },
    })
  }

  return NextResponse.json({ ok: true })
}
