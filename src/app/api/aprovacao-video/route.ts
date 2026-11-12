import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { quemRecebeTudo } from "@/lib/notificados"
import { emSegundoPlano } from "@/lib/notificar"
import { sendWhatsappMessage } from "@/lib/whatsapp"
import type { FamiliaArte } from "@/lib/avisos-arte"
import { getOrgId, semOrg, requireDemandaOrg } from "@/lib/org"
import { filtroFazAPeca, guardaDoEnvio } from "@/lib/quem-envia-arquivo"
import { oQueAPessoaVe } from "@/lib/escopo-demanda"
import { ehGestor } from "@/lib/papel"
import { permissoesEfetivas } from "@/lib/permissoes-server"
import type { Prisma } from "@prisma/client"

// GET /api/aprovacao-video?status=pendente&area=audiovisual|design
// Aprovações de entregável da organização logada. Existe porque a aba "Vídeos"
// de /aprovacoes já consumia este endpoint, mas só havia POST — a aba respondia
// 405 e ficava permanentemente vazia.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const sp = req.nextUrl.searchParams
  const status = sp.get("status") ?? undefined
  const areaParam = sp.get("area")
  const area = areaParam === "design" || areaParam === "audiovisual" ? areaParam : undefined

  // Até 12/11/2026 a lista era da empresa inteira para qualquer pessoa logada,
  // com o link público de aprovação de cada vídeo. Agora vale o que a pessoa vê
  // no quadro (oQueAPessoaVe: escopo e área) e, nele, a régua das outras rotas:
  // gestão, "Editar Demanda" ou quem tem a tela de Aprovações da área (o
  // auxiliar administrativo trabalha nela sem editar demandas) veem tudo o que
  // enxergam; os demais, só os cards em que fazem a peça. O solicitante recebe
  // o link do vídeo dele pelo WhatsApp, não por aqui.
  const filtros: Prisma.DemandaWhereInput[] = [await oQueAPessoaVe(session, organizacaoId)]
  if (area) filtros.push({ area })
  if (!ehGestor(session)) {
    const p = (await permissoesEfetivas(session.user.id, organizacaoId))?.permissoes
    const daTela = area === "design" ? p?.verAprovacoesGrowth : area === "audiovisual" ? p?.verAprovacoes : p?.verAprovacoes && p?.verAprovacoesGrowth
    if (!p?.editarDemanda && !daTela) filtros.push(filtroFazAPeca(session.user.id))
  }

  const aprovacoes = await prisma.aprovacaoVideo.findMany({
    where: {
      ...(status ? { status } : {}),
      demanda: { AND: filtros },
    },
    include: {
      demanda: { select: { id: true, codigo: true, titulo: true, area: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  })

  return NextResponse.json({ aprovacoes })
}

// POST /api/aprovacao-video — cria link de aprovação de vídeo para uma demanda
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const { demandaId, urlVideo, nomeVideo, expiresInDays } = body

    if (!demandaId || !urlVideo) {
      return NextResponse.json({ error: "demandaId e urlVideo são obrigatórios" }, { status: 400 })
    }

    // Ownership: sem esta checagem, qualquer usuário autenticado de QUALQUER
    // empresa gerava link público e sobrescrevia o linkCliente de uma demanda alheia.
    const guard = await requireDemandaOrg(session, demandaId as string)
    if (guard instanceof NextResponse) return guard
    // A versão que vai ao cliente é o vídeo final: mesma régua de quem o sobe
    // (lib/quem-envia-arquivo). Só a empresa deixava qualquer pessoa dela trocar
    // o link do cliente de um card alheio e avisar o solicitante pelo WhatsApp.
    const negado = await guardaDoEnvio(session, guard.organizacaoId, demandaId as string, "final")
    if (negado) return negado

    const demanda = await prisma.demanda.findUnique({
      where: { id: demandaId as string },
      include: {
        solicitante: { select: { nome: true, telefone: true, email: true } },
      },
    })
    if (!demanda) return NextResponse.json({ error: "Demanda não encontrada" }, { status: 404 })

    // Padrão 30 dias; o pedido pode encurtar ou alongar, mas entre 1 e 90. Sem o
    // teto, um número qualquer no corpo fazia o link do cliente valer para sempre.
    const pedidos = Math.trunc(Number(expiresInDays))
    const dias = Number.isFinite(pedidos) && pedidos >= 1 ? Math.min(pedidos, 90) : 30
    const expiresAt = new Date(Date.now() + dias * 24 * 60 * 60 * 1000)

    const aprovacao = await prisma.aprovacaoVideo.create({
      data: {
        demandaId: demandaId as string,
        urlVideo: urlVideo as string,
        nomeVideo: (nomeVideo as string | undefined) ?? demanda.titulo,
        status: "pendente",
        expiresAt,
      },
    })

    // .trim() evita newline acidental no env var que quebra o link no WhatsApp
    const baseUrl = (process.env.NEXTAUTH_URL ?? "http://localhost:3000").trim().replace(/\/$/, "")
    const link = `${baseUrl}/aprovar/${aprovacao.token}`

    // Atualiza demanda com link do cliente
    await prisma.demanda.update({
      where: { id: demandaId as string },
      data: { linkCliente: link },
    })

    // Notifica solicitante via WhatsApp com o link de aprovação
    const telefoneSolicitante = demanda.telefoneSolicitante || demanda.solicitante?.telefone
    const nomeSolicitante = demanda.nomeSolicitante || demanda.solicitante?.nome || "Solicitante"
    // Trunca título longo para não poluir a mensagem
    const tituloMsg = demanda.titulo.length > 50
      ? demanda.titulo.substring(0, 47) + "..."
      : demanda.titulo

    if (telefoneSolicitante) {
      const msg = `🎥 *NuFlow — Vídeo Pronto para Aprovação!*\n\nHey ${nomeSolicitante.split(" ")[0]}! O vídeo da sua demanda está pronto!\n\n📋 *${demanda.codigo}* — ${tituloMsg}\n\n🔗 Acesse pelo link abaixo:\n${link}\n\n_Válido por ${dias} dias._`

      emSegundoPlano(() => sendWhatsappMessage(telefoneSolicitante, msg, demandaId as string, demanda.organizacaoId), "wa-link-aprovacao")
    }

    // Notifica admin/gestor que link foi gerado
    emSegundoPlano(() => notificarGestores(
      `🎬 *Link de Aprovação Gerado*\n\n📋 *${demanda.codigo}* — ${tituloMsg}\n👤 Enviado para: ${nomeSolicitante}\n🔗 ${link}`,
      demanda.organizacaoId, "aguardando"
    ), "gestores-link-aprovacao")

    return NextResponse.json({ ok: true, token: aprovacao.token, link })
  } catch (e) {
    console.error("[aprovacao-video] Erro inesperado:", e)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}

/**
 * Notifica gestores/admins via WhatsApp
 */
async function notificarGestores(mensagem: string, organizacaoId?: string | null, arte?: FamiliaArte) {
  try {
    const gestores = await quemRecebeTudo(organizacaoId)
    for (const g of gestores) {
      if (g.telefone) {
        await sendWhatsappMessage(g.telefone, mensagem, undefined, organizacaoId, { arte }).catch(() => null)
      }
    }
  } catch (e) {
    console.error("[AprovacaoVideo] Falha ao notificar gestores:", e)
  }
}
