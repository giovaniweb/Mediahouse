import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { requireCoberturaOrg } from "@/lib/org"
import { caminhoMidia, urlDeUpload } from "@/lib/midia"

type Params = { params: Promise<{ id: string }> }

const EXT_MAPA: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mp4",  // iPhone grava .mov mas mandamos como mp4 para compatibilidade
  "video/x-msvideo": "avi",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "jpg",  // iOS HEIC → salvar como jpg
  "image/heif": "jpg",
}

// GET /api/coberturas/[id]/uploads/upload-url?tipo=video&contentType=video%2Fmp4&dia=1
export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const sp = req.nextUrl.searchParams
  const tipo = sp.get("tipo") ?? "video"
  const contentType = sp.get("contentType") ?? "video/mp4"
  const dia = sp.get("dia") ?? "1"

  // Confere que a cobertura é DESTA empresa. A rota subia arquivo em qualquer
  // cobertura pela id, sem checar dono — bastava trocar o id na URL.
  const guard = await requireCoberturaOrg(session, id)
  if (guard instanceof NextResponse) return guard

  const ext = EXT_MAPA[contentType] ?? (tipo === "thumbnail" ? "jpg" : "mp4")
  const caminho = caminhoMidia({
    organizacaoId: guard.organizacaoId,
    tipo: tipo === "thumbnail" ? "thumbnails" : "coberturas",
    id: tipo === "thumbnail" ? id : `${id}/dia-${dia}/${tipo}`,
    ext,
  })

  const midia = await urlDeUpload(caminho)
  if (!midia) return NextResponse.json({ error: "Storage indisponível" }, { status: 502 })

  return NextResponse.json({ uploadUrl: midia.uploadUrl, publicUrl: midia.url, contentType })
}
