import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createClient } from "@supabase/supabase-js"

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
// Gera URL presigned do Supabase para upload direto do browser
// (bypassa o limite de 4.5MB do Vercel em funções serverless)
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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Storage não configurado (env vars ausentes)" }, { status: 500 })
  }

  const demanda = await prisma.demanda.findUnique({ where: { id }, select: { id: true } })
  if (!demanda) return NextResponse.json({ error: "Demanda não encontrada" }, { status: 404 })

  const ext = EXT_MAPA[contentType] ?? "mp4"
  const objectPath = `videos/${id}/${tipo}/${Date.now()}.${ext}`
  const bucket = "uploads"

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Usa o SDK oficial — trata auth e headers corretamente
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(objectPath)

  if (error || !data?.signedUrl) {
    const msg = error?.message ?? "Resposta inválida do Supabase"
    console.error("[upload-url] Supabase SDK error:", msg)
    return NextResponse.json(
      { error: `Erro ao gerar URL de upload: ${msg}` },
      { status: 500 }
    )
  }

  // signedUrl já inclui a URL base do Supabase
  const uploadUrl = data.signedUrl
  const { data: pubData } = supabase.storage.from(bucket).getPublicUrl(objectPath)

  return NextResponse.json({
    uploadUrl,
    publicUrl: pubData.publicUrl,
    contentType,
  })
}
