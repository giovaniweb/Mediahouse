import { NextRequest, NextResponse } from "next/server"
import { getAccessToken } from "@/lib/google-drive"
import { prisma } from "@/lib/prisma"
import { declararOrg } from "@/lib/org-contexto"
import { orgPublica } from "@/lib/org"
import { PUBLICADO, SEM_CACHE_MIDIA } from "@/lib/publicacao-midia"
import { driveFileId } from "@/lib/drive-file-id"

// GET /api/publico/drive-thumbnail?fileId={id}
// Rota pública: retorna thumbnail de arquivo do Drive usando service account.
// A galeria pública usa este proxy para contornar a exigência de autenticação
// da URL https://drive.google.com/thumbnail?id=X (que requer cookies de sessão Google).
// Apenas snapshots explicitamente publicados da empresa pública selecionada.
export async function GET(req: NextRequest) {
  const fileId = req.nextUrl.searchParams.get("fileId")
  if (!fileId || !/^[a-zA-Z0-9_-]{10,}$/.test(fileId)) {
    return NextResponse.json({ error: "fileId inválido" }, { status: 400 })
  }

  const organizacaoId = await orgPublica(req.nextUrl.searchParams.get("org"))
  if (!organizacaoId) return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 })
  declararOrg(organizacaoId)

  try {
    const arquivos = await prisma.arquivo.findMany({
      where: { ...PUBLICADO, demanda: { organizacaoId }, publicacaoUrl: { contains: fileId } },
      select: { publicacaoUrl: true },
    })
    if (!arquivos.some(a => driveFileId(a.publicacaoUrl) === fileId)) {
      return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404, headers: SEM_CACHE_MIDIA })
    }
    const token = await getAccessToken(organizacaoId)
    if (!token) return NextResponse.json({ error: "Arquivo indisponível" }, { status: 502, headers: SEM_CACHE_MIDIA })

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
    return NextResponse.redirect(largerThumb, { headers: SEM_CACHE_MIDIA })
  } catch (e) {
    console.error("[drive-thumbnail] Erro:", e)
    return NextResponse.json({ error: "Erro ao buscar thumbnail" }, { status: 500 })
  }
}
