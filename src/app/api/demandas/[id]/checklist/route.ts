import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireDemandaOrg } from "@/lib/org"
import { fazAPeca, guardaDoCard, guardaDoEscopo, podeMarcarChecklist, SEM_PERMISSAO_NO_CARD } from "@/lib/quem-envia-arquivo"

// Até 12/11/2026 estas rotas conferiam só a empresa: qualquer pessoa logada
// nela lia, criava, marcava e apagava itens de qualquer card. Agora: ler, quem
// tem o card no escopo (como a ficha); fora dele, 404. Criar, renomear e apagar,
// a gestão, quem tem "Editar Demanda" ou quem faz a peça. Marcar, também o
// videomaker e o social do card (lib/quem-envia-arquivo: podeMarcarChecklist).

type Params = { params: Promise<{ id: string }> }

// GET — lista itens do checklist da demanda
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const guard = await requireDemandaOrg(session, id)
  if (guard instanceof NextResponse) return guard
  const fora = await guardaDoEscopo(session, guard.organizacaoId, id)
  if (fora) return fora
  const itens = await prisma.checklistItem.findMany({
    where: { demandaId: id },
    orderBy: [{ grupo: "asc" }, { ordem: "asc" }],
  })

  // Agrupar por grupo
  const grupos: Record<string, typeof itens> = {}
  for (const item of itens) {
    const g = item.grupo ?? "geral"
    if (!grupos[g]) grupos[g] = []
    grupos[g].push(item)
  }

  const total = itens.length
  const concluidos = itens.filter(i => i.concluido).length

  return NextResponse.json({ itens, grupos, total, concluidos })
}

// POST — adicionar item ao checklist
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const guard = await requireDemandaOrg(session, id)
  if (guard instanceof NextResponse) return guard
  const negado = await guardaDoCard(session, guard.organizacaoId, id, fazAPeca, SEM_PERMISSAO_NO_CARD)
  if (negado) return negado
  const body = await req.json()
  const { texto, grupo } = body

  if (!texto?.trim()) {
    return NextResponse.json({ error: "Texto obrigatório" }, { status: 400 })
  }

  // Pega a maior ordem do grupo para adicionar no final
  const ultimo = await prisma.checklistItem.findFirst({
    where: { demandaId: id, grupo: grupo ?? "geral" },
    orderBy: { ordem: "desc" },
    select: { ordem: true },
  })

  const item = await prisma.checklistItem.create({
    data: {
      demandaId: id,
      texto: texto.trim(),
      grupo: grupo ?? "geral",
      ordem: (ultimo?.ordem ?? -1) + 1,
    },
  })

  return NextResponse.json(item, { status: 201 })
}

// PATCH — toggle concluido ou editar texto
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const guard = await requireDemandaOrg(session, id)
  if (guard instanceof NextResponse) return guard
  const body = await req.json()
  const { itemId, concluido, texto } = body
  // Só marcar (sem trocar o texto) é a régua mais larga: o videomaker e o social do card também.
  const soMarca = texto === undefined
  const negado = await guardaDoCard(session, guard.organizacaoId, id, soMarca ? podeMarcarChecklist : fazAPeca, SEM_PERMISSAO_NO_CARD)
  if (negado) return negado

  if (!itemId) return NextResponse.json({ error: "itemId obrigatório" }, { status: 400 })

  // Garante que o item pertence a esta demanda (que já é da org da sessão)
  const itemDono = await prisma.checklistItem.findUnique({ where: { id: itemId }, select: { demandaId: true } })
  if (itemDono?.demandaId !== id) return NextResponse.json({ error: "Item não encontrado" }, { status: 404 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {}
  if (typeof concluido === "boolean") {
    data.concluido = concluido
    data.concluidoEm = concluido ? new Date() : null
    data.concluidoPor = concluido ? (session.user.name ?? session.user.email ?? "Usuário") : null
  }
  if (texto !== undefined) data.texto = texto

  const item = await prisma.checklistItem.update({
    where: { id: itemId },
    data,
  })

  return NextResponse.json(item)
}

// DELETE — remover item
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const guard = await requireDemandaOrg(session, id)
  if (guard instanceof NextResponse) return guard
  const negado = await guardaDoCard(session, guard.organizacaoId, id, fazAPeca, SEM_PERMISSAO_NO_CARD)
  if (negado) return negado
  const body = await req.json()
  const { itemId } = body

  if (!itemId) return NextResponse.json({ error: "itemId obrigatório" }, { status: 400 })

  // Garante que o item pertence a esta demanda
  const itemDono = await prisma.checklistItem.findUnique({ where: { id: itemId }, select: { demandaId: true } })
  if (itemDono?.demandaId !== id) return NextResponse.json({ error: "Item não encontrado" }, { status: 404 })

  await prisma.checklistItem.delete({ where: { id: itemId } })

  return NextResponse.json({ ok: true })
}
