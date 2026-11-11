import { NextRequest, NextResponse, after } from "next/server"
import { z, ZodError } from "zod"
import { requireAcesso } from "@/lib/acesso"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { avisarMudancaAoVideomaker, ConviteInvalido, reenviarConvite } from "@/lib/convites"
import { processarSaidas } from "@/lib/whatsapp-outbox"

type Params = { params: Promise<{ id: string }> }
const resposta = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } })
const entrada = z.object({ acao: z.enum(["reenviar", "avisar-mudanca"]) }).strict()

// POST /api/demandas/[id]/convite — a linha "Quem vai" da gravação externa
// (11/11/2026): "Reenviar convite" (link novo) ou "Avisar mudança" (data, hora
// ou local mudaram depois do aceite). Mesma regra de quem escala: gestão com
// editarDemanda. Trocar o videomaker continua no PUT da demanda.
export async function POST(req: NextRequest, { params }: Params) {
  const acesso = await requireAcesso("editarDemanda")
  if (acesso instanceof NextResponse) return acesso
  if (!["admin", "gestor"].includes(acesso.papel)) return resposta({ error: "Apenas a gestão pode mexer no convite do videomaker" }, 403)
  const { id } = await params
  try {
    const { acao } = entrada.parse(await req.json())
    const r = await comOrg(acesso.organizacaoId, () => prisma.$transaction((tx) => acao === "reenviar"
      ? reenviarConvite(tx, acesso, id).then((c) => ({ ok: true, expiresAt: c.expiresAt }))
      : avisarMudancaAoVideomaker(tx, acesso, id)))
    try { after(async () => { await processarSaidas(acesso.organizacaoId).catch(() => undefined) }) } catch { /* fila persistida */ }
    return resposta(r)
  } catch (e) {
    if (e instanceof ConviteInvalido) return resposta({ error: e.message }, e.status)
    if (e instanceof ZodError || e instanceof SyntaxError) return resposta({ error: "Ação inválida" }, 400)
    throw e
  }
}
