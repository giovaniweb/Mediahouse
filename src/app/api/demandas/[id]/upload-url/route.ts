import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireDemandaOrg } from "@/lib/org"
import { caminhoMidia, urlDeUpload } from "@/lib/midia"

type Params = { params: Promise<{ id: string }> }

const TIPOS_VALIDOS = ["final", "brutos", "thumbnail", "documento"] as const
type TipoUpload = (typeof TIPOS_VALIDOS)[number]

const EXT_MAPA: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/x-msvideo": "avi",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
  "image/jpeg": "jpg",
  "image/png":  "png",
  "image/webp": "webp",
  // Documentos
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "text/csv": "csv",
}

// GET /api/demandas/[id]/upload-url?tipo=final&contentType=video%2Fmp4
// Também aceita tipo=thumbnail&contentType=image%2Fjpeg para thumbnails
// Gera URL presigned do Supabase para upload direto do browser
export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const guard = await requireDemandaOrg(session, id)
  if (guard instanceof NextResponse) return guard
  const sp = req.nextUrl.searchParams
  const tipo = sp.get("tipo") as TipoUpload
  const contentType = sp.get("contentType") ?? "video/mp4"

  if (!tipo || !TIPOS_VALIDOS.includes(tipo)) {
    return NextResponse.json({ error: `tipo deve ser: ${TIPOS_VALIDOS.join(", ")}` }, { status: 400 })
  }

  const demanda = await prisma.demanda.findUnique({ where: { id }, select: { id: true } })
  if (!demanda) return NextResponse.json({ error: "Demanda não encontrada" }, { status: 404 })

  const ext = EXT_MAPA[contentType] ?? (tipo === "thumbnail" ? "jpg" : tipo === "documento" ? "pdf" : "mp4")
  // Bucket PRIVADO, caminho com a organização dona. O bucket antigo era público:
  // briefing e vídeo de cliente ficavam legíveis por qualquer um com a URL.
  const caminho = caminhoMidia({
    organizacaoId: guard.organizacaoId,
    tipo: tipo === "thumbnail" ? "thumbnails" : tipo === "documento" ? "docs" : "videos",
    id,
    ext,
  })

  const midia = await urlDeUpload(caminho)
  if (!midia) return NextResponse.json({ error: "Storage indisponível" }, { status: 502 })

  return NextResponse.json({
    uploadUrl: midia.uploadUrl,
    // Quem chama grava isto no banco. É URL do nosso app: as telas seguem
    // usando <img src> e <video src> sem mudar, e o acesso passa a ser conferido.
    publicUrl: midia.url,
    contentType,
  })
}
