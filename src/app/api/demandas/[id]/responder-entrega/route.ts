import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ehGestor } from "@/lib/papel"
import { requireDemandaOrg } from "@/lib/org"
import { podeAprovarEntrega, SELECT_PESSOAS_DA_ENTREGA } from "@/lib/quem-aprova"
import { responderAprovacao, type AcaoAprovacao } from "@/lib/responder-aprovacao"

type Params = { params: Promise<{ id: string }> }

// POST /api/demandas/[id]/responder-entrega — aprovar ou pedir ajuste por dentro.
//
// É a mesma resposta do link do cliente (lib/responder-aprovacao.ts), com duas
// diferenças: só a empresa dona do card responde (quem executa por espelhamento
// não aprova a si mesmo), e quem responde fica registrado pelo nome. Pedir
// ajuste exige dizer o quê — "reprovado" sem motivo não vira trabalho.
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const guard = await requireDemandaOrg(session, id)
  if (guard instanceof NextResponse) return guard

  const body = await req.json().catch(() => ({})) as { acao?: string; comentario?: string; token?: string }
  const acao = body.acao as AcaoAprovacao
  if (acao !== "aprovar" && acao !== "feedback") {
    return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
  }
  const comentario = body.comentario?.trim() ?? ""
  if (acao === "feedback" && !comentario) {
    return NextResponse.json({ error: "Diga o que precisa ser ajustado." }, { status: 400 })
  }

  const demanda = await prisma.demanda.findFirst({
    where: { id, organizacaoId: guard.organizacaoId },
    select: SELECT_PESSOAS_DA_ENTREGA,
  })
  if (!demanda) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  if (!podeAprovarEntrega({ usuarioId: session.user.id, gestor: ehGestor(session) }, demanda)) {
    return NextResponse.json(
      { error: "Quem aprova é quem pediu, a social dona do pedido, gestor ou admin — não quem fez a peça." },
      { status: 403 }
    )
  }

  // A versão em aprovação. O token vem da tela para não aprovar uma versão
  // diferente da que a pessoa assistiu, caso outra tenha chegado no meio.
  const aprovacao = await prisma.aprovacaoVideo.findFirst({
    where: { demandaId: id, demanda: { organizacaoId: guard.organizacaoId }, ...(body.token ? { token: body.token } : { status: "pendente" }) },
    orderBy: { createdAt: "desc" },
    select: { id: true, demandaId: true },
  })
  if (!aprovacao) return NextResponse.json({ error: "Nenhuma versão aguardando aprovação" }, { status: 404 })

  const usuario = await prisma.usuario.findUnique({ where: { id: session.user.id }, select: { id: true, nome: true } })
  const r = await responderAprovacao({
    aprovacao,
    organizacaoId: guard.organizacaoId,
    acao,
    comentario: comentario || null,
    usuario: usuario ?? { id: session.user.id, nome: session.user.name ?? "Equipe" },
  })
  if (!r.ok) return NextResponse.json({ error: r.erro, status: r.status }, { status: r.http })
  return NextResponse.json({ ok: true, status: r.status })
}
