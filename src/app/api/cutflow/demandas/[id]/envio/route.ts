import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { autenticarCutflow, ENVIO_INDISPONIVEL } from "@/lib/cutflow"

type Params = { params: Promise<{ id: string }> }

// POST /api/cutflow/demandas/[id]/envio — "Enviar para aprovação", passo 1.
//
// Abria uma sessão de upload no Google Drive. O NuFlow não usa mais o Drive
// (03/10/2026); o envio pelo plugin volta quando subir direto ao armazenamento
// do NuFlow. Até lá, responde 410 com o caminho que funciona. A trava do card
// continua valendo: só quem puxou ouve a resposta.
export async function POST(req: NextRequest, { params }: Params) {
  const ctx = await autenticarCutflow(req)
  if (ctx instanceof NextResponse) return ctx
  const { organizacaoId } = ctx
  const { id } = await params

  const puxada = await prisma.cutflowPuxada.findUnique({ where: { demandaId: id, organizacaoId }, select: { sessaoId: true } })
  if (!puxada || puxada.sessaoId !== ctx.sessaoId) {
    return NextResponse.json({ error: "Só o computador que puxou o card pode enviar o vídeo." }, { status: 409 })
  }
  return NextResponse.json({ error: ENVIO_INDISPONIVEL, codigo: "drive_removido" }, { status: 410 })
}
