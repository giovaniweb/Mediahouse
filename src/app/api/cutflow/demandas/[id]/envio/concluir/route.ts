import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAccessToken } from "@/lib/google-drive"
import { autenticarCutflow, lerEnvio, sessaoDoPlugin } from "@/lib/cutflow"
import { criarArquivoFinal } from "@/lib/video-final"
import { mudarStatus } from "@/lib/mudar-status"

type Params = { params: Promise<{ id: string }> }

// POST /api/cutflow/demandas/[id]/envio/concluir — "Enviar para aprovação", passo 2.
//
// Nunca "enviado" sem conferir: o arquivo precisa existir no Drive, fora da
// lixeira, na pasta combinada e com o tamanho declarado. Conferido, registra a
// versão do vídeo final (como a tela registra) e muda o card para
// `edicao_finalizada` pela MESMA função de status do quadro — guarda de
// transição, histórico e avisos aos aprovadores inclusos.
export async function POST(req: NextRequest, { params }: Params) {
  const ctx = await autenticarCutflow(req)
  if (ctx instanceof NextResponse) return ctx
  const { organizacaoId } = ctx
  const { id } = await params

  const body = await req.json().catch(() => null)
  const envio = lerEnvio(body?.envio)
  if (!envio || envio.demandaId !== id || envio.sessaoId !== ctx.sessaoId) {
    return NextResponse.json({ error: "Recibo de envio inválido ou vencido. Envie o vídeo de novo." }, { status: 400 })
  }
  const demanda = await prisma.demanda.findFirst({ where: { id, organizacaoId }, select: { id: true } })
  if (!demanda) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

  let token: string
  try {
    token = await getAccessToken(organizacaoId)
  } catch {
    return NextResponse.json({ error: "O Google Drive não está conectado no NuFlow desta empresa." }, { status: 502 })
  }
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(envio.fileId)}?fields=id,size,parents,trashed&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) return NextResponse.json({ error: `O arquivo não foi encontrado no Drive (${res.status}).` }, { status: 409 })
  const arquivo = (await res.json()) as { size?: string; parents?: string[]; trashed?: boolean }
  if (arquivo.trashed) return NextResponse.json({ error: "O arquivo enviado está na lixeira do Drive." }, { status: 409 })
  if (Number(arquivo.size) !== envio.tamanho) {
    return NextResponse.json({ error: `O upload não terminou: o Drive tem ${arquivo.size ?? 0} de ${envio.tamanho} bytes.` }, { status: 409 })
  }
  if (envio.pastaId && !(arquivo.parents ?? []).includes(envio.pastaId)) {
    return NextResponse.json({ error: "O arquivo não está na pasta Material pronto do card." }, { status: 409 })
  }

  const url = `https://drive.google.com/file/d/${envio.fileId}/view?usp=sharing`
  await criarArquivoFinal(organizacaoId, id, url, undefined, envio.nome)
  const mudanca = await mudarStatus(sessaoDoPlugin(ctx), id, {
    statusInterno: "edicao_finalizada",
    linkFinal: url,
    origem: "automacao",
    observacao: "Enviado para aprovação pelo Cutflow",
  })
  if (!mudanca.ok) {
    const erro = await mudanca.json().catch(() => ({}))
    // O vídeo já está registrado; só o status não andou. Diz isso, sem fingir.
    return NextResponse.json({ enviado: true, linkFinal: url, statusMudou: false, aviso: erro.error ?? "O status não mudou." }, { status: 207 })
  }
  // Card entregue sai da trava: um ajuste pedido depois pode ser puxado de novo.
  await prisma.cutflowPuxada.deleteMany({ where: { demandaId: id, organizacaoId } })
  return NextResponse.json({ enviado: true, linkFinal: url, statusMudou: true })
}
