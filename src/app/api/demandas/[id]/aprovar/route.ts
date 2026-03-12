import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendWhatsappMessage, templates } from "@/lib/whatsapp"

// POST /api/demandas/[id]/aprovar — aprova ou recusa uma demanda pendente de aprovação interna
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  if (!["admin", "gestor"].includes(session.user.tipo)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()
  const { acao, motivo } = body // acao: "aprovar" | "recusar"

  if (!["aprovar", "recusar"].includes(acao)) {
    return NextResponse.json({ error: "Ação inválida. Use 'aprovar' ou 'recusar'" }, { status: 400 })
  }

  const demanda = await prisma.demanda.findUnique({
    where: { id },
    include: { solicitante: { select: { nome: true, telefone: true } } },
  })

  if (!demanda) return NextResponse.json({ error: "Demanda não encontrada" }, { status: 404 })

  if (demanda.statusInterno !== "aguardando_aprovacao_interna") {
    return NextResponse.json({ error: "Demanda não está aguardando aprovação interna" }, { status: 400 })
  }

  const novoStatus = acao === "aprovar" ? "aguardando_triagem" : "encerrado"
  const novoStatusVisivel = acao === "aprovar" ? "entrada" : demanda.statusVisivel

  await prisma.demanda.update({
    where: { id },
    data: {
      statusInterno: novoStatus,
      statusVisivel: novoStatusVisivel,
      gestorId: session.user.id,
    },
  })

  await prisma.historicoStatus.create({
    data: {
      demandaId: id,
      statusAnterior: "aguardando_aprovacao_interna",
      statusNovo: novoStatus,
      usuarioId: session.user.id,
      origem: "manual",
      observacao: acao === "aprovar"
        ? "Demanda aprovada e enviada para triagem"
        : `Demanda recusada${motivo ? `: ${motivo}` : ""}`,
    },
  })

  // Notifica solicitante via WhatsApp se tiver telefone
  if (demanda.solicitante?.telefone) {
    if (acao === "aprovar") {
      await sendWhatsappMessage(
        demanda.solicitante.telefone,
        templates.demandaAprovada(demanda.codigo, demanda.titulo),
        id
      )
    } else {
      await sendWhatsappMessage(
        demanda.solicitante.telefone,
        `❌ *VideoOps — Demanda Recusada*\n\nSua demanda *${demanda.codigo}* — ${demanda.titulo} foi recusada.\n\nMotivo: ${motivo ?? "Não especificado"}\n\nPara mais informações, entre em contato com a equipe.`,
        id
      )
    }
  }

  return NextResponse.json({ ok: true, statusInterno: novoStatus })
}
