import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { COLUNAS_LABEL } from "@/lib/status"
import { formatarDataCurta, hojeEmSaoPaulo } from "@/lib/datas"
import { sendWhatsappMessage, templates } from "@/lib/whatsapp"
import { emSegundoPlano } from "@/lib/notificar"
import {
  escopoSocial, gestoresDaArea, inicioDeHojeEmBrasilia, pedidoDaSocial,
  responsaveisDoPedido, unicas,
} from "@/lib/social"

type Params = { params: Promise<{ id: string }> }

// POST /api/social/pedidos/[id]/cobrar — a social cobra o pedido.
//
// Avisa quem está com o card E o gestor da área, no sino do sistema e no
// WhatsApp (pela fila durável: sendWhatsappMessage só registra a intenção).
// Uma vez por dia por pedido: a trava é atômica no banco, para dois cliques
// seguidos não virarem duas cobranças.
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const escopo = await escopoSocial(session)
  if (escopo instanceof NextResponse) return escopo
  const { id } = await params
  const pedido = await pedidoDaSocial(escopo, id)
  if (pedido instanceof NextResponse) return pedido
  if (pedido.statusVisivel === "para_postar" || pedido.statusVisivel === "finalizado") {
    return NextResponse.json({ error: "Este pedido já foi entregue." }, { status: 409 })
  }

  const agora = new Date()
  const r = await prisma.demanda.updateMany({
    where: {
      id, organizacaoId: escopo.organizacaoId,
      OR: [{ cobradoEm: null }, { cobradoEm: { lt: inicioDeHojeEmBrasilia(hojeEmSaoPaulo(agora)) } }],
    },
    data: { cobrancas: { increment: 1 }, cobradoEm: agora },
  })
  if (r.count === 0) {
    return NextResponse.json({ error: "Você já cobrou este pedido hoje. Amanhã dá para cobrar de novo." }, { status: 409 })
  }
  const cobrancas = pedido.cobrancas + 1

  const [responsaveis, gestores] = await Promise.all([
    responsaveisDoPedido(id),
    gestoresDaArea(escopo.organizacaoId, pedido.area),
  ])
  // Quem cobra não é avisado da própria cobrança.
  const avisar = unicas([...responsaveis, ...gestores]).filter((p) => p.usuarioId !== escopo.usuarioId)
  const quem = session?.user?.name?.split(" ")[0] ?? "A social media"
  const etapa = COLUNAS_LABEL[pedido.statusVisivel]
  const postagem = pedido.ideia?.dataPostagem ?? pedido.dataLimite

  // No sistema: alerta direcionado, como o de novas demandas dos líderes.
  const comUsuario = avisar.filter((p) => p.usuarioId)
  if (comUsuario.length > 0) {
    await prisma.alertaIA.createMany({
      data: comUsuario.map((p) => ({
        organizacaoId: escopo.organizacaoId,
        demandaId: id,
        usuarioId: p.usuarioId!,
        tipoAlerta: "cobranca_social",
        mensagem: `⏰ ${quem} cobrou ${pedido.codigo} — ${pedido.titulo} (${cobrancas}ª vez).`,
        severidade: "aviso" as const,
        acaoSugerida: "Atualizar o card ou responder à social",
      })),
    })
  }

  const msg = templates.pedidoCobrado(quem, pedido.codigo, pedido.titulo, etapa, postagem ? formatarDataCurta(postagem) : null)
  const telefones = avisar.flatMap((p) => (p.telefone?.trim() ? [p.telefone] : []))
  emSegundoPlano(
    () => Promise.allSettled(telefones.map((t) => sendWhatsappMessage(t, msg, id, escopo.organizacaoId))),
    "wa-cobranca-social",
  )

  return NextResponse.json({
    ok: true,
    cobrancas,
    avisados: avisar.map((p) => p.nome),
    temResponsavel: responsaveis.length > 0,
  })
}
