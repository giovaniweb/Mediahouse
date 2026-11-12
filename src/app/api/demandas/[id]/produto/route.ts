import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireDemandaOrg } from "@/lib/org"
import { fazAPeca, guardaDoCard, SEM_PERMISSAO_NO_CARD } from "@/lib/quem-envia-arquivo"

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
  // Até 12/11/2026 bastava ser da empresa para trocar os equipamentos de
  // qualquer card. A régua é a da ficha (o seletor só abre para quem edita):
  // escopo (404) e, nele, gestão, "Editar Demanda" ou quem faz a peça.
  const negado = await guardaDoCard(session, guard.organizacaoId, id, fazAPeca, SEM_PERMISSAO_NO_CARD)
  if (negado) return negado
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
