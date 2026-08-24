import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { salarioDaEmpresa } from "@/lib/editor-vinculo"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const { id } = await params

  // O perfil é da REDE; quem define se ESTA empresa enxerga é o vínculo — e o
  // salário sai dele, não do perfil. `findFirst` com o vínculo no where resolve
  // as duas coisas: sem vínculo, não encontra, e devolve 404.
  const perfil = await prisma.editor.findFirst({
    where: { id, vinculos: { some: { organizacaoId } } },
    select: { id: true, nome: true },
  })
  if (!perfil) return NextResponse.json({ error: "Editor não encontrado" }, { status: 404 })
  const editor = { ...perfil, salario: await salarioDaEmpresa(id, organizacaoId) }

  // All demands assigned to this editor
  const demandas = await prisma.demanda.findMany({
    where: { editorId: id, organizacaoId },
    select: {
      id: true,
      statusVisivel: true,
      createdAt: true,
      updatedAt: true,
      tipoVideo: true,
      classificacao: true,
    },
  })

  const totalDemandas = demandas.length
  const concluidas = demandas.filter((d) => d.statusVisivel === "finalizado")
  const concluidasCount = concluidas.length
  const taxaConclusao = totalDemandas > 0 ? Math.round((concluidasCount / totalDemandas) * 100) : 0

  // Average days to complete
  let totalDias = 0
  for (const d of concluidas) {
    const dias = Math.floor((d.updatedAt.getTime() - d.createdAt.getTime()) / (1000 * 60 * 60 * 24))
    totalDias += dias
  }
  const tempoMedioDias = concluidasCount > 0 ? Math.round(totalDias / concluidasCount) : 0

  // Costs from demands (via CustoVideomaker linked to the editor's demands)
  const demandaIds = demandas.map((d) => d.id)
  const custos = demandaIds.length > 0
    ? await prisma.custoVideomaker.aggregate({
        where: { demandaId: { in: demandaIds } },
        _sum: { valor: true },
        _count: true,
      })
    : { _sum: { valor: null }, _count: 0 }
  const custoTotal = custos._sum.valor ?? 0
  const custoMedioPorVideo = concluidasCount > 0 ? custoTotal / concluidasCount : 0

  // Monthly performance (last 6 months)
  const now = new Date()
  const performanceMensal = []
  for (let i = 5; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59)
    const monthStr = monthDate.toISOString().slice(0, 7)

    const monthDemandas = demandas.filter((d) => d.createdAt >= monthDate && d.createdAt <= monthEnd)
    const monthConcluidas = monthDemandas.filter((d) => d.statusVisivel === "finalizado")

    performanceMensal.push({
      month: monthStr,
      total: monthDemandas.length,
      concluidas: monthConcluidas.length,
      taxa: monthDemandas.length > 0 ? Math.round((monthConcluidas.length / monthDemandas.length) * 100) : 0,
    })
  }

  // B2C/B2B breakdown
  const b2cCount = demandas.filter((d) => d.classificacao === "b2c").length
  const b2bCount = demandas.filter((d) => d.classificacao === "b2b").length

  // By type
  const porTipo: Record<string, number> = {}
  for (const d of demandas) {
    porTipo[d.tipoVideo] = (porTipo[d.tipoVideo] || 0) + 1
  }

  return NextResponse.json({
    editor,
    totalDemandas,
    concluidas: concluidasCount,
    taxaConclusao,
    tempoMedioDias,
    custoTotal,
    custoMedioPorVideo,
    performanceMensal,
    metaPerformance: 80,
    acimaDaMeta: taxaConclusao >= 80,
    b2cCount,
    b2bCount,
    porTipo,
  })
}
