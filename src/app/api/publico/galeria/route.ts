import { paginarGaleria } from "@/lib/galeria-indice"
import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { orgPublica } from "@/lib/org"
import { comOrg } from "@/lib/org-contexto"
import { PUBLICADO, SEM_CACHE_MIDIA, numeroPagina, resolverPublicacao, urlPublicavel } from "@/lib/publicacao-midia"
import { resolverParaAssinada } from "@/lib/midia"

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
    const { pagina, arquivos } = await prisma.$transaction(async tx => {
      const indice = await tx.arquivo.findMany({ where,
        select: { id: true, demandaId: true, publicacaoUrl: true, createdAt: true, demanda: { select: { finalizadaEm: true, updatedAt: true } } } })
      const pagina = paginarGaleria(indice.filter(a => urlPublicavel(a.publicacaoUrl,organizacaoId,a.demandaId)).map(a => ({
        id: a.id, demandaId: a.demandaId, url: a.publicacaoUrl!, finalizadaEm: a.demanda.finalizadaEm, anexadoEm: a.createdAt, updatedAt: a.demanda.updatedAt, legado: false,
      })),page,limit)
      const arquivos = await tx.arquivo.findMany({ where: { AND: [where, { id: { in: pagina.itens.map(i => i.id) } }] },
        select: { id: true, sequencia: true, url: true, originalUrl: true, publicacaoUrl: true, publicacaoThumbnailUrl: true,
          demanda: { select: { id: true, codigo: true, titulo: true, tipoVideo: true, departamento: true, finalizadaEm: true, updatedAt: true,
            produtos: { take: 1, orderBy: { produtoId: "asc" }, select: { produto: { select: { id: true, nome: true } } } } } } } })
      return { pagina, arquivos }
    }, { isolationLevel: "RepeatableRead" })
    const ordem = new Map(pagina.itens.map((v,i) => [v.id,i]))
    arquivos.sort((a,b) => ordem.get(a.id)!-ordem.get(b.id)!)
    const videos = await Promise.all(arquivos.map(async a => {
      const d = a.demanda
      const item = pagina.itens[ordem.get(a.id)!]
      return { id: a.id, demandaId: d.id, codigo: d.codigo, titulo: d.titulo, tipoVideo: d.tipoVideo,
        dataReferencia: item.dataReferencia, origemData: item.origemData, dataEstimada: item.dataEstimada,
        departamento: d.departamento, finalizadaEm: d.finalizadaEm, updatedAt: d.updatedAt, sequencia: a.sequencia,
        produto: d.produtos[0]?.produto.nome ?? null, produtoId: d.produtos[0]?.produto.id ?? null,
        linkFinal: await resolverPublicacao(a.publicacaoUrl, organizacaoId, d.id),
        thumbnailUrl: await resolverPublicacao(a.publicacaoThumbnailUrl, organizacaoId, d.id, true),
        downloadUrl: await urlDeDownload(a, organizacaoId, d.id) }
    }))
    if (videos.some(v => !v.linkFinal)) return NextResponse.json({ error: "Mídia temporariamente indisponível. Tente novamente.", videos: [] }, { status: 503, headers: SEM_CACHE_MIDIA })
    const { itens: _itens, ...paginacao } = pagina
    return NextResponse.json({ ...paginacao, videos }, { headers: SEM_CACHE_MIDIA })
  })
}

/**
 * O que foi publicado é o snapshot de `url`. Se esse snapshot é a prévia
 * convertida do arquivo, o download entrega o original da mesma entrega; nos
 * demais casos, o próprio snapshot. Sai assinado como anexo.
 */
async function urlDeDownload(a: { url: string; originalUrl: string | null; publicacaoUrl: string | null }, org: string, demanda: string) {
  const alvo = a.originalUrl && a.publicacaoUrl === a.url && urlPublicavel(a.originalUrl, org, demanda) ? a.originalUrl : a.publicacaoUrl
  return urlPublicavel(alvo, org, demanda) ? resolverParaAssinada(alvo, undefined, true) : null
}
