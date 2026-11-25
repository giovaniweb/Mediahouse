import { NextRequest, NextResponse, after } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { requireDemandaOrg } from "@/lib/org"
import { guardaDoEnvio } from "@/lib/quem-envia-arquivo"
import { CobrancaRecusada, cobrarQuemPediu } from "@/lib/cobranca-solicitante"
import { EVENTO_WHATSAPP_MANUAL } from "@/lib/status"
import { processarSaidas } from "@/lib/whatsapp-outbox"

type Params = { params: Promise<{ id: string }> }
const resposta = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } })

const MOTIVOS: Record<string, [string, number]> = {
  desligada: ["A cobrança a quem pediu está desligada para esta empresa.", 409],
  fora_da_etapa: ["Só dá para cobrar quando o card espera a aprovação de quem pediu ou está em Para Postar.", 409],
  gravacao_externa: ["Gravação externa tem os avisos dela; a cobrança a quem pediu não vale aqui.", 409],
  sem_destinatario: ["Quem pediu não tem WhatsApp cadastrado no NuFlow (ou desligou este aviso). Use “Mandar para outro número”.", 409],
  nao_encontrada: ["Não encontrado", 404],
}

// POST /api/demandas/[id]/cobrar-solicitante — "Cobrar agora" da ficha: a mesma
// cobrança da rotina diária (lib/cobranca-solicitante.ts), na hora, contando a
// vez. Quem pode: a mesma régua do "Enviar para um WhatsApp" (guardaDoEnvio):
// gestão, quem tem editarDemanda ou quem faz a peça.
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return resposta({ error: "Não autorizado" }, 401)
  const { id } = await params
  const guard = await requireDemandaOrg(session, id)
  if (guard instanceof NextResponse) return guard
  const negado = await guardaDoEnvio(session, guard.organizacaoId, id, "final")
  if (negado) return negado
  const org = guard.organizacaoId
  try {
    const r = await comOrg(org, () => prisma.$transaction(async (tx) => {
      const c = await cobrarQuemPediu(tx, org, id, { manual: true })
      if (c.cobrou) {
        const d = await tx.demanda.findFirst({ where: { id, organizacaoId: org }, select: { statusInterno: true } })
        await tx.historicoStatus.create({ data: { demandaId: id, statusAnterior: d?.statusInterno ?? null, statusNovo: EVENTO_WHATSAPP_MANUAL,
          usuarioId: session.user.id, origem: "manual",
          observacao: `Cobrança nº ${c.vez} a quem pediu (${c.etapa === "aprovar" ? "aprovar" : "marcar como postado"}) enviada pelo WhatsApp${session.user.name ? ` · por ${session.user.name}` : ""}` } })
      }
      return c
    }, { timeout: 20_000 }))
    if (!r.cobrou) {
      const [erro, http] = MOTIVOS[r.motivo] ?? ["Não foi possível cobrar agora.", 409]
      return resposta({ error: erro, motivo: r.motivo }, http)
    }
    try { after(async () => { await processarSaidas(org).catch(() => undefined) }) } catch { /* fila persistida */ }
    return resposta({ ok: true, vez: r.vez, etapa: r.etapa })
  } catch (e) {
    if (e instanceof CobrancaRecusada) return resposta({ error: e.message }, e.status)
    throw e
  }
}
