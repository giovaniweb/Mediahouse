import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireDemandaOrg } from "@/lib/org"
import { permissoesEfetivas } from "@/lib/permissoes-server"
import { podePermissao } from "@/lib/permissoes"

type Params = { params: Promise<{ id: string }> }

// PATCH /api/demandas/[id]/posicao
// Body: { posicaoKanban: number }
// Atualiza a posição do card dentro da sua coluna
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const guard = await requireDemandaOrg(session, id)
  if (guard instanceof NextResponse) return guard
  const vinculo = await permissoesEfetivas(session.user.id, guard.organizacaoId)
  if (!vinculo || (vinculo.papel !== "admin" && vinculo.papel !== "gestor" && !podePermissao(vinculo.permissoes, "moverKanban"))) {
    return NextResponse.json({ error: "Sem permissão para reordenar demandas" }, { status: 403 })
  }
  const body = await req.json().catch(() => null)
  const posicaoKanban = body?.posicaoKanban

  if (!Number.isSafeInteger(posicaoKanban) || posicaoKanban < 0 || posicaoKanban > 2147483647) {
    return NextResponse.json({ error: "posicaoKanban deve ser um inteiro não negativo" }, { status: 400 })
  }

  await prisma.demanda.update({
    where: { id },
    data: { posicaoKanban },
  })

  return NextResponse.json({ ok: true })
}
