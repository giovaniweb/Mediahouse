import { NextRequest, NextResponse, after } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { acessoDaOperacao } from "@/lib/kit-videomaker-server"
import { CancelamentoInvalido, cancelarGravacao } from "@/lib/cancelar-gravacao"
import { processarSaidas } from "@/lib/whatsapp-outbox"

type Params = { params: Promise<{ id: string }> }

// POST /api/jobs/[id]/cancelar — cancela a gravação com o motivo e, se o
// videomaker já confirmou, se ele cobra pelo cancelamento
// (lib/cancelar-gravacao.ts). Quem cancela é a operação ou a gestão.
export async function POST(req: NextRequest, { params }: Params) {
  const acesso = await acessoDaOperacao("Só a gestão ou quem opera as gravações cancela uma gravação.")
  if (acesso instanceof NextResponse) return acesso
  const corpo = z.object({ motivo: z.string().max(300), cobra: z.boolean().optional() }).safeParse(await req.json().catch(() => null))
  if (!corpo.success) return NextResponse.json({ error: "Diga o motivo do cancelamento." }, { status: 400 })

  const { id } = await params
  const { organizacaoId, usuarioId } = acesso
  try {
    const r = await comOrg(organizacaoId, () => prisma.$transaction((tx) =>
      cancelarGravacao(tx, { organizacaoId, usuarioId, demandaId: id, motivo: corpo.data.motivo, cobra: corpo.data.cobra })))
    if (r.avisos > 0) {
      try { after(async () => { await processarSaidas(organizacaoId).catch(() => undefined) }) } catch { /* o consumidor da fila retoma */ }
    }
    return NextResponse.json({ mensagem: r.mensagem })
  } catch (e) {
    if (e instanceof CancelamentoInvalido) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}
