import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type Params = { params: Promise<{ id: string }> }

const TIPOS_VALIDOS = ["final", "brutos"] as const
type TipoVideo = (typeof TIPOS_VALIDOS)[number]

const EXT_MAPA: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/x-msvideo": "avi",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
}

// GET /api/demandas/[id]/upload-url?tipo=final&contentType=video%2Fmp4
// Retorna uma URL presigned do Supabase para upload direto do browser
// (bypass Vercel 4.5MB serverless body limit)
export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const sp = req.nextUrl.searchParams
  const tipo = sp.get("tipo") as TipoVideo
  const contentType = sp.get("contentType") ?? "video/mp4"

  if (!tipo || !TIPOS_VALIDOS.includes(tipo)) {
    return NextResponse.json({ error: `tipo deve ser: ${TIPOS_VALIDOS.join(", ")}` }, { status: 400 })
  }

  const demanda = await prisma.demanda.findUnique({ where: { id }, select: { id: true } })
  if (!demanda) return NextResponse.json({ error: "Demanda não encontrada" }, { status: 404 })

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Storage não configurado" }, { status: 500 })
  }

  const ext = EXT_MAPA[contentType] ?? "mp4"
  const objectPath = `videos/${id}/${tipo}/${Date.now()}.${ext}`
  const bucket = "uploads"

  // Solicita URL presigned para upload direto ao Supabase
  const signRes = await fetch(
    `${supabaseUrl}/storage/v1/object/sign/upload/${bucket}/${objectPath}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    }
  )

  if (!signRes.ok) {
    const errText = await signRes.text().catch(() => "")
    console.error("[upload-url] Supabase error:", errText)
    return NextResponse.json({ error: "Erro ao gerar URL de upload" }, { status: 500 })
  }

  const { signedURL } = await signRes.json() as { signedURL: string }
  const uploadUrl = `${supabaseUrl}${signedURL}`
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${objectPath}`

  return NextResponse.json({ uploadUrl, publicUrl, contentType })
}
