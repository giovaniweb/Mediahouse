// Responder uma aprovação de entrega: aprovar ou pedir ajuste.
//
// Existe em um lugar só porque chega por duas portas: o link do cliente
// (/aprovar/[token], sem login) e o detalhe da demanda (quem pediu, a social
// dona do pedido, gestor ou admin, logados). O que acontece depois é o mesmo —
// status do card, histórico, alerta e o aviso a quem faz a peça —, e a única
// diferença é quem respondeu. Antes este corpo morava inteiro na rota pública.
import { prisma } from "@/lib/prisma"
import { quemRecebeTudo } from "@/lib/notificados"
import { emSegundoPlano } from "@/lib/notificar"
import { resolverAlertas } from "@/lib/alertas"
import { sendWhatsappMessage } from "@/lib/whatsapp"

export type AcaoAprovacao = "aprovar" | "feedback"

export type ResultadoResposta =
  | { ok: true; status: string }
  | { ok: false; erro: string; status?: string; http: number }

export async function responderAprovacao(p: {
  aprovacao: { id: string; demandaId: string }
  organizacaoId: string
  acao: AcaoAprovacao
  comentario?: string | null
  /** Nome que o cliente digitou no link, quando digita. */
  aprovadoPor?: string | null
  /** Quem respondeu por dentro do NuFlow. Sem ele, foi o cliente pelo link. */
  usuario?: { id: string; nome: string } | null
}): Promise<ResultadoResposta> {
  const { aprovacao, organizacaoId, acao, usuario } = p
  const comentario = p.comentario?.trim() || null
  const aprovadoPor = usuario?.nome ?? (p.aprovadoPor?.trim() || null)

  const demandaAntes = await prisma.demanda.findUnique({
    where: { id: aprovacao.demandaId },
    select: { statusInterno: true, organizacaoId: true },
  })
  if (!demandaAntes || demandaAntes.organizacaoId !== organizacaoId) {
    return { ok: false, erro: "Demanda não encontrada", http: 404 }
  }

  const novoStatus = acao === "aprovar" ? "aprovado" : "feedback_solicitado"
  // Só a primeira resposta vale. Condicional no próprio UPDATE: o cliente e
  // a equipe podem responder ao mesmo tempo, e ler-depois-gravar deixava os dois.
  const gravou = await prisma.aprovacaoVideo.updateMany({
    where: { id: aprovacao.id, status: "pendente", demanda: { organizacaoId } },
    data: { status: novoStatus, aprovadoPor, comentario },
  })
  if (gravou.count === 0) {
    const atual = await prisma.aprovacaoVideo.findFirst({
      where: { id: aprovacao.id, demanda: { organizacaoId } },
      select: { status: true },
    })
    return { ok: false, erro: "Esta aprovação já foi respondida", status: atual?.status, http: 400 }
  }

  if (acao === "aprovar") {
    // Aprovado → "Para Postar". O vídeo continua no armazenamento do NuFlow.
    await prisma.demanda.update({
      where: { id: aprovacao.demandaId },
      data: { statusInterno: "aprovado", statusVisivel: "para_postar" },
    })
    await prisma.historicoStatus.create({
      data: {
        demandaId: aprovacao.demandaId,
        usuarioId: usuario?.id,
        statusAnterior: demandaAntes.statusInterno,
        statusNovo: "aprovado",
        origem: "manual",
        observacao: usuario
          ? `Entrega aprovada por ${usuario.nome} no NuFlow — aguardando postagem`
          : `Vídeo aprovado pelo cliente${aprovadoPor ? ` (${aprovadoPor})` : ""} — aguardando postagem`,
      },
    })
  } else {
    await prisma.demanda.update({
      where: { id: aprovacao.demandaId },
      data: { statusInterno: "ajuste_solicitado", statusVisivel: "aprovacao" },
    })
    await prisma.historicoStatus.create({
      data: {
        demandaId: aprovacao.demandaId,
        usuarioId: usuario?.id,
        statusAnterior: demandaAntes.statusInterno,
        statusNovo: "ajuste_solicitado",
        origem: "manual",
        observacao: usuario
          ? `Ajuste pedido por ${usuario.nome}: ${comentario ?? "sem detalhe"}`
          : `Feedback do cliente: ${comentario ?? "Ajuste solicitado"}`,
      },
    })
    // Por dentro, o pedido de ajuste também é uma fala na Conversa: é onde quem
    // faz a peça responde, marca alguém ou tira a dúvida sobre o que foi pedido.
    if (usuario && comentario) {
      await prisma.comentario.create({
        data: { demandaId: aprovacao.demandaId, usuarioId: usuario.id, comentario: `Pediu ajuste: ${comentario}`, origem: "aprovacao" },
      })
    }
  }

  await prisma.alertaIA.create({
    data: {
      organizacaoId,
      demandaId: aprovacao.demandaId,
      tipoAlerta: acao === "aprovar" ? "video_aprovado" : "ajuste_solicitado",
      mensagem: acao === "aprovar"
        ? usuario ? `✅ ${usuario.nome} aprovou a entrega.` : `✅ Vídeo aprovado pelo cliente${aprovadoPor ? ` (${aprovadoPor})` : ""}!`
        : usuario ? `🔄 ${usuario.nome} pediu ajuste: "${comentario ?? "Sem comentário"}"` : `🔄 Cliente solicitou ajustes: "${comentario ?? "Sem comentário"}"`,
      severidade: acao === "aprovar" ? "info" : "aviso",
    },
  })

  const demanda = await prisma.demanda.findUnique({
    where: { id: aprovacao.demandaId },
    include: {
      editor: { select: { nome: true, telefone: true, whatsapp: true } },
      designer: { select: { nome: true, telefone: true, whatsapp: true } },
      videomaker: { select: { nome: true, telefone: true } },
    },
  })

  if (demanda) {
    const titulo = `📋 *${demanda.codigo}* — ${demanda.titulo}`
    const msgBase = acao === "aprovar"
      ? usuario
        ? `✅ *Entrega Aprovada!*\n\n${titulo}\n👤 Aprovado por: ${usuario.nome}\n\nMovido para *Para Postar*. Realize a postagem e finalize no sistema. 🎬`
        : `✅ *Vídeo Aprovado pelo Cliente!*\n\n${titulo}${aprovadoPor ? `\n👤 Aprovado por: ${aprovadoPor}` : ""}\n\nMovido para *Para Postar*. Realize a postagem e finalize no sistema. 🎬`
      : usuario
        ? `🔄 *Ajuste Pedido!*\n\n${titulo}\n👤 Pedido por: ${usuario.nome}\n💬 "${comentario ?? "Ajuste solicitado"}"\n\nPor favor, revise e reenvie.`
        : `🔄 *Cliente Pediu Ajustes!*\n\n${titulo}\n💬 "${comentario ?? "Ajuste solicitado"}"\n\nPor favor, revise e reenvie.`

    emSegundoPlano(() => notificarGestores(msgBase, demanda.organizacaoId), "gestores-aprovacao")
    // A demanda mudou de estado — o que estava pendente por causa do estado
    // anterior deixa de valer. Sem isto o alerta ficava aberto para sempre.
    emSegundoPlano(() => resolverAlertas(demanda.organizacaoId, demanda.id), "resolver-alertas")

    // Quem faz a peça precisa saber do ajuste: o editor no vídeo, o designer na arte.
    for (const [quemFez, rotulo] of [[demanda.editor, "wa-editor-aprovacao"], [demanda.designer, "wa-designer-aprovacao"]] as const) {
      const tel = quemFez?.whatsapp || quemFez?.telefone
      if (tel) emSegundoPlano(() => sendWhatsappMessage(tel, msgBase, demanda.id, demanda.organizacaoId), rotulo)
    }

    const telVm = demanda.videomaker?.telefone
    if (acao === "aprovar" && telVm) {
      emSegundoPlano(() => sendWhatsappMessage(
        telVm,
        `✅ *Vídeo Aprovado!*\n\n${titulo}\n\nParabéns! ${usuario ? `${usuario.nome} aprovou` : "O cliente aprovou"} o vídeo. 🎬`,
        demanda.id, demanda.organizacaoId
      ), "wa-videomaker-aprovado")
    }
  }

  return { ok: true, status: novoStatus }
}

async function notificarGestores(mensagem: string, organizacaoId?: string | null) {
  try {
    const gestores = await quemRecebeTudo(organizacaoId)
    for (const g of gestores) {
      if (g.telefone) {
        await sendWhatsappMessage(g.telefone, mensagem, undefined, organizacaoId).catch(() => null)
      }
    }
  } catch (e) {
    console.error("[AprovacaoVideo] Falha ao notificar gestores:", e)
  }
}
