import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { declararOrg } from "@/lib/org-contexto"
import { orgPorCredencial } from "@/lib/org-por-credencial"

// POST /api/transcode/callback — chamado pelo worker de transcodificação (sem sessão).
// Protegido pelo header Authorization: Bearer $TRANSCODE_SECRET.
// Body: { arquivoId?, demandaId, mp4Url?, status: "done"|"skipped"|"failed", error? }
export async function POST(req: NextRequest) {
  const secret = process.env.TRANSCODE_SECRET
  if (!secret) {
    return NextResponse.json({ error: "TRANSCODE_SECRET não configurado" }, { status: 500 })
  }
  const auth = req.headers.get("authorization") ?? ""
  const bufA = Buffer.from(auth)
  const bufB = Buffer.from(`Bearer ${secret}`)
  if (bufA.length !== bufB.length || !timingSafeEqual(bufA, bufB)) {
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

  // O worker é autenticado por segredo, mas não tem sessão: a empresa vem do
  // arquivo que ele está reportando. Sem isso, sob RLS o callback não acharia
  // nada e o vídeo transcodificado nunca substituiria o original.
  if (arquivoId) {
    const organizacaoId = await orgPorCredencial("arquivo", arquivoId)
    if (!organizacaoId) return NextResponse.json({ error: "arquivo não encontrado" }, { status: 404 })
    declararOrg(organizacaoId)
  }

  // Sucesso: troca a URL do vídeo pelo MP4 em todos os lugares
  if (status === "done" && mp4Url && arquivoId) {
    const arq = await prisma.arquivo.findUnique({
      where: { id: arquivoId },
      select: { url: true, nomeArquivo: true, demandaId: true },
    })
    if (!arq) return NextResponse.json({ error: "arquivo não encontrado" }, { status: 404 })

    const urlAntiga = arq.url
    const nomeMp4 = (arq.nomeArquivo ?? "video").replace(/\.[^./]+$/, "") + ".mp4"

    // A demanda que vale é a do arquivo, não a que veio no corpo. O worker é
    // autenticado pelo segredo, mas o `demandaId` do payload é só um texto — e
    // ele mandava um UPDATE. Vindo do arquivo, o alvo é o dono de verdade, e o
    // escopo de empresa vem junto pela demanda.
    const alvoDemandaId = arq.demandaId
    if (demandaId && demandaId !== alvoDemandaId) {
      console.warn(
        `[transcode] callback do arquivo ${arquivoId} veio com demandaId ${demandaId}, ` +
          `mas o arquivo é da demanda ${alvoDemandaId} — usando a do arquivo.`
      )
    }

    // 1) Arquivo: guarda backup do original e aponta para o MP4
    await prisma.arquivo.update({
      where: { id: arquivoId },
      data: { originalUrl: urlAntiga, url: mp4Url, nomeArquivo: nomeMp4, transcodeStatus: "done" },
    })

    // 2) Demanda.linkFinal (se apontava para o vídeo antigo)
    await prisma.demanda.updateMany({
      where: { id: alvoDemandaId, linkFinal: urlAntiga },
      data: { linkFinal: mp4Url },
    })
    // thumbnail antiga continua válida; nada a fazer

    // 3) AprovacaoVideo pendente que usava o vídeo antigo → passa a mostrar o MP4.
    // O filtro era só a URL: uma varredura na tabela inteira, de todas as
    // empresas. Agora não sai da demanda do arquivo.
    await prisma.aprovacaoVideo.updateMany({
      where: { demandaId: alvoDemandaId, urlVideo: urlAntiga, status: "pendente" },
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
