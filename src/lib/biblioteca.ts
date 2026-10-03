import { exigeArquivo } from "@/lib/acervo-regras"
import { identidadeEntregavel } from "@/lib/metricas-entregaveis"
import { paginarGaleria, type ItemGaleria } from "@/lib/galeria-indice"
import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { requireAcesso } from "@/lib/acesso"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { filtroMinhasDemandas } from "@/lib/escopo-demanda"
import { numeroPagina, SEM_CACHE_MIDIA, urlPublicavel } from "@/lib/publicacao-midia"

export async function biblioteca(req: NextRequest, area: "audiovisual" | "design") {
  const acesso = await requireAcesso(area === "design" ? "verDesign" : "verDemandas")
  if (acesso instanceof NextResponse) return acesso
  return comOrg(acesso.organizacaoId, async () => {
    const sp = req.nextUrl.searchParams, search = sp.get("search")?.slice(0, 200)
    const page = numeroPagina(sp.get("page"), 1), limit = numeroPagina(sp.get("limit"), 24, 48)
    const where: Prisma.DemandaWhereInput = { organizacaoId: acesso.organizacaoId, area,
      statusVisivel: { in: ["finalizado", "para_postar"] },
      AND: [
        ...(sp.get("qualidade") === "sem_final" ? [] : [{ OR: [{ linkFinal: { not: null } }, { arquivos: { some: { tipoArquivo: "final" as const } } }, { aprovacoesVideo: { some: { status: "aprovado" } } }] }]),
        ...(acesso.permissoes.verTodasDemandas ? [] : [await filtroMinhasDemandas(acesso.usuarioId, acesso.organizacaoId)]),
        ...(sp.get("tipo") ? [{ tipoVideo: sp.get("tipo")!.slice(0,100) }] : []),
        ...(sp.get("projeto") ? [{ OR: [{ linhaProjeto: { contains: sp.get("projeto")!.slice(0,100), mode: "insensitive" as const } }, { linhaProjetoRef: { nome: { contains: sp.get("projeto")!.slice(0,100), mode: "insensitive" as const } } }] }] : []),
        ...(sp.get("pessoa") ? [{ OR: ["responsavel","designer","editor","videomaker"].map(campo => ({ [campo]: { nome: { contains: sp.get("pessoa")!.slice(0,100), mode: "insensitive" as const } } })) }] : []),
        ...(search ? [{ OR: [{ titulo: { contains: search, mode: "insensitive" as const } }, { codigo: { contains: search, mode: "insensitive" as const } }] }] : []),
      ] }
    if (sp.get("qualidade") === "sem_final") {
      // Recorte de qualidade, não diagnóstico de arquivo perdido. Tipos desconhecidos não são acusados.
      const tipos = await prisma.demanda.findMany({ where, distinct: ["tipoVideo"], select: { tipoVideo: true } })
      const filtro = { AND: [where, { tipoVideo: { in: tipos.filter(t => exigeArquivo(area,t.tipoVideo) === true).map(t => t.tipoVideo) }, OR: [{ linkFinal: null }, { linkFinal: "" }], arquivos: { none: { tipoArquivo: "final" as const, url: { not: "" } } }, aprovacoesVideo: { none: { status: "aprovado" } } }] }
      const [total, pendencias] = await prisma.$transaction([
        prisma.demanda.count({ where: filtro }), prisma.demanda.findMany({ where: filtro, orderBy: { id: "asc" }, skip: (page-1)*limit, take: limit, select: { id: true, codigo: true, titulo: true, tipoVideo: true } }),
      ])
      return NextResponse.json({ videos: [], pendencias, demandas: pendencias, page, limit, total, totalPages: Math.ceil(total/limit), podePublicar: false },{ headers: SEM_CACHE_MIDIA })
    }
    const { pagina, demandas } = await prisma.$transaction(async tx => {
      // Índice leve: o escopo é aplicado antes de contar, ordenar e paginar.
      const indice = await tx.demanda.findMany({ where,
        select: { id: true, linkFinal: true, finalizadaEm: true, updatedAt: true,
          aprovacoesVideo: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, urlVideo: true, status: true, createdAt: true } },
          arquivos: { where: { tipoArquivo: "final" }, select: { id: true, url: true, originalUrl: true, createdAt: true } } } })
      const pagina = paginarGaleria(indice.flatMap<ItemGaleria>(d => {
        const arquivos = d.arquivos.filter(a => a.url.trim())
        const registrados = arquivos.map(a => ({ id: a.id, demandaId: d.id, url: a.url, finalizadaEm: d.finalizadaEm, anexadoEm: a.createdAt, updatedAt: d.updatedAt, legado: false }))
        const identidades = new Set(arquivos.flatMap(a => [a.url,a.originalUrl].filter((url):url is string=>!!url).map(identidadeEntregavel)))
        const vistos = new Set<string>()
        const aprovadas = d.aprovacoesVideo.filter(a => { const key = identidadeEntregavel(a.urlVideo); if(vistos.has(key)) return false; vistos.add(key); return a.status === "aprovado" })
        const base = registrados.length ? registrados : d.linkFinal?.trim() ? [{ id: d.id, demandaId: d.id, url: d.linkFinal, finalizadaEm: d.finalizadaEm, anexadoEm: null, updatedAt: d.updatedAt, legado: true }] : []
        return [...base, ...aprovadas.filter(a=>!identidades.has(identidadeEntregavel(a.urlVideo))).map(a => ({ id: a.id, demandaId: d.id, url: a.urlVideo, finalizadaEm: d.finalizadaEm, anexadoEm: a.createdAt, updatedAt: d.updatedAt, legado: true }))]

      }).filter(item => urlPublicavel(item.url,acesso.organizacaoId,item.demandaId)), page,limit)
      const demandas = await tx.demanda.findMany({ where: { AND: [where, { id: { in: pagina.itens.map(i => i.demandaId) } }] },
        select: { id: true, codigo: true, titulo: true, tipoVideo: true, departamento: true, linhaProjeto: true, linkFinal: true, thumbnailUrl: true, finalizadaEm: true, updatedAt: true,
          responsavel: { select: { nome: true } }, designer: { select: { nome: true } },
          arquivos: { where: { id: { in: pagina.itens.filter(i => !i.legado).map(i => i.id) }, tipoArquivo: "final" }, select: { id: true, url: true, thumbnailUrl: true, sequencia: true, publicadoEm: true, revogadoEm: true, transcodeStatus: true, previewObjectKey: true, previewFonteVersao: true, fonteVersao: true, previewSha256: true, previewJobId: true } } } })
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
        id: item.id, linkFinal: a?.url ?? item.url, thumbnailUrl: a?.thumbnailUrl ?? (item.legado ? d.thumbnailUrl : null), sequencia: a?.sequencia ?? null,
        estadoPrevia: a?.previewObjectKey && a.fonteVersao && a.previewFonteVersao === a.fonteVersao && a.previewSha256 && a.previewJobId ? "verificada" : a?.transcodeStatus === "failed" ? "falhou" : a?.transcodeStatus === "processing" ? "processando" : "nao_verificada",
        publicado: !!a?.publicadoEm && !a.revogadoEm, legado: item.legado, dataReferencia: item.dataReferencia, origemData: item.origemData, dataEstimada: item.dataEstimada }]
    })
    const { itens: _itens, ...paginacao } = pagina
    return NextResponse.json({ ...paginacao, videos,
      podePublicar: ["admin", "gestor"].includes(acesso.papel) && acesso.permissoes.editarDemanda }, { headers: SEM_CACHE_MIDIA })
  })
}
