import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { STATUS_PARA_COLUNA } from "@/lib/status"
import { sendWhatsappMessage } from "@/lib/whatsapp"
import type { StatusInterno } from "@prisma/client"

type Params = { params: Promise<{ id: string }> }

// ─── Mensagens automáticas por mudança de Kanban ──────────────────────────────
function mensagemKanban(
  statusNovo: string,
  codigo: string,
  titulo: string,
  destinatario: "videomaker" | "solicitante" | "gestor",
  extra?: string
): string | null {
  const base = `📋 *${codigo}* — ${titulo}`
  type Dest = "videomaker" | "solicitante" | "gestor"
  type Mapa = Record<string, Record<Dest, string | null>>

  const mapa: Mapa = {
    videomaker_notificado: {
      videomaker: `🎬 *Flow — Você foi escalado!*\n\n${base}\n\nVocê foi designado para esta captação.\nResponda *SIM* para confirmar ou *NÃO* para recusar.`,
      solicitante: null,
      gestor: null,
    },
    videomaker_aceitou: {
      videomaker: null,
      solicitante: `✅ *Flow — Videomaker Confirmado*\n\n${base}\n\nO profissional confirmou a captação. Em breve mais detalhes.`,
      gestor: `✅ *Flow — Captação Confirmada*\n\n${base}\n\nVideomaker aceitou a demanda.`,
    },
    videomaker_recusou: {
      videomaker: null,
      solicitante: null,
      gestor: `⚠️ *Flow — Recusa de Captação*\n\n${base}\n\nVideomaker recusou. Necessário escalar outro profissional.`,
    },
    captacao_agendada: {
      videomaker: `📅 *Flow — Captação Agendada*\n\n${base}\n\n${extra ?? "Data de captação definida. Verifique sua agenda."}\n\nQualquer dúvida, entre em contato.`,
      solicitante: `📅 *Flow — Captação Agendada*\n\n${base}\n\n${extra ?? "A captação foi agendada com sucesso."}`,
      gestor: null,
    },
    brutos_enviados: {
      videomaker: null,
      solicitante: null,
      gestor: `📤 *Flow — Brutos Recebidos*\n\n${base}\n\nArquivos brutos enviados para edição.`,
    },
    editando: {
      videomaker: null,
      solicitante: `✂️ *Flow — Em Edição*\n\n${base}\n\nSua demanda entrou em edição. Avisaremos quando finalizar.`,
      gestor: null,
    },
    edicao_finalizada: {
      videomaker: null,
      solicitante: `🎥 *Flow — Edição Finalizada!*\n\n${base}\n\nSeu vídeo foi editado. Aguarde o link de aprovação.`,
      gestor: `🎥 *Flow — Edição Pronta*\n\n${base}\n\nAguardando aprovação do cliente.`,
    },
    aguardando_aprovacao_cliente: {
      videomaker: null,
      solicitante: `👀 *Flow — Vídeo Pronto para Aprovação*\n\n${base}\n\n${extra ? `🔗 ${extra}` : "Acesse o sistema para visualizar e aprovar seu vídeo."}\n\n_Você pode solicitar ajustes caso necessário._`,
      gestor: null,
    },
    aprovado_cliente: {
      videomaker: `🏆 *Flow — Cliente Aprovou!*\n\n${base}\n\nExcelente trabalho! O cliente aprovou. ✨`,
      solicitante: null,
      gestor: `✅ *Flow — Aprovado pelo Cliente*\n\n${base}`,
    },
    reprovado_cliente: {
      videomaker: `🔄 *Flow — Ajustes Solicitados*\n\n${base}\n\nO cliente solicitou ajustes. Verifique o feedback no sistema.`,
      solicitante: null,
      gestor: `🔄 *Flow — Reprovado*\n\n${base}\n\nAjustes solicitados. Editor foi notificado.`,
    },
    postado: {
      videomaker: `🎉 *Flow — Concluído!*\n\n${base}\n\nVídeo publicado com sucesso. Obrigado pelo excelente trabalho! 🎬⭐`,
      solicitante: `🎉 *Flow — Publicado!*\n\n${base}\n\nSeu vídeo foi publicado com sucesso!`,
      gestor: null,
    },
    impedimento: {
      videomaker: null,
      solicitante: null,
      gestor: `🚫 *Flow — Impedimento*\n\n${base}\n\n${extra ? `Motivo: ${extra}` : "Ação necessária."}`,
    },
  }

  return mapa[statusNovo]?.[destinatario] ?? null
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { statusInterno, observacao, origem = "manual" } = body

  if (!statusInterno) {
    return NextResponse.json({ error: "statusInterno obrigatório" }, { status: 400 })
  }

  const demandaAtual = await prisma.demanda.findUnique({
    where: { id },
    include: {
      videomaker: { select: { nome: true, telefone: true } },
      solicitante: { select: { nome: true, telefone: true } },
    },
  })
  if (!demandaAtual) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

  // Validações de regras de negócio
  if (statusInterno === "brutos_enviados" && !demandaAtual.linkBrutos && !body.linkBrutos) {
    return NextResponse.json({ error: "Link dos brutos obrigatório para avançar." }, { status: 400 })
  }
  if (statusInterno === "edicao_finalizada" && !demandaAtual.linkFinal && !body.linkFinal) {
    return NextResponse.json({ error: "Link do vídeo final obrigatório." }, { status: 400 })
  }
  if (statusInterno === "impedimento" && !observacao && !demandaAtual.motivoImpedimento) {
    return NextResponse.json({ error: "Motivo do impedimento obrigatório." }, { status: 400 })
  }

  const novoStatusVisivel = STATUS_PARA_COLUNA[statusInterno as StatusInterno]

  const [demanda] = await prisma.$transaction([
    prisma.demanda.update({
      where: { id },
      data: {
        statusInterno: statusInterno as StatusInterno,
        statusVisivel: novoStatusVisivel,
        ...(body.linkBrutos && { linkBrutos: body.linkBrutos }),
        ...(body.linkFinal && { linkFinal: body.linkFinal }),
        ...(body.linkPostagem && { linkPostagem: body.linkPostagem }),
        ...(observacao && statusInterno === "impedimento" && { motivoImpedimento: observacao }),
      },
    }),
    prisma.historicoStatus.create({
      data: {
        demandaId: id,
        statusAnterior: demandaAtual.statusInterno,
        statusNovo: statusInterno,
        usuarioId: session.user.id,
        origem,
        observacao,
      },
    }),
  ])

  // ── Notificações WhatsApp assíncronas (não bloqueia resposta) ─────────────
  void notificarMudancaKanban(
    statusInterno,
    demandaAtual.codigo,
    demandaAtual.titulo,
    demandaAtual.videomaker?.telefone ?? null,
    demandaAtual.solicitante?.telefone ?? null,
    id,
    observacao ?? demandaAtual.motivoImpedimento,
    body.linkFinal ?? demandaAtual.linkFinal
  )

  return NextResponse.json(demanda)
}

