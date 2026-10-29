import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { prisma } from "@/lib/prisma"
import { ConviteInvalido } from "@/lib/convites"
import { comOrg } from "@/lib/org-contexto"
import { orgPorCredencial } from "@/lib/org-por-credencial"
import { entregarMaterial } from "@/lib/entrega-da-gravacao"

const resposta = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } })

// POST /api/convites/[token]/entrega — o videomaker entrega o material pelo
// link do convite: o drive dos brutos e, se a edição é dele, o vídeo pronto.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const organizacaoId = await orgPorCredencial("convite", token)
  if (!organizacaoId) return resposta({ error: "Convite não encontrado" }, 404)
  try {
    const e = z.object({
      linkBrutos: z.string().trim().min(1).max(2000).optional(),
      linkVideo: z.string().trim().min(1).max(2000).optional(),
    }).strict().parse(await req.json())
    if (!e.linkBrutos && !e.linkVideo) return resposta({ error: "Mande o link dos brutos ou do vídeo." }, 400)
    return resposta(await comOrg(organizacaoId, () => prisma.$transaction((tx) => entregarMaterial(tx, { organizacaoId, token, ...e }))))
  } catch (e) {
    if (e instanceof ConviteInvalido) return resposta({ error: e.message }, e.status)
    if (e instanceof ZodError || e instanceof SyntaxError) return resposta({ error: "Envio inválido" }, 400)
    throw e
  }
}
