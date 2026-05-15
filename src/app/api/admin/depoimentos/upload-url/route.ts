import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"

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
  if (!["admin", "gestor"].includes(session.user.tipo)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 })
  }

  const contentType = req.nextUrl.searchParams.get("contentType") ?? "video/mp4"
  const ext = EXT_MAPA[contentType] ?? "mp4"
  const objectPath = `depoimentos/${Date.now()}.${ext}`
  const bucket = "uploads"

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Storage não configurado (env vars ausentes)" }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Garante que o bucket existe — mesmo padrão do upload-url de demandas
  const { error: createBucketError } = await supabase.storage.createBucket(bucket, { public: true })
  if (createBucketError && !createBucketError.message.toLowerCase().includes("already exist")) {
    console.error("[depoimentos/upload-url] Falha ao criar bucket:", createBucketError.message)
    return NextResponse.json(
      { error: `Bucket '${bucket}' não pôde ser criado: ${createBucketError.message}` },
      { status: 500 }
    )
  }

  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(objectPath)

  if (error || !data?.signedUrl) {
    const msg = error?.message ?? "resposta inválida do Supabase"
    console.error("[depoimentos/upload-url] createSignedUploadUrl error:", msg)
    return NextResponse.json(
      { error: `Erro ao gerar URL de upload: ${msg}` },
      { status: 500 }
    )
  }

  const { data: pubData } = supabase.storage.from(bucket).getPublicUrl(objectPath)

  return NextResponse.json({
    uploadUrl: data.signedUrl,
    publicUrl: pubData.publicUrl,
    contentType,
  })
}
