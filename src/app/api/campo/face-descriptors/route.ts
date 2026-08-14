import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"

// POST /api/campo/face-descriptors
// Salva descritor facial (128 floats) para um upload de foto.
// Descritor facial é dado biométrico: o upload precisa pertencer à organização
// do usuário logado, não basta existir.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

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

  // Upload precisa existir E pertencer à organização da sessão
  const upload = await prisma.eventoCoberturaUpload.findFirst({
    where: { id: uploadId, cobertura: { organizacaoId } },
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
