import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET — lista templates de checklist
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const templates = await prisma.checklistTemplate.findMany({
    where: { ativo: true },
    include: { itens: { orderBy: { ordem: "asc" } } },
    orderBy: { nome: "asc" },
  })

  return NextResponse.json({ templates })
}

// POST — cria template + itens
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const body = await req.json()
  const { nome, tipoVideo, papel, itens } = body

  if (!nome?.trim()) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 })

  const template = await prisma.checklistTemplate.create({
    data: {
      nome: nome.trim(),
      tipoVideo: tipoVideo || null,
      papel: papel || null,
      itens: {
        create: (itens ?? []).map((texto: string, idx: number) => ({
          texto,
          ordem: idx,
        })),
      },
    },
    include: { itens: true },
  })

  return NextResponse.json(template, { status: 201 })
}
