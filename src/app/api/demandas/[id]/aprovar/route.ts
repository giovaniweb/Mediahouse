import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendWhatsappMessage, templates } from "@/lib/whatsapp"
import { Resend } from "resend"

// POST /api/demandas/[id]/aprovar
// acao: "aprovar" | "recusar" | "reverter" (reverter demanda encerrada por recusa)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  if (!["admin", "gestor"].includes(session.user.tipo)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()
  const { acao, motivo } = body // acao: "aprovar" | "recusar" | "reverter"

  if (!["aprovar", "recusar", "reverter"].includes(acao)) {
    return NextResponse.json({ error: "Ação inválida. Use 'aprovar', 'recusar' ou 'reverter'" }, { status: 400 })
  }

  const demanda = await prisma.demanda.findUnique({
    where: { id },
    include: {
      solicitante: { select: { id: true, nome: true, email: true, telefone: true } },
    },
  })

  if (!demanda) return NextResponse.json({ error: "Demanda não encontrada" }, { status: 404 })

  // ── Reverter demanda recusada ──────────────────────────────────────────────
  if (acao === "reverter") {
    if (demanda.statusInterno !== "encerrado") {
      return NextResponse.json({ error: "Só é possível reverter demandas encerradas por recusa" }, { status: 400 })
    }

    await prisma.demanda.update({
      where: { id },
      data: { statusInterno: "aguardando_aprovacao_interna", statusVisivel: "entrada" },
    })

    await prisma.historicoStatus.create({
      data: {
        demandaId: id,
        statusAnterior: "encerrado",
        statusNovo: "aguardando_aprovacao_interna",
        usuarioId: session.user.id,
        origem: "manual",
        observacao: `Recusa revertida por ${session.user.name ?? "gestor"}. Demanda reaberta para análise.`,
      },
    })

    // Notificar solicitante
    await notificarSolicitante({
      tipo: "reaberta",
      demanda,
      solicitante: demanda.solicitante,
      telefoneSolicitanteWhatsapp: demanda.telefoneSolicitante,
    })

    return NextResponse.json({ ok: true, statusInterno: "aguardando_aprovacao_interna" })
  }

  // ── Aprovar / Recusar ──────────────────────────────────────────────────────
  if (demanda.statusInterno !== "aguardando_aprovacao_interna") {
    return NextResponse.json({ error: "Demanda não está aguardando aprovação interna" }, { status: 400 })
  }

  const novoStatus = acao === "aprovar" ? "aguardando_triagem" : "encerrado"
  const novoStatusVisivel: "entrada" | "producao" | "edicao" | "aprovacao" | "para_postar" | "finalizado" =
    acao === "aprovar" ? "entrada" : demanda.statusVisivel

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

  // Notificar solicitante via WhatsApp e e-mail
  await notificarSolicitante({
    tipo: acao === "aprovar" ? "aprovada" : "recusada",
    demanda,
    solicitante: demanda.solicitante,
    telefoneSolicitanteWhatsapp: demanda.telefoneSolicitante,
    motivo,
  })

  return NextResponse.json({ ok: true, statusInterno: novoStatus })
}

// ── Helper de notificação ──────────────────────────────────────────────────

