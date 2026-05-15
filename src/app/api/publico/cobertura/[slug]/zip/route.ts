import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import archiver from "archiver"
import { Readable } from "stream"

/** Convert a Web ReadableStream to a Node.js Readable */
function webStreamToNodeReadable(webStream: ReadableStream<Uint8Array>): Readable {
  const reader = webStream.getReader()
  return new Readable({
    async read() {
      try {
        const { done, value } = await reader.read()
        if (done) {
          this.push(null)
        } else {
          this.push(Buffer.from(value))
        }
      } catch (e) {
        this.destroy(e as Error)
      }
    },
    async destroy(err, callback) {
      reader.cancel().catch(() => {})
      callback(err)
    },
  })
}

type Params = { params: Promise<{ slug: string }> }

// GET /api/publico/cobertura/[slug]/zip — stream ZIP sem auth
export async function GET(req: NextRequest, { params }: Params) {
  const { slug } = await params
  const senha = req.nextUrl.searchParams.get("senha")

  const cobertura = await prisma.eventoCobertura.findUnique({
    where: { slug },
    select: {
      titulo: true,
      linkDownloadPublico: true,
      senhaDownload: true,
      uploads: {
        where: { tipo: "video" },
        orderBy: [{ dia: "asc" }, { createdAt: "asc" }],
        select: { id: true, dia: true, titulo: true, url: true },
      },
    },
  })

  if (!cobertura) return new NextResponse("Evento não encontrado", { status: 404 })
  if (!cobertura.linkDownloadPublico) return new NextResponse("Download não disponível", { status: 403 })
  if (cobertura.senhaDownload && senha !== cobertura.senhaDownload) {
    return new NextResponse("Senha incorreta", { status: 401 })
  }

  if (cobertura.uploads.length === 0) {
    return new NextResponse("Nenhum vídeo disponível para download", { status: 404 })
  }

  const sanitize = (s: string) =>
    s
      .replace(/[/\\:*?"<>|]/g, "")
      .trim()
      .replace(/\s+/g, "_")

  const nomeArquivo = `${sanitize(cobertura.titulo)}.zip`

  // Criar stream ZIP
  const archive = archiver("zip", { zlib: { level: 1 } }) // level 1 = fast, videos are already compressed

  // Node.js Readable → Web ReadableStream
  const nodeStream = new Readable({ read() {} })

  archive.on("data", (chunk: Buffer) => nodeStream.push(chunk))
  archive.on("end", () => nodeStream.push(null))
  archive.on("error", (err: Error) => nodeStream.destroy(err))

  // Adicionar vídeos ao ZIP de forma assíncrona
  ;(async () => {
    const contadores: Record<number, number> = {}
    for (const upload of cobertura.uploads) {
      try {
        const res = await fetch(upload.url)
        if (!res.ok || !res.body) continue

        const dia = upload.dia
        contadores[dia] = (contadores[dia] ?? 0) + 1
        const seq = String(contadores[dia]).padStart(3, "0")
        const ext = upload.url.split(".").pop()?.split("?")[0] ?? "mp4"
        const nomeVid = upload.titulo
          ? `${sanitize(upload.titulo)}.${ext}`
          : `dia-${dia}_${seq}.${ext}`

        archive.append(webStreamToNodeReadable(res.body), { name: `dia-${dia}/${nomeVid}` })
      } catch (e) {
        console.error(`[ZIP] Erro ao adicionar ${upload.url}:`, e)
      }
    }
    await archive.finalize()
  })()

  // Converter Node.js Readable para Web ReadableStream
  const webStream = new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk) => controller.enqueue(chunk))
      nodeStream.on("end", () => controller.close())
      nodeStream.on("error", (e) => controller.error(e))
    },
  })

  return new NextResponse(webStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
      "Cache-Control": "no-store",
    },
  })
}
