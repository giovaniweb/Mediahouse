import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

type Params = { params: Promise<{ slug: string }> }

// GET /api/publico/cobertura/[slug] — sem auth
export async function GET(req: NextRequest, { params }: Params) {
  const { slug } = await params
  const senha = req.nextUrl.searchParams.get("senha")

  const cobertura = await prisma.eventoCobertura.findUnique({
    where: { slug },
    select: {
      id: true,
      titulo: true,
      tipo: true,
      status: true,
      descricao: true,
      cliente: true,
      local: true,
      cidade: true,
      dataInicio: true,
      dataFim: true,
      totalDias: true,
      linkDownloadPublico: true,
      senhaDownload: true,
      uploads: {
        orderBy: [{ dia: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          dia: true,
          tipo: true,
          momento: true,
          titulo: true,
          url: true,
          thumbnailUrl: true,
          duracao: true,
        },
      },
    },
  })

  if (!cobertura) return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 })

  if (!cobertura.linkDownloadPublico) {
    return NextResponse.json({ error: "Link de download não ativo" }, { status: 403 })
  }

  // Verificar senha se definida
  if (cobertura.senhaDownload && senha !== cobertura.senhaDownload) {
    return NextResponse.json({ error: "Senha incorreta", requireSenha: true }, { status: 401 })
  }

  // Remover senha do response
  const { senhaDownload: _, ...coberturaPublica } = cobertura

  return NextResponse.json({ cobertura: coberturaPublica })
}