async function notificarSolicitante({
  tipo,
  demanda,
  solicitante,
  telefoneSolicitanteWhatsapp,
  motivo,
}: {
  tipo: "aprovada" | "recusada" | "reaberta"
  demanda: { id: string; codigo: string; titulo: string }
  solicitante: { id: string; nome: string; email: string; telefone: string | null } | null
  telefoneSolicitanteWhatsapp?: string | null
  motivo?: string
}) {

  const assuntos: Record<string, string> = {
    aprovada: `✅ Sua demanda ${demanda.codigo} foi aprovada`,
    recusada: `❌ Sua demanda ${demanda.codigo} foi recusada`,
    reaberta: `🔄 Sua demanda ${demanda.codigo} foi reaberta para análise`,
  }

  const mensagensWpp: Record<string, string> = {
    aprovada: templates.demandaAprovada(demanda.codigo, demanda.titulo),
    recusada: `❌ *NuFlow — Demanda Recusada*\n\nSua demanda *${demanda.codigo}* — ${demanda.titulo} foi recusada.\n\nMotivo: ${motivo ?? "Não especificado"}\n\nSe necessário, solicite revisão à equipe.`,
    reaberta: `🔄 *NuFlow*\n\nSua demanda *${demanda.codigo}* foi reaberta para análise. Em breve você receberá uma nova resposta.`,
  }

  const htmlsEmail: Record<string, string> = {
    aprovada: `
      <h2 style="color:#16a34a">✅ Demanda Aprovada!</h2>
      <p>Olá, <strong>${solicitante?.nome ?? "Solicitante"}</strong>!</p>
      <p>Sua demanda <strong>${demanda.codigo} — ${demanda.titulo}</strong> foi <strong>aprovada</strong> e já está na fila de produção.</p>
      <p>Acompanhe o progresso no sistema NuFlow.</p>
    `,
    recusada: `
      <h2 style="color:#dc2626">❌ Demanda Recusada</h2>
      <p>Olá, <strong>${solicitante?.nome ?? "Solicitante"}</strong>!</p>
      <p>Infelizmente sua demanda <strong>${demanda.codigo} — ${demanda.titulo}</strong> foi <strong>recusada</strong>.</p>
      ${motivo ? `<p><strong>Motivo:</strong> ${motivo}</p>` : ""}
      <p>Caso queira recorrer, entre em contato com a equipe de operações.</p>
    `,
    reaberta: `
      <h2 style="color:#2563eb">🔄 Demanda Reaberta</h2>
      <p>Olá, <strong>${solicitante?.nome ?? "Solicitante"}</strong>!</p>
      <p>Sua demanda <strong>${demanda.codigo} — ${demanda.titulo}</strong> foi reaberta para nova análise.</p>
      <p>Em breve você receberá uma nova resposta.</p>
    `,
  }

  // WhatsApp para o solicitante cadastrado no sistema
  if (solicitante?.telefone) {
    await sendWhatsappMessage(
      solicitante.telefone,
      mensagensWpp[tipo],
      demanda.id
    ).catch(() => {})
  }

  // WhatsApp para quem solicitou via WhatsApp (telefoneSolicitante da demanda)
  // Envia TAMBÉM se o telefone for diferente do solicitante do sistema
  if (telefoneSolicitanteWhatsapp) {
    const telSolicitanteSistema = solicitante?.telefone?.replace(/\D/g, "") ?? ""
    const telWhatsapp = telefoneSolicitanteWhatsapp.replace(/\D/g, "")
    // Compara últimos 8 dígitos para evitar duplicata
    if (telSolicitanteSistema.slice(-8) !== telWhatsapp.slice(-8)) {
      await sendWhatsappMessage(
        telefoneSolicitanteWhatsapp,
        mensagensWpp[tipo],
        demanda.id
      ).catch(() => {})
    }
  }

  // E-mail via Resend
  try {
    const config = await prisma.configEmail.findFirst({ orderBy: { createdAt: "desc" } })
    const apiKey = config?.apiKey || process.env.RESEND_API_KEY
    if (apiKey && solicitante?.email) {
      const resend = new Resend(apiKey)
      const from = config?.senderEmail
        ? `${config.senderNome ?? "NuFlow"} <${config.senderEmail}>`
        : "NuFlow <onboarding@resend.dev>"
      await resend.emails.send({
        from,
        to: [solicitante.email],
        subject: assuntos[tipo],
        html: htmlsEmail[tipo],
      })
    }
  } catch {
    // silencia erro de email — notificação via WhatsApp já foi tentada
  }
}
