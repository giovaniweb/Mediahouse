import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { prisma } from "@/lib/prisma"
import { ConviteInvalido } from "@/lib/convites"
import { comOrg } from "@/lib/org-contexto"
import { orgPorCredencial } from "@/lib/org-por-credencial"
import { entregarMaterial } from "@/lib/entrega-da-gravacao"
import { emSegundoPlano } from "@/lib/notificar"
import { avisarEntregaDoVideomaker } from "@/lib/avisos-entrega-videomaker"
import { avisarGravacao } from "@/lib/avisos-gravacao"

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
    const r = await comOrg(organizacaoId, () => prisma.$transaction((tx) => entregarMaterial(tx, { organizacaoId, token, ...e })))
    // Toda entrega avisa a operação, não só a que completa (Giovani, 11/11/2026),
    // e depois do commit: falha no aviso não desfaz a entrega. Cada parte tem
    // a própria chave na fila — os brutos e depois o vídeo saem os dois.
    emSegundoPlano(() => r.chegouAgora
      ? avisarGravacao(organizacaoId, r.demandaId, "material")
      : avisarGravacao(organizacaoId, r.demandaId, "material_parcial", null, `material:${r.parte}`), "aviso-gravacao")
    emSegundoPlano(() => avisarEntregaDoVideomaker(organizacaoId, r.demandaId, { completo: r.chegouAgora }), "aviso-entrega-videomaker")
    return resposta({ completo: r.completo, mudouEtapa: r.mudouEtapa })
  } catch (e) {
    if (e instanceof ConviteInvalido) return resposta({ error: e.message }, e.status)
    if (e instanceof ZodError || e instanceof SyntaxError) return resposta({ error: "Envio inválido" }, 400)
    throw e
  }
}
