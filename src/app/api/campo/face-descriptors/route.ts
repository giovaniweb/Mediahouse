import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// POST /api/campo/face-descriptors
// Salva descritor facial (128 floats) para um upload de foto
// Requer sessão autenticada
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  let body: { uploadId?: string; descriptor?: number[] } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  const { uploadId, descriptor } = body

  if (!uploadId || !Array.isArray(descriptor) || descriptor.length !== 128) {
    return NextResponse.json(
      { error: "uploadId e descriptor (128 floats) são obrigatórios" },
      { status: 400 }
    )
  }

  // Verificar que o upload existe
  const upload = await prisma.eventoCoberturaUpload.findUnique({
    where: { id: uploadId },
    select: { id: true, tipo: true },
  })

  if (!upload) {
    return NextResponse.json({ error: "Upload não encontrado" }, { status: 404 })
  }

  if (upload.tipo !== "foto") {
    return NextResponse.json({ error: "Face descriptors só são suportados para fotos" }, { status: 400 })
  }

  const fd = await prisma.eventoFaceDescriptor.create({
    data: {
      uploadId,
      descriptor,
    },
    select: { id: true },
  })

  return NextResponse.json({ ok: true, id: fd.id })
}
