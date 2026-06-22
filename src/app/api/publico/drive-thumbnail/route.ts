import { NextRequest, NextResponse } from "next/server"
import { getAccessToken } from "@/lib/google-drive"
import { prisma } from "@/lib/prisma"

// GET /api/publico/drive-thumbnail?fileId={id}
// Rota pública: retorna thumbnail de arquivo do Drive usando service account.
// A galeria pública usa este proxy para contornar a exigência de autenticação
// da URL https://drive.google.com/thumbnail?id=X (que requer cookies de sessão Google).
// Rota pública resolve a org pelo registro (Arquivo que contém o fileId) → usa o
// Drive da empresa dona. Sem match, cai no fallback Contourline do helper (legado).
export async function GET(req: NextRequest) {
  const fileId = req.nextUrl.searchParams.get("fileId")
  if (!fileId || !/^[a-zA-Z0-9_-]{10,}$/.test(fileId)) {
    return NextResponse.json({ error: "fileId inválido" }, { status: 400 })
  }

  try {
    const arq = await prisma.arquivo.findFirst({
      where: { url: { contains: fileId } },
      select: { demanda: { select: { organizacaoId: true } } },
    })
    const token = await getAccessToken(arq?.demanda?.organizacaoId ?? undefined)

    // Busca metadados do arquivo incluindo thumbnailLink
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=thumbnailLink,iconLink`,
      { headers: { Authorization: `Bearer ${token}` } }
    )

    if (!metaRes.ok) {
      // Se não encontrou o arquivo ou sem permissão, retornar 404
      return NextResponse.json({ error: "Arquivo não encontrado no Drive" }, { status: 404 })
    }

    const meta = (await metaRes.json()) as { thumbnailLink?: string; iconLink?: string }
    const thumbUrl = meta.thumbnailLink

    if (!thumbUrl) {
      return NextResponse.json({ error: "Thumbnail não disponível" }, { status: 404 })
    }

    // Aumentar tamanho: trocar =s220 por =w400-h225 (16:9)
    const largerThumb = thumbUrl.replace(/=s\d+/, "=w400-h225")

    // Redirecionar para o URL do thumbnail (lh3.googleusercontent.com — público)
    return NextResponse.redirect(largerThumb)
  } catch (e) {
    console.error("[drive-thumbnail] Erro:", e)
    return NextResponse.json({ error: "Erro ao buscar thumbnail" }, { status: 500 })
  }
}
