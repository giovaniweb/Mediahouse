import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"

// Templates de checklist, por empresa.
//
// A tabela não tinha coluna de organização: o template criado por uma empresa
// aparecia na lista de todas. Em produção ela está vazia — o recurso nunca foi
// usado — mas a rota está no ar e aceita POST, então o vazamento era só uma
// questão de alguém cadastrar o primeiro.

// GET — lista templates da empresa
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const templates = await prisma.checklistTemplate.findMany({
    where: { organizacaoId, ativo: true },
    include: { itens: { orderBy: { ordem: "asc" } } },
    orderBy: { nome: "asc" },
  })

  return NextResponse.json({ templates })
}

// POST — cria template + itens
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const body = await req.json()
  const { nome, tipoVideo, papel, itens } = body

  if (!nome?.trim()) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 })

  const template = await prisma.checklistTemplate.create({
    data: {
      organizacaoId,
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
