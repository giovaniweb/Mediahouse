import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// POST /api/publico/cobertura/[slug]/face-search
// Busca fotos/vídeos onde o rosto aparece via distância euclidiana
// Sem autenticação — rota pública (para o cliente final)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  let body: { descriptor?: number[]; threshold?: number } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  const { descriptor, threshold = 0.6 } = body

  if (!Array.isArray(descriptor) || descriptor.length !== 128) {
    return NextResponse.json(
      { error: "descriptor (128 floats) é obrigatório" },
      { status: 400 }
    )
  }

  // Buscar cobertura por slug
  const cobertura = await prisma.eventoCobertura.findUnique({
    where: { slug },
    select: { id: true, titulo: true, linkDownloadPublico: true },
  })

  if (!cobertura) {
    return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 })
  }

  // Buscar todos os face descriptors desta cobertura
  const allDescriptors = await prisma.eventoFaceDescriptor.findMany({
    where: {
      upload: { coberturaId: cobertura.id },
    },
    select: {
      id: true,
      descriptor: true,
      upload: {
        select: {
          id: true,
          url: true,
          thumbnailUrl: true,
          dia: true,
          titulo: true,
          momento: true,
          tipo: true,
        },
      },
    },
  })

  // Calcular distância euclidiana para cada descritor
  function euclideanDistance(a: number[], b: number[]): number {
    let sum = 0
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i]
      sum += diff * diff
    }
    return Math.sqrt(sum)
  }

  const matches: Array<{
    uploadId: string
    url: string
    thumbnailUrl: string | null
    dia: number
    titulo: string | null
    momento: string
    tipo: string
    distancia: number
  }> = []

  const seenUploadIds = new Set<string>()

  for (const fd of allDescriptors) {
    const storedDescriptor = fd.descriptor as number[]
    const distancia = euclideanDistance(descriptor, storedDescriptor)

    if (distancia < threshold && !seenUploadIds.has(fd.upload.id)) {
      seenUploadIds.add(fd.upload.id)
      matches.push({
        uploadId: fd.upload.id,
        url: fd.upload.url,
        thumbnailUrl: fd.upload.thumbnailUrl,
        dia: fd.upload.dia,
        titulo: fd.upload.titulo,
        momento: fd.upload.momento,
        tipo: fd.upload.tipo,
        distancia: Math.round(distancia * 1000) / 1000,
      })
    }
  }

  // Ordenar por distância (mais parecido primeiro)
  matches.sort((a, b) => a.distancia - b.distancia)

  return NextResponse.json({
    matches,
    total: matches.length,
    cobertura: { titulo: cobertura.titulo },
  })
}
