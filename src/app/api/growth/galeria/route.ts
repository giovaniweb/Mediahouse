import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { getOrgId, semOrg } from "@/lib/org"

// GET /api/growth/galeria — Galeria de Growth/Criativos (artes, posts, criativos).
// SEPARADA da galeria audiovisual e ISOLADA por organizacaoId (autenticada).
// Só conteúdos de Growth (area="design") finalizados/aprovados da org logada.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const sp = req.nextUrl.searchParams
  const page = Math.max(1, parseInt(sp.get("page") ?? "1"))
  const limit = Math.min(48, Math.max(1, parseInt(sp.get("limit") ?? "24")))
  const search = sp.get("search") ?? ""
  const linhaProjeto = sp.get("linhaProjeto") ?? ""
  const skip = (page - 1) * limit

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    organizacaoId,                  // isolamento multiempresa
    area: "design",                 // só Growth/Criativos (nunca vídeos audiovisuais)
    statusVisivel: { in: ["finalizado", "para_postar"] },
    linkFinal: { not: null },
    ...(linhaProjeto ? { linhaProjeto } : {}),
    ...(search ? {
      OR: [
        { titulo: { contains: search, mode: "insensitive" } },
        { codigo: { contains: search, mode: "insensitive" } },
        { linhaProjeto: { contains: search, mode: "insensitive" } },
      ],
    } : {}),
  }

  const [total, demandas] = await Promise.all([
    prisma.demanda.count({ where }),
    prisma.demanda.findMany({
      where,
      select: {
        id: true, codigo: true, titulo: true, tipoVideo: true, departamento: true,
        linhaProjeto: true, linkFinal: true, thumbnailUrl: true, finalizadaEm: true, updatedAt: true,
        responsavel: { select: { nome: true } },
        designer: { select: { nome: true } },
        arquivos: {
          where: { tipoArquivo: "final" },
          select: { id: true, url: true, thumbnailUrl: true, sequencia: true, createdAt: true },
          orderBy: { sequencia: "asc" },
        },
      },
      orderBy: [{ finalizadaEm: "desc" }, { updatedAt: "desc" }],
      skip,
      take: limit,
    }),
  ])

  // Uma entrada por arquivo final; fallback p/ linkFinal legado (sem registros Arquivo).
  const videos = demandas.flatMap((d) => {
    const resp = d.responsavel?.nome ?? d.designer?.nome ?? null
    if (d.arquivos.length > 0) {
      return d.arquivos.map((arq) => ({
        id: arq.id, demandaId: d.id, codigo: d.codigo, titulo: d.titulo, tipoVideo: d.tipoVideo,
        departamento: d.departamento, linhaProjeto: d.linhaProjeto, responsavel: resp,
        linkFinal: arq.url!, thumbnailUrl: arq.thumbnailUrl ?? d.thumbnailUrl ?? null,
        finalizadaEm: d.finalizadaEm, updatedAt: d.updatedAt, sequencia: arq.sequencia,
      }))
    }
    return [{
      id: d.id, demandaId: d.id, codigo: d.codigo, titulo: d.titulo, tipoVideo: d.tipoVideo,
      departamento: d.departamento, linhaProjeto: d.linhaProjeto, responsavel: resp,
      linkFinal: d.linkFinal!, thumbnailUrl: d.thumbnailUrl ?? null,
      finalizadaEm: d.finalizadaEm, updatedAt: d.updatedAt, sequencia: 1,
    }]
  })

  return NextResponse.json({ videos, total })
}
