import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { ehGestor } from "@/lib/papel"
import { getOrgId, semOrg } from "@/lib/org"
import { caminhoMidia, urlDeUpload } from "@/lib/midia"

const EXT_MAPA: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/x-msvideo": "avi",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
  "image/jpeg": "jpg",
}

// GET /api/admin/depoimentos/upload-url?contentType=video%2Fmp4
// Gera URL presigned do Supabase para upload direto do browser (depoimentos)
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  if (!ehGestor(session)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 })
  }

  const contentType = req.nextUrl.searchParams.get("contentType") ?? "video/mp4"
  const ext = EXT_MAPA[contentType] ?? "mp4"
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const caminho = caminhoMidia({ organizacaoId, tipo: "depoimentos", id: "geral", ext })

  const midia = await urlDeUpload(caminho)
  if (!midia) return NextResponse.json({ error: "Storage indisponível" }, { status: 502 })

  return NextResponse.json({ uploadUrl: midia.uploadUrl, publicUrl: midia.url, contentType })
}
