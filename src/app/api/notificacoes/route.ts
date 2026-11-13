import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import type { Prisma } from "@prisma/client"
import { alertasDoSino } from "@/lib/escopo-sino"

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
//
// Quem vê o quê vem de `alertasDoSino` (src/lib/escopo-sino.ts): fora da
// gestão, só o que é da pessoa — os cards que ela enxerga no quadro e o que foi
// dirigido a ela. A mesma regra vale para listar, contar e marcar como lida.
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const where: Prisma.AlertaIAWhereInput = {
    AND: [await alertasDoSino(session, organizacaoId), { status: "ativo", lida: false }],
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

  // Marca uma (por id) ou todas como lidas, sempre dentro do que a pessoa vê
  // no sino. Antes, `update` por id deixava qualquer usuário marcar como lida a
  // notificação de qualquer pessoa de qualquer empresa; e o "marcar todas" de
  // uma parceira apagava do sino da gestão os alertas da empresa inteira.
  const escopo = await alertasDoSino(session, organizacaoId)
  const alvo: Prisma.AlertaIAWhereInput = typeof body.id === "string" && body.id
    ? { id: body.id }
    : { status: "ativo", lida: false }
  await prisma.alertaIA.updateMany({ where: { AND: [escopo, alvo] }, data: { lida: true } })

  return NextResponse.json({ ok: true })
}
