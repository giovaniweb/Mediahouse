import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/org"
import { getAccessToken } from "@/lib/google-drive"

// Backfill ASSISTIDO do vídeo final a partir da pasta de brutos no Drive.
// Regra dura: brutos ≠ final. Esta rota NUNCA aplica sozinha — o GET só PROPÕE
// um candidato (dry-run); o POST grava apenas o candidato CONFIRMADO pelo humano.
// Restrito a super-admin.

function extrairFolderId(url: string | null): string | null {
  if (!url) return null
  const m = url.match(/\/folders\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  return m ? m[1] : null
}

type DriveFile = { id: string; name: string; mimeType: string; size?: string; webViewLink?: string }

function ehVideo(f: DriveFile): boolean {
  return f.mimeType?.startsWith("video/") || /\.(mp4|mov|m4v|webm|avi)$/i.test(f.name ?? "")
}

// GET /api/admin/scan-drive-final?demandaId=... — dry-run: propõe um candidato a vídeo final.
export async function GET(req: NextRequest) {
  const session = await auth()
  const guard = await requireSuperAdmin(session)
  if (guard instanceof NextResponse) return guard

  const demandaId = req.nextUrl.searchParams.get("demandaId")
  if (!demandaId) return NextResponse.json({ error: "demandaId obrigatório" }, { status: 400 })

  const demanda = await prisma.demanda.findUnique({
    where: { id: demandaId },
    select: { id: true, organizacaoId: true, linkBrutos: true, linkFinal: true },
  })
  if (!demanda) return NextResponse.json({ error: "Demanda não encontrada" }, { status: 404 })

  const folderId = extrairFolderId(demanda.linkBrutos)
  if (!folderId) {
    return NextResponse.json({ candidate: null, motivo: "Demanda sem pasta de brutos no Drive" })
  }

  let files: DriveFile[] = []
  try {
    const token = await getAccessToken(demanda.organizacaoId)
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`)
    const fields = encodeURIComponent("files(id,name,mimeType,size,webViewLink)")
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      const txt = await res.text().catch(() => "")
      return NextResponse.json({ candidate: null, motivo: `Erro ao ler a pasta no Drive (${res.status})`, detalhe: txt.slice(0, 200) })
    }
    files = ((await res.json()) as { files?: DriveFile[] }).files ?? []
  } catch (e) {
    return NextResponse.json({ candidate: null, motivo: `Falha na integração com o Drive: ${e instanceof Error ? e.message : String(e)}` })
  }

  const videos = files.filter(ehVideo)
  if (videos.length === 0) {
    return NextResponse.json({ candidate: null, motivo: "Nenhum arquivo de vídeo na pasta de brutos", totalArquivos: files.length })
  }

  // Heurística: prioriza nomes de "peça pronta"; senão, o maior arquivo.
  const porNome = videos.filter((v) => /(final|pronto|edit|entrega|aprovad)/i.test(v.name))
  let candidato: DriveFile
  let confianca: "alta" | "media" | "baixa"
  if (porNome.length === 1) { candidato = porNome[0]; confianca = "alta" }
  else if (videos.length === 1) { candidato = videos[0]; confianca = "media" }
  else {
    const pool = porNome.length > 0 ? porNome : videos
    candidato = pool.reduce((a, b) => (Number(b.size ?? 0) > Number(a.size ?? 0) ? b : a))
    confianca = porNome.length > 0 ? "media" : "baixa"
  }

  return NextResponse.json({
    candidate: {
      url: candidato.webViewLink ?? `https://drive.google.com/file/d/${candidato.id}/view`,
      nomeArquivo: candidato.name,
      tamanho: candidato.size ? Number(candidato.size) : null,
      confianca,
    },
    totalVideosNaPasta: videos.length,
  })
}

// POST /api/admin/scan-drive-final — aplica o candidato CONFIRMADO como vídeo final.
// Body: { demandaId, url, nomeArquivo }
export async function POST(req: NextRequest) {
  const session = await auth()
  const guard = await requireSuperAdmin(session)
  if (guard instanceof NextResponse) return guard

  const body = await req.json().catch(() => ({})) as { demandaId?: string; url?: string; nomeArquivo?: string }
  if (!body.demandaId || !body.url) {
    return NextResponse.json({ error: "demandaId e url são obrigatórios" }, { status: 400 })
  }

  const demanda = await prisma.demanda.findUnique({
    where: { id: body.demandaId },
    select: { id: true },
  })
  if (!demanda) return NextResponse.json({ error: "Demanda não encontrada" }, { status: 404 })

  await prisma.arquivo.create({
    data: {
      demandaId: demanda.id,
      tipoArquivo: "final",
      nomeArquivo: body.nomeArquivo ?? "video-final",
      url: body.url,
      origem: "backfill-drive",
      sequencia: 1,
    },
  })
  await prisma.demanda.update({ where: { id: demanda.id }, data: { linkFinal: body.url } })

  return NextResponse.json({ ok: true })
}
