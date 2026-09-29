import { apresentarRelatorio, tiposRelatorio } from "@/lib/relatorio-contrato"
import { requireAcesso } from "@/lib/acesso"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET /api/relatorios — lista relatórios salvos
export async function GET(req: NextRequest) {
  const acesso = await requireAcesso("verRelatorios")
  if (acesso instanceof NextResponse) return acesso

  const { searchParams } = new URL(req.url)
  const tipo = searchParams.get("tipo")
  const limite = Number(searchParams.get("limite") ?? "20")
  if (!Number.isInteger(limite) || limite < 1 || limite > 100 || (tipo && !tiposRelatorio.safeParse(tipo).success)) return NextResponse.json({ error: "Filtro inválido" }, { status: 400 })

  const { organizacaoId } = acesso

  const relatorios = await prisma.relatorioIA.findMany({
    where: { organizacaoId, ...(tipo && { tipo: tipo as never }) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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

  return NextResponse.json({ relatorios: relatorios.map(({ conteudo, ...r }) => ({ ...r, apresentacao: apresentarRelatorio(conteudo) })).filter(r => acesso.permissoes.verCustos || (r.apresentacao.snapshot?.metricas && r.apresentacao.snapshot.custoTotal === null && r.apresentacao.snapshot.custoPorVideo === null)) }, { headers: { "Cache-Control": "private, no-store" } })
}
