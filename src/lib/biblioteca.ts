import { paginarGaleria, type ItemGaleria } from "@/lib/galeria-indice"
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
    const { pagina, demandas } = await prisma.$transaction(async tx => {
      // Índice leve: o escopo é aplicado antes de contar, ordenar e paginar.
      const indice = await tx.demanda.findMany({ where,
        select: { id: true, linkFinal: true, finalizadaEm: true, updatedAt: true,
          arquivos: { where: { tipoArquivo: "final" }, select: { id: true, url: true, createdAt: true } } } })
      const pagina = paginarGaleria(indice.flatMap<ItemGaleria>(d => d.arquivos.some(a => a.url.trim())
        ? d.arquivos.filter(a => a.url.trim()).map(a => ({ id: a.id, demandaId: d.id, url: a.url, finalizadaEm: d.finalizadaEm, anexadoEm: a.createdAt, updatedAt: d.updatedAt, legado: false }))
        : [{ id: d.id, demandaId: d.id, url: d.linkFinal ?? "", finalizadaEm: d.finalizadaEm, anexadoEm: null, updatedAt: d.updatedAt, legado: true }]), page,limit)
      const demandas = await tx.demanda.findMany({ where: { AND: [where, { id: { in: pagina.itens.map(i => i.demandaId) } }] },
        select: { id: true, codigo: true, titulo: true, tipoVideo: true, departamento: true, linhaProjeto: true, linkFinal: true, thumbnailUrl: true, finalizadaEm: true, updatedAt: true,
          responsavel: { select: { nome: true } }, designer: { select: { nome: true } },
          arquivos: { where: { id: { in: pagina.itens.filter(i => !i.legado).map(i => i.id) }, tipoArquivo: "final" }, select: { id: true, url: true, thumbnailUrl: true, sequencia: true, publicadoEm: true, revogadoEm: true } } } })
      return { pagina, demandas }
    }, { isolationLevel: "RepeatableRead" })
    const porId = new Map(demandas.map(d => [d.id,d]))
    const videos = pagina.itens.flatMap(item => {
      const d = porId.get(item.demandaId)
      if (!d) return []
      const a = d.arquivos.find(a => a.id === item.id)
      if (!item.legado && !a) return []
      return [{ demandaId: d.id, codigo: d.codigo, titulo: d.titulo, tipoVideo: d.tipoVideo, departamento: d.departamento, linhaProjeto: d.linhaProjeto,
        responsavel: d.responsavel?.nome ?? d.designer?.nome ?? null, finalizadaEm: d.finalizadaEm, updatedAt: d.updatedAt,
        id: item.id, linkFinal: a?.url ?? d.linkFinal!, thumbnailUrl: a?.thumbnailUrl ?? (item.legado ? d.thumbnailUrl : null), sequencia: a?.sequencia ?? null,
        publicado: !!a?.publicadoEm && !a.revogadoEm, legado: item.legado, dataReferencia: item.dataReferencia, origemData: item.origemData, dataEstimada: item.dataEstimada }]
    })
    const { itens: _itens, ...paginacao } = pagina
    return NextResponse.json({ ...paginacao, videos,
      podePublicar: ["admin", "gestor"].includes(acesso.papel) && acesso.permissoes.editarDemanda }, { headers: SEM_CACHE_MIDIA })
  })
}
