import { requireAcesso } from "@/lib/acesso"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET /api/relatorios — lista relatórios salvos
export async function GET(req: NextRequest) {
  const acesso = await requireAcesso("verRelatorios")
  if (acesso instanceof NextResponse) return acesso
  if (!acesso.permissoes.verCustos) return NextResponse.json({ error: "Este relatório contém dados financeiros" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const tipo = searchParams.get("tipo")
  const limite = parseInt(searchParams.get("limite") ?? "20")

  const { organizacaoId } = acesso

  const relatorios = await prisma.relatorioIA.findMany({
    where: { organizacaoId, ...(tipo && { tipo: tipo as never }) },
    orderBy: { createdAt: "desc" },
    take: limite,
    select: {
      id: true,
      tipo: true,
      periodo: true,
      tokens: true,
      modelo: true,
      createdAt: true,
      conteudo: true,
    },
  })

  return NextResponse.json({ relatorios })
}
