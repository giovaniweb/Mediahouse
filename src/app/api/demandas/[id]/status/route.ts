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
  destinatario: "videomaker" | "solicitante" | "gestor" | "editor",
  extra?: string
): string | null {
  const base = `📋 *${codigo}* — ${titulo}`
  type Dest = "videomaker" | "solicitante" | "gestor" | "editor"
  type Mapa = Record<string, Partial<Record<Dest, string | null>>>

  const mapa: Mapa = {
    videomaker_notificado: {
      videomaker: `🎬 *NuFlow — Você foi escalado!*\n\n${base}\n\nVocê foi designado para esta captação.\nResponda *SIM* para confirmar ou *NÃO* para recusar.`,
      solicitante: `📋 *NuFlow — Em andamento!*\n\n${base}\n\nUm profissional foi designado para sua demanda. Te avisamos quando confirmar! 🎬`,
      gestor: null,
      editor: null,
    },
    videomaker_aceitou: {
      videomaker: null,
      solicitante: `✅ *NuFlow — Videomaker Confirmado*\n\n${base}\n\nO profissional confirmou a captação. Em breve mais detalhes.`,
      gestor: `✅ *NuFlow — Captação Confirmada*\n\n${base}\n\nVideomaker aceitou a demanda.`,
      editor: null,
    },
    videomaker_recusou: {
      videomaker: null,
      solicitante: `⏳ *NuFlow — Reagendando*\n\n${base}\n\nEstamos escalando outro profissional. Avisamos em breve!`,
      gestor: `⚠️ *NuFlow — Recusa de Captação*\n\n${base}\n\nVideomaker recusou. Necessário escalar outro profissional.`,
      editor: null,
    },
    captacao_agendada: {
      videomaker: `📅 *NuFlow — Captação Agendada*\n\n${base}\n\n${extra ?? "Data de captação definida. Verifique sua agenda."}\n\nQualquer dúvida, entre em contato.`,
      solicitante: `📅 *NuFlow — Captação Agendada*\n\n${base}\n\n${extra ?? "A captação foi agendada com sucesso."}`,
      gestor: null,
      editor: null,
    },
    brutos_enviados: {
      videomaker: null,
      solicitante: null,
      gestor: `📤 *NuFlow — Brutos Recebidos*\n\n${base}\n\nArquivos brutos enviados para edição.`,
      // TDAH: editor é avisado que pode começar a edição
      editor: `📦 *NuFlow — Brutos Prontos para Edição!*\n\n${base}\n\nOs arquivos brutos chegaram. Sua edição pode começar! ✂️`,
    },
    editando: {
      videomaker: null,
      solicitante: `✂️ *NuFlow — Em Edição*\n\n${base}\n\nSua demanda entrou em edição. Avisaremos quando finalizar.`,
      gestor: null,
      // TDAH: editor é avisado que foi escalado para editar
      editor: `✂️ *NuFlow — Você foi escalado para edição!*\n\n${base}\n\nSua tarefa de edição está disponível. Acesse o sistema para mais detalhes.`,
    },
    edicao_finalizada: {
      videomaker: null,
      solicitante: `🎥 *NuFlow — Edição Finalizada!*\n\n${base}\n\nSeu vídeo foi editado. Aguarde o link de aprovação.`,
      gestor: `🎥 *NuFlow — Edição Pronta*\n\n${base}\n\nAguardando aprovação do cliente.`,
      // TDAH: editor recebe confirmação de que a edição foi entregue
      editor: `🎉 *NuFlow — Edição Entregue!*\n\n${base}\n\nExcelente trabalho! Seu vídeo foi enviado para aprovação do cliente. ✨`,
    },
    aguardando_aprovacao_cliente: {
      videomaker: null,
      solicitante: `👀 *NuFlow — Vídeo Pronto para Aprovação*\n\n${base}\n\n${extra ? `🔗 ${extra}` : "Acesse o sistema para visualizar e aprovar seu vídeo."}\n\n_Você pode solicitar ajustes caso necessário._`,
      gestor: null,
      editor: null,
    },
    aprovado_cliente: {
      videomaker: `🏆 *NuFlow — Cliente Aprovou!*\n\n${base}\n\nExcelente trabalho! O cliente aprovou. ✨`,
      solicitante: `🎉 *NuFlow — Vídeo Aprovado!*\n\n${base}\n\nSeu vídeo foi aprovado e está sendo preparado para publicação! 🎬`,
      gestor: `✅ *NuFlow — Aprovado pelo Cliente*\n\n${base}`,
      editor: `🏆 *NuFlow — Cliente Aprovou!*\n\n${base}\n\nSeu trabalho foi aprovado. Parabéns! ✨`,
    },
    // Status válidos no schema — usados pelo botão Aprovar/Reprovar no modal admin
    aprovado: {
      videomaker: `🏆 *NuFlow — Aprovado!*\n\n${base}\n\nExcelente trabalho! O vídeo foi aprovado. ✨`,
      solicitante: `🎉 *NuFlow — Vídeo Aprovado!*\n\n${base}\n\nSeu vídeo foi aprovado e está sendo preparado para publicação! 🎬`,
      gestor: `✅ *NuFlow — Aprovado*\n\n${base}`,
      editor: `🏆 *NuFlow — Aprovado!*\n\n${base}\n\nSeu trabalho foi aprovado. Parabéns! ✨`,
    },
    ajuste_solicitado: {
      videomaker: null,
      solicitante: `🔄 *NuFlow — Ajustes Solicitados*\n\n${base}\n\nRecebemos seu feedback e estamos fazendo os ajustes. Te avisamos quando o novo vídeo estiver pronto!`,
      gestor: `🔄 *NuFlow — Ajuste Solicitado*\n\n${base}\n\nAjustes necessários. Editor foi notificado.`,
      editor: `🔄 *NuFlow — Ajustes Solicitados*\n\n${base}\n\nO cliente solicitou ajustes${extra ? `:\n\n_"${extra}"_` : "."}\n\nAcesse o sistema para ver o feedback completo.`,
    },
    reprovado_cliente: {
      videomaker: `🔄 *NuFlow — Ajustes Solicitados*\n\n${base}\n\nO cliente solicitou ajustes. Verifique o feedback no sistema.`,
      solicitante: `🔄 *NuFlow — Ajustes Solicitados*\n\n${base}\n\nRecebemos seu feedback e estamos fazendo os ajustes necessários. Te avisamos quando o novo vídeo estiver pronto!`,
      gestor: `🔄 *NuFlow — Reprovado*\n\n${base}\n\nAjustes solicitados. Editor foi notificado.`,
      editor: `🔄 *NuFlow — Ajustes Solicitados*\n\n${base}\n\nO cliente solicitou ajustes${extra ? `:\n\n_"${extra}"_` : "."}\n\nAcesse o sistema para ver o feedback completo.`,
    },
    postado: {
      videomaker: `🎉 *NuFlow — Concluído!*\n\n${base}\n\nVídeo publicado com sucesso. Obrigado pelo excelente trabalho! 🎬⭐`,
      solicitante: `🎉 *NuFlow — Publicado!*\n\n${base}\n\nSeu vídeo foi publicado com sucesso!`,
      gestor: null,
      editor: `🎉 *NuFlow — Vídeo Publicado!*\n\n${base}\n\nSeu trabalho chegou ao fim. Obrigado! 🎬⭐`,
    },
    impedimento: {
      videomaker: null,
      solicitante: `⚠️ *NuFlow — Impedimento na sua demanda*\n\n${base}\n\nExiste um impedimento na sua solicitação e precisamos entrar em contato. Aguarde, nossa equipe te avisará em breve.`,
      gestor: `🚫 *NuFlow — Impedimento*\n\n${base}\n\n${extra ? `Motivo: ${extra}` : "Ação necessária."}`,
      editor: null,
    },
  }

  return mapa[statusNovo]?.[destinatario] ?? null
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { statusInterno, observacao } = body
  // Sanitiza origem para valores válidos do enum OrigemHistorico
  const ORIGENS_VALIDAS = ["manual", "automacao", "ia", "whatsapp", "kanban"]
  const origemRaw = (body.origem as string) || "manual"
  const origem = (ORIGENS_VALIDAS.includes(origemRaw) ? origemRaw : "manual") as import("@prisma/client").OrigemHistorico

  if (!statusInterno) {
    return NextResponse.json({ error: "statusInterno obrigatório" }, { status: 400 })
  }

  const demandaAtual = await prisma.demanda.findUnique({
    where: { id },
    include: {
      videomaker: { select: { nome: true, telefone: true } },
      solicitante: { select: { nome: true, telefone: true } },
      editor: { select: { nome: true, telefone: true, whatsapp: true } },
    },
  })
  // telefoneSolicitante é o número de quem pediu via WhatsApp (pode ser diferente do solicitante do sistema)
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
  if (!novoStatusVisivel) {
    return NextResponse.json({ error: `Status "${statusInterno}" inválido` }, { status: 400 })
  }

  try {
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
      demandaAtual.telefoneSolicitante ?? null,
      demandaAtual.editor?.whatsapp ?? demandaAtual.editor?.telefone ?? null,
      id,
      observacao ?? demandaAtual.motivoImpedimento,
      body.linkFinal ?? demandaAtual.linkFinal
    )

    return NextResponse.json(demanda)
  } catch (e) {
    console.error("[Status PATCH] Erro na transação:", e)
    const msg = e instanceof Error ? e.message : "Erro ao atualizar status"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

async function notificarMudancaKanban(
  statusNovo: string,
  codigo: string,
  titulo: string,
  telefoneVideomaker: string | null,
  telefoneSolicitanteSistema: string | null,
  telefoneSolicitanteWhatsapp: string | null,
  telefoneEditor: string | null,
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

    // Notificar videomaker
    if (telefoneVideomaker) {
      const msg = mensagemKanban(statusNovo, codigo, titulo, "videomaker", extra)
      if (msg) envios.push(sendWhatsappMessage(telefoneVideomaker, msg, demandaId))
    }

    // TDAH: Notificar editor (diferente do videomaker — edita o vídeo)
    if (telefoneEditor) {
      // Não notificar editor se for o mesmo número do videomaker
      const telVm = (telefoneVideomaker ?? "").replace(/\D/g, "")
      const telEd = telefoneEditor.replace(/\D/g, "")
      if (!telVm || telVm.slice(-8) !== telEd.slice(-8)) {
        const msg = mensagemKanban(statusNovo, codigo, titulo, "editor", extra)
        if (msg) envios.push(sendWhatsappMessage(telefoneEditor, msg, demandaId))
      }
    }

    // Notificar solicitante do sistema (usuario cadastrado)
    if (telefoneSolicitanteSistema) {
      const msg = mensagemKanban(statusNovo, codigo, titulo, "solicitante", extra)
      if (msg) envios.push(sendWhatsappMessage(telefoneSolicitanteSistema, msg, demandaId))
    }

    // Notificar quem solicitou via WhatsApp (se for telefone diferente do solicitante do sistema)
    if (telefoneSolicitanteWhatsapp) {
      const telSistema = (telefoneSolicitanteSistema ?? "").replace(/\D/g, "")
      const telWhatsapp = telefoneSolicitanteWhatsapp.replace(/\D/g, "")
      // Compara últimos 8 dígitos para evitar mandar duas vezes para a mesma pessoa
      if (telSistema.slice(-8) !== telWhatsapp.slice(-8)) {
        const msg = mensagemKanban(statusNovo, codigo, titulo, "solicitante", extra)
        if (msg) envios.push(sendWhatsappMessage(telefoneSolicitanteWhatsapp, msg, demandaId))
      }
    }

    // Notificar gestores
    for (const g of gestores) {
      if (g.telefone) {
        const msg = mensagemKanban(statusNovo, codigo, titulo, "gestor", extra)
        if (msg) envios.push(sendWhatsappMessage(g.telefone, msg, demandaId))
      }
    }

    // Notificar Social Media quando pronto para postar
    if (statusNovo === "postagem_pendente") {
      const socialUsers = await prisma.usuario.findMany({
        where: { tipo: "social" as import("@prisma/client").TipoUsuario, status: "ativo" },
        select: { telefone: true },
      })
      const baseSocial = `📋 *${codigo}* — ${titulo}`
      for (const u of socialUsers) {
        if (u.telefone) {
          envios.push(sendWhatsappMessage(
            u.telefone,
            `📱 *NuFlow — Pronto para Postar!*\n\n${baseSocial}\n\nVídeo aprovado e disponível para postagem. 🚀`,
            demandaId
          ))
        }
      }
    }

    await Promise.allSettled(envios)
  } catch (e) {
    console.error("[Kanban Notify]", e)
  }
}
