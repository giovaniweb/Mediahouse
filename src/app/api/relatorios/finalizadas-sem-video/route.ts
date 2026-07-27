import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"

// GET /api/relatorios/finalizadas-sem-video
// Demandas audiovisuais marcadas finalizado/para_postar que NÃO têm nenhuma
// referência ao vídeo final no sistema (sem linkFinal e sem Arquivo tipo "final").
// São as que não conseguem aparecer na galeria — o time usa esta lista para
// localizar a peça (Drive) e completar o link final / upload.
// Org-scoped. Restrito a admin/gestor.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()
  if (!["admin", "gestor"].includes(session.user.tipo ?? "")) {
    return NextResponse.json({ error: "Acesso restrito" }, { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const page = Math.max(1, parseInt(sp.get("page") ?? "1"))
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "30")))
  const search = sp.get("search") ?? ""
  const skip = (page - 1) * limit

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    organizacaoId,
    area: "audiovisual",
    statusVisivel: { in: ["finalizado", "para_postar"] },
    linkFinal: null,
    arquivos: { none: { tipoArquivo: "final" } },
    ...(search ? {
      OR: [
        { titulo: { contains: search, mode: "insensitive" } },
        { codigo: { contains: search, mode: "insensitive" } },
        { departamento: { contains: search, mode: "insensitive" } },
      ],
    } : {}),
  }

  const [total, demandas] = await Promise.all([
    prisma.demanda.count({ where }),
    prisma.demanda.findMany({
      where,
      select: {
        id: true,
        codigo: true,
        titulo: true,
        tipoVideo: true,
        departamento: true,
        finalizadaEm: true,
        updatedAt: true,
        linkBrutos: true,
        linkCliente: true,
      },
      orderBy: [{ finalizadaEm: "desc" }, { updatedAt: "desc" }],
      skip,
      take: limit,
    }),
  ])

  return NextResponse.json({
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    demandas,
  })
}
