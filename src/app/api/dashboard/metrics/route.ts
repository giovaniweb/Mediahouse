import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { calcularCargaTotal, avaliarSobrecarga } from "@/lib/peso-demanda"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const hoje = new Date()
  const inicioDia = new Date(hoje.setHours(0, 0, 0, 0))
  const fimDia = new Date(hoje.setHours(23, 59, 59, 999))
  const inicioSemana = new Date()
  inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay())
  const fimSemana = new Date(inicioSemana)
  fimSemana.setDate(fimSemana.getDate() + 6)
  const em7Dias = new Date()
  em7Dias.setDate(em7Dias.getDate() + 7)

  const [
    novasHoje,
    urgentesAtivas,
    emEdicao,
    aguardandoAprovacao,
    paraPostar,
    atrasadas,
    captacoesSemana,
    expiracoesSemana,
    alertasAtivos,
    editores,
  ] = await Promise.all([
    prisma.demanda.count({
      where: { createdAt: { gte: inicioDia, lte: fimDia } },
    }),
    prisma.demanda.count({
      where: {
        prioridade: "urgente",
        statusVisivel: { notIn: ["finalizado"] },
      },
    }),
    prisma.demanda.count({ where: { statusVisivel: "edicao" } }),
    prisma.demanda.count({ where: { statusVisivel: "aprovacao" } }),
    prisma.demanda.count({ where: { statusVisivel: "para_postar" } }),
    prisma.demanda.count({
      where: {
        dataLimite: { lt: new Date() },
        statusVisivel: { notIn: ["finalizado"] },
      },
    }),
    prisma.demanda.count({
      where: {
        dataCaptacao: { gte: inicioSemana, lte: fimSemana },
      },
    }),
    prisma.demanda.count({
      where: {
        dataExpiracao: { gte: new Date(), lte: em7Dias },
        statusVisivel: "finalizado",
      },
    }),
    prisma.alertaIA.findMany({
      where: { status: "ativo" },
      include: { demanda: { select: { id: true, titulo: true, codigo: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.editor.findMany({
      where: { status: "ativo" },
      include: {
        demandas: {
          where: { statusVisivel: { notIn: ["finalizado"] } },
          select: { pesoDemanda: true },
        },
      },
    }),
  ])

  const cargaEditores = editores.map((editor) => ({
    editor: {
      id: editor.id,
      nome: editor.nome,
      cargaLimite: editor.cargaLimite,
    },
    demandasAtivas: editor.demandas.length,
    cargaTotal: calcularCargaTotal(editor.demandas),
    status: avaliarSobrecarga(
      calcularCargaTotal(editor.demandas),
      editor.cargaLimite
    ),
  }))

  return NextResponse.json({
    metricas: {
      novasHoje,
      urgentesAtivas,
      emEdicao,
      aguardandoAprovacao,
      paraPostar,
      atrasadas,
      captacoesSemana,
      expiracoesSemana,
    },
    alertasAtivos,
    cargaEditores,
  })
}
