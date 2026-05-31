import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireEventoAccess } from "@/lib/eventos-access"
import type { CategoriaDocumento } from "@prisma/client"

type Params = { params: Promise<{ id: string }> }

// POST — adiciona documento (com link externo ou url já enviada)
export async function POST(req: NextRequest, { params }: Params) {
  const session = await requireEventoAccess()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  if (!body.nome?.trim()) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 })

  const documento = await prisma.eventoGestaoDocumento.create({
    data: {
      eventoId: id,
      nome: body.nome.trim(),
      categoria: (body.categoria ?? "outros") as CategoriaDocumento,
      url: body.url ?? null,
      linkExterno: body.linkExterno ?? null,
      prazo: body.prazo ? new Date(body.prazo) : null,
      status: body.url || body.linkExterno ? "enviado" : "pendente",
      observacoes: body.observacoes ?? null,
    },
  })
  return NextResponse.json({ documento }, { status: 201 })
}

// PATCH — atualiza status/url
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await requireEventoAccess()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  await params
  const body = await req.json()
  if (!body.id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 })
  await prisma.eventoGestaoDocumento.update({
    where: { id: body.id },
    data: {
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.url !== undefined ? { url: body.url } : {}),
      ...(body.linkExterno !== undefined ? { linkExterno: body.linkExterno } : {}),
      ...(body.observacoes !== undefined ? { observacoes: body.observacoes } : {}),
    },
  })
  return NextResponse.json({ ok: true })
}

// DELETE ?docId=
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await requireEventoAccess()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  await params
  const docId = req.nextUrl.searchParams.get("docId")
  if (!docId) return NextResponse.json({ error: "docId obrigatório" }, { status: 400 })
  await prisma.eventoGestaoDocumento.delete({ where: { id: docId } })
  return NextResponse.json({ ok: true })
}
