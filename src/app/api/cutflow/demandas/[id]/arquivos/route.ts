import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAccessToken } from "@/lib/google-drive"
import { autenticarCutflow, pastaDoDrive } from "@/lib/cutflow"

type Params = { params: Promise<{ id: string }> }

const PASTA = "application/vnd.google-apps.folder"
/** Menos que a hora do token do Google: o plugin pede de novo antes de vencer. */
const VALIDADE_TOKEN_MS = 45 * 60 * 1000

type ArquivoDrive = { id: string; name: string; size?: string; mimeType: string }

async function listar(pasta: string, token: string): Promise<{ ok: true; itens: ArquivoDrive[] } | { ok: false; status: number }> {
  const itens: ArquivoDrive[] = []
  let pagina: string | undefined
  do {
    const url = new URL("https://www.googleapis.com/drive/v3/files")
    url.searchParams.set("q", `'${pasta}' in parents and trashed = false`)
    url.searchParams.set("fields", "nextPageToken, files(id, name, size, mimeType)")
    url.searchParams.set("pageSize", "200")
    url.searchParams.set("supportsAllDrives", "true")
    url.searchParams.set("includeItemsFromAllDrives", "true")
    if (pagina) url.searchParams.set("pageToken", pagina)
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return { ok: false, status: res.status }
    const dados = (await res.json()) as { files?: ArquivoDrive[]; nextPageToken?: string }
    itens.push(...(dados.files ?? []))
    pagina = dados.nextPageToken
  } while (pagina && itens.length < 1000)
  return { ok: true, itens }
}

// GET /api/cutflow/demandas/[id]/arquivos — os vídeos da pasta de material bruto
// do card, mais um token do Drive de vida curta SÓ para o plugin baixar.
//
// Exige que ESTE computador tenha puxado o card: sem isso, qualquer sessão do
// plugin listaria a pasta de qualquer card da empresa.
//
// O token é o da conta do Drive conectada ao NuFlow (a mesma que o NuFlow já usa
// para criar as pastas). O plugin o guarda só em memória. Pasta de outra conta
// sem compartilhamento, ou link que não é pasta do Drive, NUNCA falha calado: a
// resposta diz o que fazer.
export async function GET(req: NextRequest, { params }: Params) {
  const ctx = await autenticarCutflow(req)
  if (ctx instanceof NextResponse) return ctx
  const { organizacaoId } = ctx
  const { id } = await params

  const puxada = await prisma.cutflowPuxada.findUnique({ where: { demandaId: id, organizacaoId }, select: { sessaoId: true } })
  if (!puxada || puxada.sessaoId !== ctx.sessaoId) {
    return NextResponse.json({ error: "Puxe o card neste computador antes de baixar o material." }, { status: 409 })
  }
  const demanda = await prisma.demanda.findFirst({
    where: { id, organizacaoId },
    select: { linkFolderBrutos: true, linkBrutos: true },
  })
  if (!demanda) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

  const link = demanda.linkFolderBrutos ?? demanda.linkBrutos ?? null
  if (!link) return NextResponse.json({ arquivos: [], aviso: "O card não tem link de material bruto." })
  const pasta = pastaDoDrive(link)
  if (!pasta) {
    return NextResponse.json({ arquivos: [], manual: true, link, aviso: "O link do material bruto não é uma pasta do Google Drive. Baixe à mão pelo link." })
  }

  let token: string
  try {
    token = await getAccessToken(organizacaoId)
  } catch {
    return NextResponse.json({ error: "O Google Drive não está conectado no NuFlow desta empresa." }, { status: 502 })
  }

  const raiz = await listar(pasta, token)
  if (!raiz.ok) {
    if (raiz.status === 403 || raiz.status === 404) {
      return NextResponse.json({
        arquivos: [], semAcesso: true, link,
        aviso: "O NuFlow não enxerga esta pasta. Peça a quem enviou para compartilhar com a conta do Drive conectada ao NuFlow, ou abrir para \"qualquer pessoa com o link\".",
      })
    }
    return NextResponse.json({ error: `O Google Drive recusou a listagem (${raiz.status}).` }, { status: 502 })
  }
  // Um nível de subpasta: quem envia costuma separar por câmera ou por dia.
  const arquivos: { id: string; nome: string; tamanho: number | null; tipo: string; subpasta: string | null }[] = []
  for (const item of raiz.itens) {
    if (item.mimeType === PASTA) {
      const sub = await listar(item.id, token)
      if (sub.ok) {
        for (const s of sub.itens) if (s.mimeType.startsWith("video/")) arquivos.push({ id: s.id, nome: s.name, tamanho: s.size ? Number(s.size) : null, tipo: s.mimeType, subpasta: item.name })
      }
    } else if (item.mimeType.startsWith("video/")) {
      arquivos.push({ id: item.id, nome: item.name, tamanho: item.size ? Number(item.size) : null, tipo: item.mimeType, subpasta: null })
    }
  }
  return NextResponse.json({
    arquivos, link, token,
    tokenExpiraEm: new Date(Date.now() + VALIDADE_TOKEN_MS).toISOString(),
    ignorados: raiz.itens.filter((i) => i.mimeType !== PASTA && !i.mimeType.startsWith("video/")).length,
  })
}
