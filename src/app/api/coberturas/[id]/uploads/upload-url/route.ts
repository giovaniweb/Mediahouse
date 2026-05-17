import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"

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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Storage não configurado (env vars ausentes)" }, { status: 500 })
  }

  const ext = EXT_MAPA[contentType] ?? (tipo === "thumbnail" ? "jpg" : "mp4")
  const objectPath =
    tipo === "thumbnail"
      ? `coberturas/${id}/thumbnails/${Date.now()}.jpg`
      : `coberturas/${id}/dia-${dia}/${tipo}/${Date.now()}.${ext}`
  const bucket = "uploads"

  const supabase = createClient(supabaseUrl, supabaseKey)

  const { error: createBucketError } = await supabase.storage.createBucket(bucket, { public: true })
  if (createBucketError && !createBucketError.message.toLowerCase().includes("already exist")) {
    console.error("[coberturas/upload-url] Falha ao criar bucket:", createBucketError.message)
    return NextResponse.json(
      { error: `Bucket '${bucket}' não pôde ser criado: ${createBucketError.message}` },
      { status: 500 }
    )
  }

  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(objectPath)

  if (error || !data?.signedUrl) {
    const msg = error?.message ?? "Resposta inválida do Supabase"
    console.error("[coberturas/upload-url] Supabase error:", msg)
    return NextResponse.json({ error: `Erro ao gerar URL de upload: ${msg}` }, { status: 500 })
  }

  const { data: pubData } = supabase.storage.from(bucket).getPublicUrl(objectPath)

  return NextResponse.json({ uploadUrl: data.signedUrl, publicUrl: pubData.publicUrl, contentType })
}
