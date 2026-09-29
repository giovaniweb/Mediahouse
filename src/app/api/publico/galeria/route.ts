import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { orgPublica } from "@/lib/org"
import { comOrg } from "@/lib/org-contexto"
import { PUBLICADO, SEM_CACHE_MIDIA, numeroPagina, resolverPublicacao } from "@/lib/publicacao-midia"

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const page = numeroPagina(sp.get("page"), 1), limit = numeroPagina(sp.get("limit"), 24, 48)
  const organizacaoId = await orgPublica(sp.get("org"))
  if (!organizacaoId) return NextResponse.json({ total: 0, page, limit, totalPages: 0, videos: [] }, { headers: SEM_CACHE_MIDIA })
  return comOrg(organizacaoId, async () => {
    const search = sp.get("search")?.slice(0, 200), tipo = sp.get("tipo"), produtoId = sp.get("produtoId")
    const where: Prisma.ArquivoWhereInput = {
      ...PUBLICADO,
      demanda: {
        organizacaoId, area: sp.get("area") === "design" ? "design" : "audiovisual",
        ...(tipo ? { tipoVideo: tipo } : {}),
        ...(produtoId ? { produtos: { some: { produtoId } } } : {}),
        ...(search ? { OR: [{ titulo: { contains: search, mode: "insensitive" } }, { codigo: { contains: search, mode: "insensitive" } }] } : {}),
      },
    }
    const [total, arquivos] = await Promise.all([
      prisma.arquivo.count({ where }),
      prisma.arquivo.findMany({ where, skip: (page - 1) * limit, take: limit,
        orderBy: [{ publicadoEm: "desc" }, { id: "asc" }],
        select: { id: true, sequencia: true, publicacaoUrl: true, publicacaoThumbnailUrl: true,
          demanda: { select: { id: true, codigo: true, titulo: true, tipoVideo: true, departamento: true, finalizadaEm: true, updatedAt: true,
            produtos: { take: 1, select: { produto: { select: { id: true, nome: true } } } } } } },
      }),
    ])
    const videos = await Promise.all(arquivos.map(async a => {
      const d = a.demanda
      return { id: a.id, demandaId: d.id, codigo: d.codigo, titulo: d.titulo, tipoVideo: d.tipoVideo,
        departamento: d.departamento, finalizadaEm: d.finalizadaEm, updatedAt: d.updatedAt, sequencia: a.sequencia,
        produto: d.produtos[0]?.produto.nome ?? null, produtoId: d.produtos[0]?.produto.id ?? null,
        linkFinal: await resolverPublicacao(a.publicacaoUrl, organizacaoId, d.id),
        thumbnailUrl: await resolverPublicacao(a.publicacaoThumbnailUrl, organizacaoId, d.id, true) }
    }))
    return NextResponse.json({ total, page, limit, totalPages: Math.ceil(total / limit), videos: videos.filter(v => v.linkFinal) }, { headers: SEM_CACHE_MIDIA })
  })
}
