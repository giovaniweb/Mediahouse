import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { escopoSocial, pedidoDaSocial } from "@/lib/social"

type Params = { params: Promise<{ id: string }> }

// PATCH /api/social/pedidos/[id] — a social muda a prioridade do próprio pedido.
// Só ela prioriza (decisão de 05/10/2026); o gestor vê o quadro sem esse controle.
export async function PATCH(req: NextRequest, { params }: Params) {
  const escopo = await escopoSocial(await auth())
  if (escopo instanceof NextResponse) return escopo
  const { id } = await params
  const pedido = await pedidoDaSocial(escopo, id)
  if (pedido instanceof NextResponse) return pedido

  const body = await req.json().catch(() => ({}))
  if (!["normal", "alta", "urgente"].includes(body.prioridade)) {
    return NextResponse.json({ error: "Prioridade inválida" }, { status: 400 })
  }
  await prisma.demanda.update({ where: { id, organizacaoId: escopo.organizacaoId }, data: { prioridade: body.prioridade } })
  return NextResponse.json({ ok: true, prioridade: body.prioridade })
}
