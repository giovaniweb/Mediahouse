import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const agora = new Date()

  const alertas = await prisma.alertaIA.findMany({
    where: {
      organizacaoId,
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
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const body = await req.json()

  // `updateMany` com o escopo no where, em vez de `update` por id: o id vem do
  // cliente, e sem o filtro qualquer usuário logado resolvia ou silenciava os
  // alertas críticos de outra empresa. Count 0 = não é desta org (ou não existe).
  const escopo = (id: string) => ({ id, organizacaoId })

  // Resolver alerta (aceita "resolver" ou "action:resolver" por retrocompat)
  if ((body.acao === "resolver" || body.action === "resolver") && body.id) {
    const r = await prisma.alertaIA.updateMany({
      where: escopo(body.id),
      data: { status: "resolvido", resolvedAt: new Date() },
    })
    if (r.count === 0) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
    return NextResponse.json({ ok: true })
  }

  // Ignorar alerta
  if ((body.acao === "ignorar" || body.action === "ignorar") && body.id) {
    const r = await prisma.alertaIA.updateMany({
      where: escopo(body.id),
      data: { status: "ignorado" },
    })
    if (r.count === 0) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
}

// TDAH: snooze — silenciar alerta temporariamente
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const body = await req.json()

  if (body.acao === "snooze" && body.id && body.minutos) {
    const snoozeAte = new Date(Date.now() + Number(body.minutos) * 60 * 1000)
    const r = await prisma.alertaIA.updateMany({
      where: { id: body.id, organizacaoId },
      data: { snoozeAte },
    })
    if (r.count === 0) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
}
