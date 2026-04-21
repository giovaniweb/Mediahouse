import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/agenda — retorna eventos conforme papel do usuário
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { searchParams } = req.nextUrl
  const inicio = searchParams.get("inicio")
  const fim = searchParams.get("fim")
  const contexto = searchParams.get("contexto") // contourline | freelance | pessoal | sistema

  const dateFilter = inicio && fim ? {
    inicio: { gte: new Date(inicio) },
    fim: { lte: new Date(fim) },
  } : {}

  const isAdmin = session.user.tipo === "admin"
  const isVideomaker = session.user.tipo === "videomaker"
  const isGestor = ["admin", "gestor", "operacao"].includes(session.user.tipo)

  let where: Record<string, unknown> = { ...dateFilter }

  if (contexto) where.contexto = contexto

  if (isAdmin) {
    // Admin vê TUDO + seus eventos privados
    // (sem restrição adicional)
  } else if (isGestor) {
    // Gestores/operação veem eventos públicos + sistema
    where = { ...where, privado: false }
  } else if (isVideomaker) {
    // Videomaker vê apenas sua própria agenda
    // Busca o videomaker pelo email do usuário
    const videomaker = await prisma.videomaker.findFirst({
      where: { email: session.user.email ?? "" },
    })
    if (videomaker) {
      where = { ...where, videomakerId: videomaker.id, privado: false }
    } else {
      return NextResponse.json({ eventos: [] })
    }
  } else {
    // Outros usuários veem eventos do sistema
    where = { ...where, privado: false, contexto: "sistema" }
  }

  const eventos = await prisma.evento.findMany({
    where,
    include: {
      demanda: { select: { id: true, codigo: true, titulo: true } },
      usuario: { select: { nome: true } },
      videomaker: { select: { nome: true } },
    },
    orderBy: { inicio: "asc" },
  })

  return NextResponse.json({ eventos })
}

// POST /api/agenda — cria novo evento
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const body = await req.json()
  const {
    titulo, descricao, inicio, fim, diaTodo, tipo, contexto,
    privado, cor, local, demandaId, videomakerId, lembreteMinutos,
  } = body

  if (!titulo || !inicio || !fim) {
    return NextResponse.json({ error: "titulo, inicio e fim são obrigatórios" }, { status: 400 })
  }

  // Validação de permissão por contexto
  if (contexto === "pessoal" && session.user.tipo !== "admin") {
    return NextResponse.json({ error: "Agenda pessoal restrita ao admin" }, { status: 403 })
  }

  const evento = await prisma.evento.create({
    data: {
      titulo,
      descricao,
      inicio: new Date(inicio),
      fim: new Date(fim),
      diaTodo: diaTodo ?? false,
      tipo: tipo ?? "outro",
      contexto: contexto ?? "sistema",
      privado: privado ?? false,
      cor: cor ?? null,
      local: local ?? null,
      demandaId: demandaId ?? null,
      usuarioId: session.user.id,
      videomakerId: videomakerId ?? null,
      lembreteMinutos: lembreteMinutos != null ? Number(lembreteMinutos) : 60,
    },
  })

  return NextResponse.json({ evento }, { status: 201 })
}
