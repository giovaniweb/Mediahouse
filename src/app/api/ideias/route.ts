import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { StatusIdeia, OrigemIdeia } from "@prisma/client"

function detectPlataforma(url: string): string | null {
  if (/instagram\.com/i.test(url)) return "instagram"
  if (/tiktok\.com/i.test(url)) return "tiktok"
  if (/youtu(be\.com|\.be)/i.test(url)) return "youtube"
  if (/twitter\.com|x\.com/i.test(url)) return "twitter"
  return null
}

function detectOrigem(url: string): OrigemIdeia {
  const plat = detectPlataforma(url)
  if (plat === "instagram") return "instagram"
  if (plat === "tiktok") return "tiktok"
  if (plat === "youtube") return "youtube"
  return "outro"
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const url = new URL(req.url)
  const status = url.searchParams.get("status") as StatusIdeia | null
  const produtoId = url.searchParams.get("produtoId")
  const origem = url.searchParams.get("origem") as OrigemIdeia | null
  const classificacao = url.searchParams.get("classificacao")
  const search = url.searchParams.get("search")
  const sortBy = url.searchParams.get("sortBy") || "createdAt"
  const page = parseInt(url.searchParams.get("page") || "1")
  const limit = parseInt(url.searchParams.get("limit") || "50")

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  if (status) where.status = status
  if (produtoId) where.produtoId = produtoId
  if (origem) where.origem = origem
  if (classificacao) where.classificacao = classificacao
  if (search) {
    where.OR = [
      { titulo: { contains: search, mode: "insensitive" } },
      { descricao: { contains: search, mode: "insensitive" } },
    ]
  }

  // Exclude descartadas by default unless explicitly filtered
  if (!status) {
    where.status = { not: "descartada" }
  }

  const orderBy = sortBy === "scoreIA"
    ? { scoreIA: "desc" as const }
    : sortBy === "produto"
      ? { produto: { nome: "asc" as const } }
      : { createdAt: "desc" as const }

  const [ideias, total, counts] = await Promise.all([
    prisma.ideiaVideo.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        produto: { select: { id: true, nome: true } },
        demanda: { select: { id: true, codigo: true, statusVisivel: true } },
      },
    }),
    prisma.ideiaVideo.count({ where }),
    prisma.ideiaVideo.groupBy({
      by: ["status"],
      _count: true,
    }),
  ])

  const statusCounts: Record<string, number> = {}
  for (const c of counts) {
    statusCounts[c.status] = c._count
  }

  return NextResponse.json({
    ideias,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    statusCounts,
  })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const body = await req.json()
  const { titulo, descricao, linkReferencia, mediaUrl, mediaType, produtoId, classificacao, tags, enviadoPor, telefoneOrigem, origem } = body

  if (!titulo?.trim()) {
    return NextResponse.json({ error: "Título é obrigatório" }, { status: 400 })
  }

  const plataforma = linkReferencia ? detectPlataforma(linkReferencia) : null
  const origemFinal = origem || (linkReferencia ? detectOrigem(linkReferencia) : "manual")

  const ideia = await prisma.ideiaVideo.create({
    data: {
      titulo: titulo.trim(),
      descricao: descricao?.trim() || null,
      linkReferencia: linkReferencia?.trim() || null,
      mediaUrl: mediaUrl || null,
      mediaType: mediaType || null,
      origem: origemFinal,
      plataforma,
      produtoId: produtoId || null,
      classificacao: classificacao || null,
      tags: tags || [],
      enviadoPor: enviadoPor || null,
      telefoneOrigem: telefoneOrigem || null,
      usuarioId: session.user.id,
    },
    include: {
      produto: { select: { id: true, nome: true } },
    },
  })

  return NextResponse.json(ideia, { status: 201 })
}
