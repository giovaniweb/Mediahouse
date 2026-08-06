import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { orgPublica } from "@/lib/org"

// GET /api/publico/galeria?org=<slug> — vídeos finalizados/para_postar (sem auth)
// Query params: org, page, limit, tipo, search, produtoId
// Escopado por organização: sem isso a vitrine misturava entregas de todas as empresas.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const organizacaoId = await orgPublica(sp.get("org"))
  const page = Math.max(1, parseInt(sp.get("page") ?? "1"))
  const limit = Math.min(48, Math.max(1, parseInt(sp.get("limit") ?? "24")))
  if (!organizacaoId) {
    return NextResponse.json({ total: 0, page, limit, totalPages: 0, videos: [] })
  }
  const tipo = sp.get("tipo") ?? ""
  const search = sp.get("search") ?? ""
  const produtoId = sp.get("produtoId") ?? ""
  // Área: audiovisual (padrão) ou design (galeria de artes)
  const area = sp.get("area") === "design" ? "design" : "audiovisual"
  const skip = (page - 1) * limit

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    organizacaoId,
    area,
    statusVisivel: { in: ["finalizado", "para_postar"] },
    ...(tipo ? { tipoVideo: tipo } : {}),
    ...(produtoId ? { produtos: { some: { produtoId } } } : {}),
    // Tem vídeo final por QUALQUER caminho: linkFinal legado OU registro Arquivo("final")
    // do fluxo novo (multi-arquivo). Combinado via AND para não colidir com o OR da busca.
    AND: [
      {
        OR: [
          { linkFinal: { not: null } },
          { arquivos: { some: { tipoArquivo: "final" } } },
        ],
      },
      ...(search ? [{
        // Obs.: `departamento` é enum (não aceita `contains`) — busca por título,
        // código e nome do produto.
        OR: [
          { titulo: { contains: search, mode: "insensitive" } },
          { codigo: { contains: search, mode: "insensitive" } },
          { produtos: { some: { produto: { nome: { contains: search, mode: "insensitive" } } } } },
        ],
      }] : []),
    ],
  }

  // Busca simultânea: contagem total, página atual e todos os IDs (para sub-queries seguras)
  const [total, demandas, allDemandIdRows] = await Promise.all([
    prisma.demanda.count({ where }),
    prisma.demanda.findMany({
      where,
      select: {
        id: true,
        codigo: true,
        titulo: true,
        tipoVideo: true,
        departamento: true,
        linkFinal: true,
        thumbnailUrl: true,
        finalizadaEm: true,
        updatedAt: true,
        produtos: {
          select: { produto: { select: { id: true, nome: true } } },
          take: 1,
        },
        // Incluir todos os vídeos finais — pode haver N por demanda
        arquivos: {
          where: { tipoArquivo: "final" },
          select: { id: true, url: true, thumbnailUrl: true, sequencia: true, createdAt: true },
          orderBy: { sequencia: "asc" },
        },
      },
      orderBy: [
        { finalizadaEm: "desc" },
        { updatedAt: "desc" },
      ],
      skip,
      take: limit,
    }),
    // IDs de TODAS as demandas que atendem ao filtro (usado para sub-queries sem relation nesting)
    prisma.demanda.findMany({ where, select: { id: true } }),
  ])

  const allDemandIds = allDemandIdRows.map((d) => d.id)

  // Contar Arquivos finais e demandas modernas usando IDs explícitos (evita relation filter aninhado)
  const [totalArquivosFinais, totalDemandasComArquivos] = await Promise.all([
    allDemandIds.length > 0
      ? prisma.arquivo.count({
          where: { tipoArquivo: "final", demandaId: { in: allDemandIds } },
        })
      : Promise.resolve(0),
    allDemandIds.length > 0
      ? prisma.demanda.count({
          where: { id: { in: allDemandIds }, arquivos: { some: { tipoArquivo: "final" } } },
        })
      : Promise.resolve(0),
  ])

  // FlatMap: uma entrada por arquivo final; fallback para linkFinal legado (sem registros Arquivo)
  const videos = demandas.flatMap((v) => {
    const prodNome = v.produtos[0]?.produto?.nome ?? null
    const prodId = v.produtos[0]?.produto?.id ?? null

    if (v.arquivos.length > 0) {
      return v.arquivos.map((arq) => ({
        id: arq.id,                               // ID único por vídeo
        demandaId: v.id,
        codigo: v.codigo,
        titulo: v.titulo,
        tipoVideo: v.tipoVideo,
        departamento: v.departamento,
        linkFinal: arq.url!,
        thumbnailUrl: arq.thumbnailUrl ?? v.thumbnailUrl ?? null,
        finalizadaEm: v.finalizadaEm,
        updatedAt: v.updatedAt,
        produto: prodNome,
        produtoId: prodId,
        sequencia: arq.sequencia,
      }))
    }

    // Demanda legada: só linkFinal, sem registros Arquivo
    return [{
      id: v.id,
      demandaId: v.id,
      codigo: v.codigo,
      titulo: v.titulo,
      tipoVideo: v.tipoVideo,
      departamento: v.departamento,
      linkFinal: v.linkFinal!,
      thumbnailUrl: v.thumbnailUrl ?? null,
      finalizadaEm: v.finalizadaEm,
      updatedAt: v.updatedAt,
      produto: prodNome,
      produtoId: prodId,
      sequencia: null,
    }]
  })

  // total real de vídeos:
  //   Arquivo.final registrados  +  demandas legadas (linkFinal sem Arquivo) × 1
  const totalLegacy = total - totalDemandasComArquivos
  const totalVideos = totalArquivosFinais + totalLegacy

  return NextResponse.json({
    total: totalVideos,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    videos,
  })
}
