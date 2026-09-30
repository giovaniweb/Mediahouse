import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { criarSessaoUploadDrive } from "@/lib/google-drive"
import { assinarEnvio, autenticarCutflow, pastaDoDrive } from "@/lib/cutflow"

type Params = { params: Promise<{ id: string }> }

const TIPOS = ["video/mp4", "video/quicktime"]
const MAXIMO = 20 * 1024 ** 3

// POST /api/cutflow/demandas/[id]/envio — "Enviar para aprovação", passo 1.
//
// Abre uma sessão de upload resumável no Drive, na pasta "Material pronto" do
// card (linkFolderFinal) ou, sem ela, na pasta raiz da empresa — a mesma função
// que a tela usa. O vídeo vai do computador direto ao Google, sem passar pela
// Vercel. Só quem puxou o card neste computador envia.
export async function POST(req: NextRequest, { params }: Params) {
  const ctx = await autenticarCutflow(req)
  if (ctx instanceof NextResponse) return ctx
  const { organizacaoId } = ctx
  const { id } = await params

  const puxada = await prisma.cutflowPuxada.findUnique({ where: { demandaId: id, organizacaoId }, select: { sessaoId: true } })
  if (!puxada || puxada.sessaoId !== ctx.sessaoId) {
    return NextResponse.json({ error: "Só o computador que puxou o card pode enviar o vídeo." }, { status: 409 })
  }
  const body = await req.json().catch(() => null)
  const nome = typeof body?.nome === "string" ? body.nome.replace(/[\u0000-\u001f/\\]/g, "_").slice(0, 180) : ""
  const tamanho = Number(body?.tamanho)
  const tipo = String(body?.tipo ?? "")
  if (!nome || !Number.isInteger(tamanho) || tamanho <= 0 || tamanho > MAXIMO || !TIPOS.includes(tipo)) {
    return NextResponse.json({ error: "Envio inválido: MP4 ou MOV de até 20 GB." }, { status: 400 })
  }
  const demanda = await prisma.demanda.findFirst({ where: { id, organizacaoId }, select: { linkFolderFinal: true } })
  if (!demanda) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  const pastaId = pastaDoDrive(demanda.linkFolderFinal)

  let sessao
  try {
    sessao = await criarSessaoUploadDrive({ fileName: nome, fileSize: tamanho, contentType: tipo, pastaId }, organizacaoId)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "O Google Drive recusou o envio." }, { status: 502 })
  }
  return NextResponse.json({
    sessionUri: sessao.sessionUri,
    fileId: sessao.fileId,
    pasta: pastaId ? "Material pronto do card" : "pasta raiz do Drive da empresa",
    envio: assinarEnvio({ demandaId: id, fileId: sessao.fileId, pastaId, tamanho, nome, sessaoId: ctx.sessaoId }),
  })
}
