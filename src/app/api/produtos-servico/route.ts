import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireEventoAccess } from "@/lib/eventos-access"
import type { UnidadeMedida } from "@prisma/client"
import { lerNumero, lerInteiro } from "@/lib/numeros"

// GET /api/produtos-servico — catálogo
export async function GET(req: NextRequest) {
  const session = await requireEventoAccess("gerenciarFornecedores")
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const search = req.nextUrl.searchParams.get("search")
  const itens = await prisma.produtoServicoEvento.findMany({
    where: {
      ativo: true,
      ...(search ? { nome: { contains: search, mode: "insensitive" } } : {}),
    },
    include: { fornecedor: { select: { id: true, nome: true } } },
    orderBy: { nome: "asc" },
  })
  return NextResponse.json({ itens })
}

// POST /api/produtos-servico
export async function POST(req: NextRequest) {
  const session = await requireEventoAccess("gerenciarFornecedores")
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const body = await req.json()
  if (!body.nome?.trim()) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 })

  const item = await prisma.produtoServicoEvento.create({
    data: {
      nome: body.nome.trim(),
      categoria: body.categoria ?? null,
      fornecedorId: body.fornecedorId || null,
      valorUnitario: lerNumero(body.valorUnitario),
      unidadeMedida: (body.unidadeMedida ?? "unidade") as UnidadeMedida,
      quantidadeMinima: lerInteiro(body.quantidadeMinima),
      prazoMedioDias: lerInteiro(body.prazoMedioDias),
      observacoes: body.observacoes ?? null,
    },
  })
  return NextResponse.json({ item }, { status: 201 })
}