async function notificarMudancaKanban(
  statusNovo: string,
  codigo: string,
  titulo: string,
  telefoneVideomaker: string | null,
  telefoneSolicitante: string | null,
  demandaId: string,
  observacao?: string | null,
  linkFinal?: string | null
) {
  try {
    const extra = observacao ?? linkFinal ?? undefined
    const gestores = await prisma.usuario.findMany({
      where: { tipo: { in: ["admin", "gestor"] as import("@prisma/client").TipoUsuario[] }, status: "ativo" },
      select: { telefone: true },
    })

    const envios: Promise<unknown>[] = []

    if (telefoneVideomaker) {
      const msg = mensagemKanban(statusNovo, codigo, titulo, "videomaker", extra)
      if (msg) envios.push(sendWhatsappMessage(telefoneVideomaker, msg, demandaId))
    }
    if (telefoneSolicitante) {
      const msg = mensagemKanban(statusNovo, codigo, titulo, "solicitante", extra)
      if (msg) envios.push(sendWhatsappMessage(telefoneSolicitante, msg, demandaId))
    }
    for (const g of gestores) {
      if (g.telefone) {
        const msg = mensagemKanban(statusNovo, codigo, titulo, "gestor", extra)
        if (msg) envios.push(sendWhatsappMessage(g.telefone, msg, demandaId))
      }
    }

    await Promise.allSettled(envios)
  } catch (e) {
    console.error("[Kanban Notify]", e)
  }
}
