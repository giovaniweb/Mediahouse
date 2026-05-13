import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"

/**
 * POST /api/demandas/[id]/drive-upload-chunk
 *
 * Proxy de upload em chunks para o Google Drive.
 * Recebe um bloco binário do browser e o encaminha para a sessão
 * resumável do Drive usando o header Content-Range.
 *
 * Motivo do proxy: sessões de Service Account no Google Drive não aceitam
 * PUT direto do browser por restrições de CORS. Roteando pelo servidor,
 * a comunicação é server-to-server (sem CORS).
 *
 * Headers obrigatórios:
 *   x-session-uri   — URI da sessão resumável obtida em /drive-upload-url
 *   x-offset        — byte de início do chunk (ex: "0")
 *   x-total-size    — tamanho total do arquivo em bytes
 *   x-content-type  — MIME type do vídeo (ex: "video/mp4")
 *
 * Resposta:
 *   { ok: true, done: true }   — upload completo (HTTP 200/201 do Drive)
 *   { ok: true, done: false }  — chunk recebido, enviar próximo (HTTP 308)
 *   { error: string }          — falha
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const sessionUri  = req.headers.get("x-session-uri")
  const offsetStr   = req.headers.get("x-offset")
  const totalStr    = req.headers.get("x-total-size")
  const contentType = req.headers.get("x-content-type") ?? "video/mp4"

  if (!sessionUri || offsetStr == null || totalStr == null) {
    return NextResponse.json({ error: "Headers x-session-uri, x-offset e x-total-size são obrigatórios" }, { status: 400 })
  }

  // Validação básica para impedir uso indevido como proxy genérico
  if (!sessionUri.startsWith("https://www.googleapis.com/upload/drive/")) {
    return NextResponse.json({ error: "URI de sessão inválida" }, { status: 400 })
  }

  const offset    = parseInt(offsetStr)
  const totalSize = parseInt(totalStr)

  if (isNaN(offset) || isNaN(totalSize) || totalSize <= 0) {
    return NextResponse.json({ error: "x-offset ou x-total-size inválido" }, { status: 400 })
  }

  try {
    const chunk = await req.arrayBuffer()
    const end   = offset + chunk.byteLength - 1

    const driveRes = await fetch(sessionUri, {
      method: "PUT",
      headers: {
        "Content-Type":   contentType,
        "Content-Range":  `bytes ${offset}-${end}/${totalSize}`,
        "Content-Length": String(chunk.byteLength),
      },
      body: chunk,
      // @ts-ignore — duplex necessário no Node.js fetch para body streaming
      duplex: "half",
    })

    // 200/201 = upload concluído
    if (driveRes.status === 200 || driveRes.status === 201) {
      return NextResponse.json({ ok: true, done: true })
    }

    // 308 = chunk aceito, sessão aguarda mais dados
    if (driveRes.status === 308) {
      return NextResponse.json({ ok: true, done: false })
    }

    // Qualquer outro status é erro
    const errText = await driveRes.text().catch(() => "")
    return NextResponse.json(
      { error: `Drive retornou HTTP ${driveRes.status}: ${errText.slice(0, 300)}` },
      { status: 502 }
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[drive-upload-chunk]", msg)
    return NextResponse.json({ error: `Erro ao enviar chunk: ${msg}` }, { status: 500 })
  }
}
