import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { caminhoMidia, urlDeUpload } from "@/lib/midia"
import { acessoAoKit } from "@/lib/kit-videomaker-server"

// POST /api/gravacoes/kit/upload — URL assinada para o navegador subir o arquivo
// do kit direto para o armazenamento (PDF do guia, vídeos de referência em 4K).
const TIPOS: Record<string, string> = { "application/pdf": "pdf", "video/mp4": "mp4", "video/quicktime": "mov", "image/jpeg": "jpg", "image/png": "png" }

export async function POST(req: NextRequest) {
  const acesso = await acessoAoKit(true)
  if (acesso instanceof NextResponse) return acesso
  const e = z.object({ contentType: z.string().max(100) }).strict().safeParse(await req.json().catch(() => null))
  const ext = e.success ? TIPOS[e.data.contentType] : undefined
  if (!ext) return NextResponse.json({ error: "Envie PDF, vídeo (MP4 ou MOV) ou imagem." }, { status: 400 })
  const destino = await urlDeUpload(caminhoMidia({ organizacaoId: acesso.organizacaoId, tipo: "kit", id: randomUUID(), ext }))
  if (!destino) return NextResponse.json({ error: "O armazenamento de arquivos não respondeu. Tente de novo ou use um link." }, { status: 503 })
  return NextResponse.json(destino)
}
