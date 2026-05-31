import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireEventoAccess } from "@/lib/eventos-access"
import type { StatusEventoGestao } from "@prisma/client"

// GET /api/eventos/dashboard — métricas gerais do módulo
export async function GET() {
  const session = await requireEventoAccess()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const agora = new Date()
  const ATIVOS = { notIn: ["finalizado", "cancelado"] as StatusEventoGestao[] }

  const [proximos, emProducao, atrasados, finalizados, orcamentoAgg, custosEventoAgg, docsPendentes, pagamentosPendentes] =
    await Promise.all([
      prisma.eventoGestao.count({ where: { status: ATIVOS, dataInicio: { gte: agora } } }),
      prisma.eventoGestao.count({ where: { status: { in: ["producao", "execucao"] } } }),
      prisma.eventoGestao.count({ where: { status: ATIVOS, dataFim: { lt: agora } } }),
      prisma.eventoGestao.count({ where: { status: "finalizado" } }),
      prisma.eventoGestao.aggregate({ _sum: { orcamentoPrevisto: true } }),
      prisma.custoEvento.aggregate({ _sum: { valorPrevisto: true, valorReal: true } }),
      prisma.eventoGestaoDocumento.count({ where: { status: "pendente" } }),
      prisma.custoEvento.count({ where: { pago: false } }),
    ])

  // Custo audiovisual: CustoVideomaker das demandas vinculadas a eventos
  const demandasEvento = await prisma.demanda.findMany({
    where: { eventoGestaoId: { not: null } },
    select: { id: true },
  })
  const demandaIds = demandasEvento.map((d) => d.id)
  const custoAv = demandaIds.length
    ? await prisma.custoVideomaker.aggregate({ where: { demandaId: { in: demandaIds } }, _sum: { valor: true } })
    : { _sum: { valor: 0 } }

  const totalGasto = (custosEventoAgg._sum.valorReal ?? custosEventoAgg._sum.valorPrevisto ?? 0) + (custoAv._sum.valor ?? 0)

  return NextResponse.json({
    proximos,
    emProducao,
    atrasados,
    finalizados,
    totalPrevisto: orcamentoAgg._sum.orcamentoPrevisto ?? 0,
    totalGasto,
    docsPendentes,
    pagamentosPendentes,
  })
}
