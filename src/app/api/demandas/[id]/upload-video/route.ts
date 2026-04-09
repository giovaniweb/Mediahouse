import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type Params = { params: Promise<{ id: string }> }

const TIPOS_VALIDOS = ["final", "brutos"] as const
type TipoVideo = (typeof TIPOS_VALIDOS)[number]

const MIME_VALIDOS = [
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/webm",
  "video/x-matroska",
  "application/zip",
  "application/x-zip-compressed",
]

const EXT_MAPA: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/x-msvideo": "avi",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
}

const MAX_SIZE = 500 * 1024 * 1024 // 500MB

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params

  const demanda = await prisma.demanda.findUnique({ where: { id }, select: { id: true } })
  if (!demanda) return NextResponse.json({ error: "Demanda não encontrada" }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  const tipo = formData.get("tipo") as string | null

  if (!file) return NextResponse.json({ error: "Arquivo obrigatório" }, { status: 400 })
  if (!tipo || !TIPOS_VALIDOS.includes(tipo as TipoVideo)) {
    return NextResponse.json({ error: `tipo deve ser: ${TIPOS_VALIDOS.join(", ")}` }, { status: 400 })
  }

  if (!MIME_VALIDOS.includes(file.type)) {
    return NextResponse.json(
      { error: `Tipo não suportado. Use: mp4, mov, avi, webm, mkv ou zip.` },
      { status: 400 }
    )
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Arquivo muito grande. Máximo 500MB." }, { status: 400 })
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Storage não configurado" }, { status: 500 })
  }

  const ext = EXT_MAPA[file.type] ?? "mp4"
  const path = `videos/${id}/${tipo}/${Date.now()}.${ext}`

  const arrayBuffer = await file.arrayBuffer()
  const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/uploads/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": file.type || "video/mp4",
    },
    body: arrayBuffer,
  })

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => "Erro desconhecido")
    console.error("[upload-video] Erro Supabase:", errText)
    return NextResponse.json({ error: "Falha ao fazer upload. Tente novamente." }, { status: 500 })
  }

  const url = `${supabaseUrl}/storage/v1/object/public/uploads/${path}`

  // Atualiza o campo correto na demanda
  const campo = tipo === "final" ? "linkFinal" : "linkBrutos"
  await prisma.demanda.update({
    where: { id },
    data: { [campo]: url },
  })

  return NextResponse.json({ ok: true, url, campo })
}
