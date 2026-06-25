import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireDemandaOrg } from "@/lib/org"

type Params = { params: Promise<{ id: string }> }

// POST /api/demandas/[id]/produto — define os produtos vinculados (multi).
// body: { produtoIds: string[] }  (compat: produtoId string único)
// Substitui o conjunto de vínculos. Valida que todos pertencem à org (sem cross-org).
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const guard = await requireDemandaOrg(session, id)
  if (guard instanceof NextResponse) return guard
  const { organizacaoId } = guard
  const body = await req.json()

  const ids = Array.from(new Set([
    ...((body.produtoIds as string[] | undefined) ?? []),
    ...(body.produtoId ? [body.produtoId as string] : []),
  ]))

  // Só vincula produtos da própria organização (evita cross-org)
  const validos = ids.length > 0
    ? (await prisma.produto.findMany({ where: { id: { in: ids }, organizacaoId }, select: { id: true } })).map((p) => p.id)
    : []

  // Substitui o conjunto: remove os atuais e recria os válidos
  await prisma.demandaProduto.deleteMany({ where: { demandaId: id } })
  if (validos.length > 0) {
    await prisma.demandaProduto.createMany({
      data: validos.map((produtoId) => ({ demandaId: id, produtoId })),
      skipDuplicates: true,
    })
  }

  return NextResponse.json({ ok: true, produtoIds: validos })
}
