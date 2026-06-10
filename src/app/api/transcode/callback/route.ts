import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// POST /api/transcode/callback — chamado pelo worker de transcodificação (sem sessão).
// Protegido pelo header Authorization: Bearer $TRANSCODE_SECRET.
// Body: { arquivoId?, demandaId, mp4Url?, status: "done"|"skipped"|"failed", error? }
export async function POST(req: NextRequest) {
  const secret = process.env.TRANSCODE_SECRET
  const auth = req.headers.get("authorization") ?? ""
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as {
    arquivoId?: string
    demandaId?: string
    mp4Url?: string
    status?: string
    error?: string
  }
  const { arquivoId, demandaId, mp4Url, status } = body

  if (!status) return NextResponse.json({ error: "status obrigatório" }, { status: 400 })

  // Sucesso: troca a URL do vídeo pelo MP4 em todos os lugares
  if (status === "done" && mp4Url && arquivoId) {
    const arq = await prisma.arquivo.findUnique({ where: { id: arquivoId } })
    if (!arq) return NextResponse.json({ error: "arquivo não encontrado" }, { status: 404 })

    const urlAntiga = arq.url
    const nomeMp4 = (arq.nomeArquivo ?? "video").replace(/\.[^./]+$/, "") + ".mp4"

    // 1) Arquivo: guarda backup do original e aponta para o MP4
    await prisma.arquivo.update({
      where: { id: arquivoId },
      data: { originalUrl: urlAntiga, url: mp4Url, nomeArquivo: nomeMp4, transcodeStatus: "done" },
    })

    // 2) Demanda.linkFinal (se apontava para o vídeo antigo)
    if (demandaId) {
      await prisma.demanda.updateMany({
        where: { id: demandaId, linkFinal: urlAntiga },
        data: { linkFinal: mp4Url },
      })
      // thumbnail antiga continua válida; nada a fazer
    }

    // 3) AprovacaoVideo pendente que usava o vídeo antigo → passa a mostrar o MP4
    await prisma.aprovacaoVideo.updateMany({
      where: { urlVideo: urlAntiga, status: "pendente" },
      data: { urlVideo: mp4Url },
    })

    return NextResponse.json({ ok: true, updated: true })
  }

  // skipped / failed → só registra o status no Arquivo (original permanece acessível)
  if (arquivoId) {
    await prisma.arquivo.update({
      where: { id: arquivoId },
      data: { transcodeStatus: status === "failed" ? "failed" : "skipped" },
    }).catch(() => null)
  }

  return NextResponse.json({ ok: true, status })
}
