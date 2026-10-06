import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { ideiaEditavel } from "@/lib/social"
import { caminhoMidia, urlDeUpload } from "@/lib/midia"

type Params = { params: Promise<{ id: string }> }

// Os mesmos tipos de documento e imagem que o anexo de demanda aceita
// (ACCEPT_DOCUMENTOS em lib/upload-documento.ts).
const EXTENSAO: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "text/csv": "csv",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

// GET /api/social/ideias/[id]/anexo?contentType=… — URL para subir o arquivo de
// referência da IDEIA, direto do navegador para o bucket privado. O caminho é
// da ideia (org/{org}/docs/{ideiaId}/…); quem grava a lista é o PATCH da ideia,
// e a leitura passa pela conferência de lib/midia-acesso.ts.
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params
  const r = await ideiaEditavel(await auth(), id)
  if (r instanceof NextResponse) return r

  const ext = EXTENSAO[req.nextUrl.searchParams.get("contentType") ?? ""]
  if (!ext) return NextResponse.json({ error: "Tipo de arquivo não aceito. Use PDF, Word, Excel, PowerPoint, texto ou imagem." }, { status: 400 })

  const midia = await urlDeUpload(caminhoMidia({ organizacaoId: r.escopo.organizacaoId, tipo: "docs", id, ext }))
  if (!midia) return NextResponse.json({ error: "Armazenamento indisponível. Tente de novo em alguns minutos." }, { status: 502 })
  return NextResponse.json({ uploadUrl: midia.uploadUrl, url: midia.url })
}
