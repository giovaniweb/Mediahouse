import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { requireAcesso } from "@/lib/acesso"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { filtroMinhasDemandas } from "@/lib/escopo-demanda"
import { numeroPagina, SEM_CACHE_MIDIA } from "@/lib/publicacao-midia"

export async function biblioteca(req: NextRequest, area: "audiovisual" | "design") {
  const acesso = await requireAcesso(area === "design" ? "verDesign" : "verDemandas")
  if (acesso instanceof NextResponse) return acesso
  return comOrg(acesso.organizacaoId, async () => {
    const sp = req.nextUrl.searchParams, search = sp.get("search")?.slice(0, 200)
    const page = numeroPagina(sp.get("page"), 1), limit = numeroPagina(sp.get("limit"), 24, 48)
    const where: Prisma.DemandaWhereInput = { organizacaoId: acesso.organizacaoId, area,
      statusVisivel: { in: ["finalizado", "para_postar"] },
      AND: [
        { OR: [{ linkFinal: { not: null } }, { arquivos: { some: { tipoArquivo: "final" } } }] },
        ...(acesso.permissoes.verTodasDemandas ? [] : [await filtroMinhasDemandas(acesso.usuarioId, acesso.organizacaoId)]),
        ...(search ? [{ OR: [{ titulo: { contains: search, mode: "insensitive" as const } }, { codigo: { contains: search, mode: "insensitive" as const } }] }] : []),
      ] }
    const [total, demandas] = await Promise.all([
      prisma.demanda.count({ where }),
      prisma.demanda.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: [{ finalizadaEm: "desc" }, { id: "asc" }],
        select: { id: true, codigo: true, titulo: true, tipoVideo: true, departamento: true, linhaProjeto: true, linkFinal: true, thumbnailUrl: true, finalizadaEm: true, updatedAt: true,
          responsavel: { select: { nome: true } }, designer: { select: { nome: true } },
          arquivos: { where: { tipoArquivo: "final" }, orderBy: { sequencia: "asc" }, select: { id: true, url: true, thumbnailUrl: true, sequencia: true, publicadoEm: true, revogadoEm: true } } } }),
    ])
    const videos = demandas.flatMap(d => {
      const base = { demandaId: d.id, codigo: d.codigo, titulo: d.titulo, tipoVideo: d.tipoVideo, departamento: d.departamento, linhaProjeto: d.linhaProjeto,
        responsavel: d.responsavel?.nome ?? d.designer?.nome ?? null, finalizadaEm: d.finalizadaEm, updatedAt: d.updatedAt }
      return d.arquivos.length ? d.arquivos.map(a => ({ ...base, id: a.id, linkFinal: a.url, thumbnailUrl: a.thumbnailUrl, sequencia: a.sequencia, publicado: !!a.publicadoEm && !a.revogadoEm, legado: false }))
        : [{ ...base, id: d.id, linkFinal: d.linkFinal!, thumbnailUrl: d.thumbnailUrl, sequencia: null, publicado: false, legado: true }]
    })
    return NextResponse.json({ videos, total, page, totalPages: Math.ceil(total / limit), unidadePaginacao: "demandas",
      podePublicar: ["admin", "gestor"].includes(acesso.papel) && acesso.permissoes.editarDemanda }, { headers: SEM_CACHE_MIDIA })
  })
}
