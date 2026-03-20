import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendWhatsappMessage } from "@/lib/whatsapp"

// POST /api/aprovacao-video — cria link de aprovação de vídeo para uma demanda
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const body = await req.json()
  const { demandaId, urlVideo, nomeVideo, expiresInDays } = body

  if (!demandaId || !urlVideo) {
    return NextResponse.json({ error: "demandaId e urlVideo são obrigatórios" }, { status: 400 })
  }

  const demanda = await prisma.demanda.findUnique({
    where: { id: demandaId },
    include: {
      solicitante: { select: { nome: true, telefone: true, email: true } },
    },
  })
  if (!demanda) return NextResponse.json({ error: "Demanda não encontrada" }, { status: 404 })

  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // padrão: 7 dias

  const aprovacao = await prisma.aprovacaoVideo.create({
    data: {
      demandaId,
      urlVideo,
      nomeVideo: nomeVideo ?? demanda.titulo,
      status: "pendente",
      expiresAt,
    },
  })

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
  const link = `${baseUrl}/aprovar/${aprovacao.token}`

  // Atualiza demanda com link do cliente
  await prisma.demanda.update({
    where: { id: demandaId },
    data: { linkCliente: link },
  })

  // NOVO: Notifica solicitante via WhatsApp com o link de aprovação
  const telefoneSolicitante = demanda.telefoneSolicitante || demanda.solicitante?.telefone
  const nomeSolicitante = demanda.nomeSolicitante || demanda.solicitante?.nome || "Solicitante"

  if (telefoneSolicitante) {
    const msg = `🎥 *NuFlow — Vídeo Pronto para Aprovação!*\n\nHey ${nomeSolicitante.split(" ")[0]}! O vídeo da sua demanda está pronto!\n\n📋 *${demanda.codigo}* — ${demanda.titulo}\n\n🔗 Clique para assistir e aprovar:\n${link}\n\n_Você pode aprovar ou solicitar ajustes diretamente pelo link. Válido por ${expiresInDays || 7} dias._`

    void sendWhatsappMessage(telefoneSolicitante, msg, demandaId).catch(() => null)
  }

  // NOVO: Notifica admin/gestor que link foi gerado
  void notificarGestores(
    `🎬 *Link de Aprovação Gerado*\n\n📋 *${demanda.codigo}* — ${demanda.titulo}\n👤 Enviado para: ${nomeSolicitante}\n🔗 ${link}`
  )

  return NextResponse.json({ ok: true, token: aprovacao.token, link })
}

/**
 * Notifica gestores/admins via WhatsApp
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
    console.error("[AprovacaoVideo] Falha ao notificar gestores:", e)
  }
}
