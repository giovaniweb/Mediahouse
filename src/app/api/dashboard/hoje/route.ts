import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/dashboard/hoje — dados para o painel "Hoje em Foco" (TDAH)
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const agora = new Date()
  const inicioDia = new Date(agora)
  inicioDia.setHours(0, 0, 0, 0)
  const fimDia = new Date(agora)
  fimDia.setHours(23, 59, 59, 999)
  const amanha = new Date(agora)
  amanha.setDate(amanha.getDate() + 1)
  const fimAmanha = new Date(amanha)
  fimAmanha.setHours(23, 59, 59, 999)

  const [eventosHoje, demandasCriticas, custosVencendo, alertasCriticos] = await Promise.all([
    // Eventos de hoje ordenados por horário
    prisma.evento.findMany({
      where: {
        inicio: { gte: inicioDia, lte: fimDia },
        status: { in: ["agendado", "confirmado", "em_andamento"] },
      },
      include: {
        videomaker: { select: { nome: true } },
        demanda: { select: { codigo: true, titulo: true } },
      },
      orderBy: { inicio: "asc" },
      take: 5,
    }),

    // Demandas com prazo hoje ou amanhã
    prisma.demanda.findMany({
      where: {
        dataLimite: { gte: inicioDia, lte: fimAmanha },
        statusVisivel: { notIn: ["finalizado"] },
      },
      select: {
        id: true,
        codigo: true,
        titulo: true,
        dataLimite: true,
        prioridade: true,
        videomaker: { select: { nome: true } },
      },
      orderBy: { dataLimite: "asc" },
      take: 5,
    }),

    // Cobranças vencidas ou vencendo hoje
    prisma.custoVideomaker.findMany({
      where: {
        pago: false,
        dataVencimento: { not: null, lte: fimDia },
      },
      include: {
        videomaker: { select: { nome: true } },
      },
      orderBy: { dataVencimento: "asc" },
      take: 5,
    }),

    // Alertas críticos ativos (respeitando snooze)
    prisma.alertaIA.findMany({
      where: {
        status: "ativo",
        severidade: "critico",
        OR: [{ snoozeAte: null }, { snoozeAte: { lt: agora } }],
      },
      include: {
        demanda: { select: { id: true, codigo: true, titulo: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ])

  return NextResponse.json({
    eventosHoje,
    demandasCriticas,
    custosVencendo,
    alertasCriticos,
    geradoEm: agora.toISOString(),
  })
}
