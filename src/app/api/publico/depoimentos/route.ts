import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { orgPublica } from "@/lib/org"

// GET /api/publico/depoimentos — vitrine pública, sem auth.
//
// A consulta não tinha recorte: a página /sobre de qualquer empresa mostrava os
// depoimentos de todas. Agora a empresa vem do `?org=` (mesmo padrão dos outros
// formulários públicos) e, sem ele, da organização padrão da instalação.
export async function GET(req: NextRequest) {
  try {
    const organizacaoId = await orgPublica(req.nextUrl.searchParams.get("org"))
    if (!organizacaoId) return NextResponse.json({ depoimentos: [] })

    const depoimentos = await prisma.depoimento.findMany({
      where: { organizacaoId, ativo: true },
      orderBy: { ordem: "asc" },
      select: {
        id: true,
        nome: true,
        cidade: true,
        videoUrl: true,
        thumbnailUrl: true,
        descricao: true,
      },
    })
    return NextResponse.json({ depoimentos })
  } catch (e) {
    console.error("[Depoimentos] Erro ao buscar:", e)
    return NextResponse.json({ depoimentos: [] })
  }
}
