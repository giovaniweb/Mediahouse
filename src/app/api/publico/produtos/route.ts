import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { orgPublicaOuDaSessao } from "@/lib/org-da-requisicao"
import { declararOrg } from "@/lib/org-contexto"

// GET /api/publico/produtos?org=<slug> — produtos ativos p/ o filtro da galeria (sem auth).
// Escopado por organização: sem isso a vitrine listava o catálogo de todas as empresas.
export async function GET(req: NextRequest) {
  const { organizacaoId } = await orgPublicaOuDaSessao(req.nextUrl.searchParams.get("org"))
  if (!organizacaoId) return NextResponse.json({ produtos: [] })

  // Sob RLS a empresa precisa ser DECLARADA: rota pública não tem sessão
  // de onde deduzi-la, e sem declaração o banco devolve vazio.
  declararOrg(organizacaoId)

  const produtos = await prisma.produto.findMany({
    where: { ativo: true, organizacaoId },
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
  })
  return NextResponse.json({ produtos })
}
