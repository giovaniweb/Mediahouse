import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { orgPublica } from "@/lib/org"

// GET /api/publico/produtos?org=<slug> — produtos ativos p/ o filtro da galeria (sem auth).
// Escopado por organização: sem isso a vitrine listava o catálogo de todas as empresas.
export async function GET(req: NextRequest) {
  const organizacaoId = await orgPublica(req.nextUrl.searchParams.get("org"))
  if (!organizacaoId) return NextResponse.json({ produtos: [] })

  const produtos = await prisma.produto.findMany({
    where: { ativo: true, organizacaoId },
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
  })
  return NextResponse.json({ produtos })
}
