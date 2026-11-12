import { NextRequest, NextResponse, after } from "next/server"
import { z, ZodError } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { requireDemandaOrg } from "@/lib/org"
import { guardaDoEnvio } from "@/lib/quem-envia-arquivo"
import { EnvioInvalido, enviarParaWhatsapp } from "@/lib/envio-manual-whatsapp"
import { processarSaidas } from "@/lib/whatsapp-outbox"

type Params = { params: Promise<{ id: string }> }
const resposta = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } })
const entrada = z.object({
  link: z.enum(["entrega", "aprovacao"]),
  telefone: z.string().min(1).max(40),
  nome: z.string().max(80).optional().nullable(),
  salvarNoCard: z.boolean().optional(),
  chave: z.string().uuid(),
}).strict()

// POST /api/demandas/[id]/enviar-whatsapp — o link de entrega ou de aprovação
// para um número digitado (lib/envio-manual-whatsapp.ts). Quem pode: a mesma
// régua de quem gera o link de aprovação e sobe o vídeo final (guardaDoEnvio):
// gestão, quem tem editarDemanda ou quem faz a peça. Fora do escopo, 404.
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return resposta({ error: "Não autorizado" }, 401)
  const { id } = await params
  const guard = await requireDemandaOrg(session, id)
  if (guard instanceof NextResponse) return guard
  const negado = await guardaDoEnvio(session, guard.organizacaoId, id, "final")
  if (negado) return negado
  try {
    const e = entrada.parse(await req.json())
    const r = await comOrg(guard.organizacaoId, () => prisma.$transaction((tx) => enviarParaWhatsapp(tx, {
      organizacaoId: guard.organizacaoId, usuarioId: session.user.id, usuarioNome: session.user.name ?? null, demandaId: id, ...e,
    })))
    try { after(async () => { await processarSaidas(guard.organizacaoId).catch(() => undefined) }) } catch { /* fila persistida */ }
    return resposta(r)
  } catch (e) {
    if (e instanceof EnvioInvalido) return resposta({ error: e.message }, e.status)
    if (e instanceof ZodError || e instanceof SyntaxError) return resposta({ error: "Confira o número e tente de novo." }, 400)
    if (e instanceof Error && e.message === "Destinatário não autorizado") return resposta({ error: "Não foi possível agendar para este número." }, 400)
    throw e
  }
}
