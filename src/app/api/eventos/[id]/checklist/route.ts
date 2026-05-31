import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireEventoAccess } from "@/lib/eventos-access"
import { recalcularConclusao } from "@/lib/eventos-conclusao"

type Params = { params: Promise<{ id: string }> }

// POST — adiciona tarefa
export async function POST(req: NextRequest, { params }: Params) {
  const session = await requireEventoAccess()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  if (!body.titulo?.trim()) return NextResponse.json({ error: "Título obrigatório" }, { status: 400 })

  const tarefa = await prisma.eventoGestaoChecklist.create({
    data: {
      eventoId: id,
      titulo: body.titulo.trim(),
      descricao: body.descricao ?? null,
      categoria: body.categoria ?? null,
      prioridade: body.prioridade ?? "media",
      prazo: body.prazo ? new Date(body.prazo) : null,
      uploadObrigatorio: !!body.uploadObrigatorio,
    },
  })
  await recalcularConclusao(id)
  return NextResponse.json({ tarefa }, { status: 201 })
}

// PATCH — toggle/atualiza
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await requireEventoAccess()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  if (!body.id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 })

  await prisma.eventoGestaoChecklist.update({
    where: { id: body.id },
    data: {
      ...(body.concluido !== undefined ? { concluido: body.concluido, concluidoEm: body.concluido ? new Date() : null, status: body.concluido ? "concluido" : "pendente" } : {}),
      ...(body.titulo !== undefined ? { titulo: body.titulo } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.prioridade !== undefined ? { prioridade: body.prioridade } : {}),
    },
  })
  await recalcularConclusao(id)
  return NextResponse.json({ ok: true })
}

// DELETE ?itemId=
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await requireEventoAccess()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const { id } = await params
  const itemId = req.nextUrl.searchParams.get("itemId")
  if (!itemId) return NextResponse.json({ error: "itemId obrigatório" }, { status: 400 })
  await prisma.eventoGestaoChecklist.delete({ where: { id: itemId } })
  await recalcularConclusao(id)
  return NextResponse.json({ ok: true })
}
