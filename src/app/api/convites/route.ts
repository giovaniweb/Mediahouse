import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { requireAcesso } from "@/lib/acesso"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { ConviteInvalido, emitirConvite } from "@/lib/convites"
const resposta = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } })
const entrada = z.object({ demandaId: z.string().min(1).max(128), videomakerId: z.string().min(1).max(128) }).strict()
export async function POST(req: NextRequest) {
  const acesso = await requireAcesso("editarDemanda")
  if (acesso instanceof NextResponse) return acesso
  if (!["admin", "gestor"].includes(acesso.papel)) return resposta({ error: "Apenas a gestão pode administrar convites" }, 403)
  try {
    const e = entrada.parse(await req.json())
    const convite = await comOrg(acesso.organizacaoId, () => prisma.$transaction(tx => emitirConvite(tx, acesso, e.demandaId, e.videomakerId)))
    return resposta({ id: convite.id, token: convite.token, status: convite.status, expiresAt: convite.expiresAt }, 201)
  } catch (e) {
    if (e instanceof ConviteInvalido) return resposta({ error: e.message }, e.status)
    if (e instanceof ZodError || e instanceof SyntaxError) return resposta({ error: "Informe demanda e profissional válidos" }, 400)
    throw e
  }
}
export async function GET(req: NextRequest) {
  const acesso = await requireAcesso("editarDemanda")
  if (acesso instanceof NextResponse) return acesso
  if (!["admin", "gestor"].includes(acesso.papel)) return resposta({ error: "Apenas a gestão pode administrar convites" }, 403)
  const demandaId = req.nextUrl.searchParams.get("demandaId")
  if (!demandaId || demandaId.length > 128) return resposta({ error: "Demanda inválida" }, 400)
  return comOrg(acesso.organizacaoId, async () => {
    if (!await prisma.demanda.findFirst({ where: { id: demandaId, organizacaoId: acesso.organizacaoId }, select: { id: true } })) return resposta({ error: "Demanda não encontrada" }, 404)
    return resposta(await prisma.conviteVideomaker.findMany({
      where: { demandaId, demanda: { organizacaoId: acesso.organizacaoId } },
      select: { id: true, status: true, createdAt: true, expiresAt: true, respondidoEm: true, videomaker: { select: { id: true, nome: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 100,
    }))
  })
}
