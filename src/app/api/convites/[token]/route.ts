import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendWhatsappMessage } from "@/lib/whatsapp"

// GET /api/convites/[token] — buscar dados do convite (página pública)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const convite = await prisma.conviteVideomaker.findUnique({
    where: { token },
    include: {
      videomaker: { select: { id: true, nome: true } },
      demanda: {
        select: {
          id: true,
          codigo: true,
          titulo: true,
          descricao: true,
          tipoVideo: true,
          cidade: true,
          dataEvento: true,
          localEvento: true,
          dataCaptacao: true,
          prioridade: true,
        },
      },
    },
  })

  if (!convite) {
    return NextResponse.json({ error: "Convite não encontrado" }, { status: 404 })
  }

  if (convite.status !== "pendente") {
    return NextResponse.json({ error: "Convite já foi respondido", status: convite.status }, { status: 400 })
  }

  if (new Date() > convite.expiresAt) {
    await prisma.conviteVideomaker.update({ where: { token }, data: { status: "expirado" } })
    return NextResponse.json({ error: "Convite expirado" }, { status: 410 })
  }

  return NextResponse.json(convite)
}

// POST /api/convites/[token] — aceitar ou recusar
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const { acao } = await req.json() // "aceitar" | "recusar"

  if (!["aceitar", "recusar"].includes(acao)) {
    return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
  }

  const convite = await prisma.conviteVideomaker.findUnique({
    where: { token },
    include: { demanda: true, videomaker: true },
  })

  if (!convite) return NextResponse.json({ error: "Convite não encontrado" }, { status: 404 })
  if (convite.status !== "pendente") return NextResponse.json({ error: "Já respondido" }, { status: 400 })
  if (new Date() > convite.expiresAt) return NextResponse.json({ error: "Expirado" }, { status: 410 })

  const novoStatus = acao === "aceitar" ? "aceito" : "recusado"

  // Atualizar convite (CORRIGIDO: atualiza status tanto para aceitar quanto recusar)
  await prisma.conviteVideomaker.update({
    where: { token },
    data: { status: novoStatus, respondidoEm: new Date() },
  })

  if (acao === "aceitar") {
    // Atribuir videomaker à demanda e avançar status
    await prisma.demanda.update({
      where: { id: convite.demandaId },
      data: {
        videomakerId: convite.videomakerId,
        statusInterno: "videomaker_aceitou",
      },
    })

    await prisma.historicoStatus.create({
      data: {
        demandaId: convite.demandaId,
        statusAnterior: convite.demanda.statusInterno,
        statusNovo: "videomaker_aceitou",
        origem: "automacao",
        observacao: `Videomaker ${convite.videomaker.nome} aceitou o convite`,
      },
    })

    // NOVO: Notifica admin/gestor via WhatsApp
    void notificarGestores(
      `✅ *Videomaker Aceitou!*\n\n📋 *${convite.demanda.codigo}* — ${convite.demanda.titulo}\n👤 ${convite.videomaker.nome} aceitou a captação.\n\nPróximo passo: agendar data de captação.`
    )
  } else {
    // Recusou → registrar no histórico
    await prisma.historicoStatus.create({
      data: {
        demandaId: convite.demandaId,
        statusAnterior: convite.demanda.statusInterno,
        statusNovo: "videomaker_recusou",
        origem: "automacao",
        observacao: `Videomaker ${convite.videomaker.nome} recusou o convite`,
      },
    })

    // NOVO: Notifica admin/gestor via WhatsApp
    void notificarGestores(
      `❌ *Videomaker Recusou!*\n\n📋 *${convite.demanda.codigo}* — ${convite.demanda.titulo}\n👤 ${convite.videomaker.nome} recusou a captação.\n\n⚠️ Precisa escalar outro profissional.`
    )
  }

  return NextResponse.json({ status: novoStatus })
}

/**
 * Envia notificação WhatsApp para todos os gestores/admins ativos
 */
async function notificarGestores(mensagem: string) {
  try {
    const gestores = await prisma.usuario.findMany({
      where: { tipo: { in: ["admin", "gestor"] }, status: "ativo", telefone: { not: null } },
      select: { telefone: true },
    })
    for (const g of gestores) {
      if (g.telefone) {
        await sendWhatsappMessage(g.telefone, mensagem).catch(() => null)
      }
    }
  } catch (e) {
    console.error("[Convite] Falha ao notificar gestores:", e)
  }
}
