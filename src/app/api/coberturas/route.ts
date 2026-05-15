import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

async function requireAuth() {
  const session = await auth()
  if (!session?.user) return null
  return session
}

function gerarSlug(titulo: string): string {
  return (
    titulo
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 60) +
    "-" +
    Date.now().toString(36)
  )
}

const CHECKLIST_BASE = [
  { texto: "Camera principal carregada", categoria: "equipamento" as const },
  { texto: "Cartões de memória formatados", categoria: "equipamento" as const },
  { texto: "Tripé e estabilizador conferidos", categoria: "equipamento" as const },
  { texto: "Áudio (microfone lapela/boom)", categoria: "equipamento" as const },
  { texto: "Carregadores e baterias reserva", categoria: "equipamento" as const },
  { texto: "Credenciamento confirmado", categoria: "logistica" as const },
  { texto: "Briefing do dia enviado à equipe", categoria: "logistica" as const },
  { texto: "Pasta Drive criada e compartilhada", categoria: "entrega" as const },
]

// GET /api/coberturas — lista com filtros
export async function GET(req: NextRequest) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const status = sp.get("status")
  const tipo = sp.get("tipo")
  const search = sp.get("search") ?? ""
  const produtoId = sp.get("produtoId")

  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (tipo) where.tipo = tipo
  if (produtoId) where.produtoId = produtoId
  if (search) {
    where.OR = [
      { titulo: { contains: search, mode: "insensitive" } },
      { cliente: { contains: search, mode: "insensitive" } },
      { cidade: { contains: search, mode: "insensitive" } },
    ]
  }

  const coberturas = await prisma.eventoCobertura.findMany({
    where,
    orderBy: { dataInicio: "desc" },
    include: {
      produto: { select: { id: true, nome: true } },
      _count: { select: { uploads: true, equipe: true, checklist: true } },
    },
  })

  return NextResponse.json({ coberturas })
}

// POST /api/coberturas — criar
export async function POST(req: NextRequest) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  try {
    const body = await req.json()
    const { titulo, tipo, descricao, cliente, local, cidade, dataInicio, dataFim, totalDias, produtoId, linkDrive } =
      body

    if (!titulo || !dataInicio || !dataFim) {
      return NextResponse.json({ error: "titulo, dataInicio e dataFim são obrigatórios" }, { status: 400 })
    }

    const slug = gerarSlug(titulo)

    const cobertura = await prisma.eventoCobertura.create({
      data: {
        titulo: titulo.trim(),
        slug,
        tipo: tipo ?? "outro",
        descricao: descricao?.trim() || null,
        cliente: cliente?.trim() || null,
        local: local?.trim() || null,
        cidade: cidade?.trim() || null,
        dataInicio: new Date(dataInicio),
        dataFim: new Date(dataFim),
        totalDias: totalDias ?? 1,
        produtoId: produtoId || null,
        linkDrive: linkDrive?.trim() || null,
        createdById: session.user.id,
      },
    })

    // Criar checklist base para o dia 1
    await prisma.eventoCoberturaChecklist.createMany({
      data: CHECKLIST_BASE.map((item) => ({
        coberturaId: cobertura.id,
        dia: 1,
        texto: item.texto,
        categoria: item.categoria,
        concluido: false,
      })),
    })

    // Log
    await prisma.eventoCoberturaLog
      .create({
        data: {
          coberturaId: cobertura.id,
          usuarioId: session.user.id,
          acao: "criacao",
          detalhe: `Evento "${cobertura.titulo}" criado`,
        },
      })
      .catch(() => null)

    return NextResponse.json({ cobertura }, { status: 201 })
  } catch (e) {
    console.error("[Coberturas] Erro ao criar:", e)
    return NextResponse.json({ error: "Erro ao criar cobertura" }, { status: 500 })
  }
}
