import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { criarSessaoUploadDrive } from "@/lib/google-drive"

type Params = { params: Promise<{ id: string }> }

/**
 * GET /api/demandas/[id]/drive-upload-url
 *   ?fileName=NomeArquivo.mp4
 *   &fileSize=104857600
 *   &contentType=video%2Fmp4
 *
 * Cria uma sessão de upload resumável no Google Drive.
 * Retorna { sessionUri, fileId, publicUrl } para que o browser
 * faça o PUT diretamente no Google (sem passar pelo Vercel).
 */
export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const sp = req.nextUrl.searchParams

  const fileName = sp.get("fileName") ?? "video.mp4"
  const fileSizeStr = sp.get("fileSize")
  const contentType = sp.get("contentType") ?? "video/mp4"

  if (!fileSizeStr || isNaN(Number(fileSizeStr))) {
    return NextResponse.json({ error: "fileSize é obrigatório e deve ser numérico" }, { status: 400 })
  }

  const fileSize = Number(fileSizeStr)

  // Verifica se a demanda existe
  const demanda = await prisma.demanda.findUnique({
    where: { id },
    select: { id: true, codigo: true },
  })
  if (!demanda) {
    return NextResponse.json({ error: "Demanda não encontrada" }, { status: 404 })
  }

  try {
    const result = await criarSessaoUploadDrive({ fileName, fileSize, contentType })
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao criar sessão Drive"
    console.error("[drive-upload-url]", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
