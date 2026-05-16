import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/campo/agenda
// Retorna eventos do Prisma Evento da semana atual do usuário logado
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const agora = new Date()
  const seteDias = new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000)

  // Buscar Videomaker vinculado ao usuário
  const vm = await prisma.videomaker.findFirst({
    where: { usuarioId: session.user.id },
    select: { id: true },
  })

  const eventos = await prisma.evento.findMany({
    where: {
      inicio: { gte: agora, lte: seteDias },
      ...(vm ? {} : {}), // admin vê todos; videomaker também (agenda pública do time)
    },
    select: {
      id: true,
      titulo: true,
      descricao: true,
      inicio: true,
      fim: true,
      local: true,
      tipo: true,
    },
    orderBy: { inicio: "asc" },
    take: 20,
  })

  // Também buscar EventoCobertura para os próximos 7 dias
  const coberturas = await prisma.eventoCobertura.findMany({
    where: {
      status: { in: ["planejamento", "em_andamento"] },
      dataInicio: { lte: seteDias },
      dataFim: { gte: agora },
      ...(vm
        ? { equipe: { some: { videomakerId: vm.id } } }
        : {}),
    },
    select: {
      id: true,
      titulo: true,
      tipo: true,
      status: true,
      dataInicio: true,
      dataFim: true,
      local: true,
      cidade: true,
      slug: true,
    },
    orderBy: { dataInicio: "asc" },
    take: 10,
  })

  return NextResponse.json({ eventos, coberturas })
}
