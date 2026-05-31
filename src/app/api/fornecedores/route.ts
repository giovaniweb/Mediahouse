import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireEventoAccess } from "@/lib/eventos-access"
import type { CategoriaFornecedor } from "@prisma/client"

// GET /api/fornecedores — lista
export async function GET(req: NextRequest) {
  const session = await requireEventoAccess("gerenciarFornecedores")
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const categoria = sp.get("categoria")
  const search = sp.get("search")

  const fornecedores = await prisma.fornecedor.findMany({
    where: {
      ...(categoria ? { categoria: categoria as CategoriaFornecedor } : {}),
      ...(search
        ? { OR: [{ nome: { contains: search, mode: "insensitive" } }, { cnpj: { contains: search } }] }
        : {}),
    },
    include: { _count: { select: { produtos: true, custos: true } } },
    orderBy: { nome: "asc" },
  })
  return NextResponse.json({ fornecedores })
}

// POST /api/fornecedores
export async function POST(req: NextRequest) {
  const session = await requireEventoAccess("gerenciarFornecedores")
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const body = await req.json()
  if (!body.nome?.trim()) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 })

  const fornecedor = await prisma.fornecedor.create({
    data: {
      nome: body.nome.trim(),
      contato: body.contato ?? null,
      cnpj: body.cnpj ?? null,
      telefone: body.telefone ?? null,
      email: body.email ?? null,
      cidade: body.cidade ?? null,
      estado: body.estado ?? null,
      categoria: (body.categoria ?? "outros") as CategoriaFornecedor,
      dadosBancarios: body.dadosBancarios ?? null,
      pixKey: body.pixKey ?? null,
      observacoes: body.observacoes ?? null,
    },
  })
  return NextResponse.json({ fornecedor }, { status: 201 })
}
