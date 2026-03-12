import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendWhatsappMessage } from "@/lib/whatsapp"

// POST /api/whatsapp/webhook — recebe mensagens da Evolution API
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Evolution API webhook payload
    const event = body.event
    const data = body.data

    if (event !== "messages.upsert") return NextResponse.json({ ok: true })

    const message = data?.message
    if (!message) return NextResponse.json({ ok: true })

    // Ignora mensagens enviadas por nós
    if (data.key?.fromMe) return NextResponse.json({ ok: true })

    const telefone = data.key?.remoteJid?.replace("@s.whatsapp.net", "") ?? ""
    const texto = (message.conversation ?? message.extendedTextMessage?.text ?? "").trim().toUpperCase()

    if (!telefone || !texto) return NextResponse.json({ ok: true })

    // Salva mensagem recebida
    await prisma.mensagemWhatsapp.create({
      data: {
        telefone,
        tipoMensagem: "text",
        conteudo: texto,
        direcao: "entrada",
        status: "recebido",
      },
    })

    // Processa comandos básicos
    if (texto === "SIM" || texto === "CONFIRMAR" || texto === "OK") {
      // Busca demanda pendente de confirmação do videomaker com esse telefone
      const videomaker = await prisma.videomaker.findFirst({ where: { telefone: { contains: telefone.slice(-8) } } })
      if (videomaker) {
        const demanda = await prisma.demanda.findFirst({
          where: {
            videomakerId: videomaker.id,
            statusInterno: "videomaker_notificado",
          },
          orderBy: { createdAt: "desc" },
        })
        if (demanda) {
          await prisma.demanda.update({
            where: { id: demanda.id },
            data: { statusInterno: "videomaker_aceitou" },
          })
          await prisma.historicoStatus.create({
            data: {
              demandaId: demanda.id,
              statusAnterior: "videomaker_notificado",
              statusNovo: "videomaker_aceitou",
              origem: "whatsapp",
              observacao: "Confirmado via WhatsApp",
            },
          })
          await sendWhatsappMessage(
            telefone,
            `✅ Captação confirmada para *${demanda.codigo}* — ${demanda.titulo}!\n\nAguarde contato com mais detalhes. 🎬`,
            demanda.id
          )
        }
      }
    }

    if (texto === "NÃO" || texto === "NAO" || texto === "RECUSAR" || texto === "RECUSO") {
      const videomaker = await prisma.videomaker.findFirst({ where: { telefone: { contains: telefone.slice(-8) } } })
      if (videomaker) {
        const demanda = await prisma.demanda.findFirst({
          where: {
            videomakerId: videomaker.id,
            statusInterno: "videomaker_notificado",
          },
          orderBy: { createdAt: "desc" },
        })
        if (demanda) {
          await prisma.demanda.update({
            where: { id: demanda.id },
            data: { statusInterno: "videomaker_recusou", videomakerId: null },
          })
          await prisma.historicoStatus.create({
            data: {
              demandaId: demanda.id,
              statusAnterior: "videomaker_notificado",
              statusNovo: "videomaker_recusou",
              origem: "whatsapp",
              observacao: "Recusado via WhatsApp",
            },
          })
          await sendWhatsappMessage(
            telefone,
            `Entendido. Vamos escalar outro profissional para *${demanda.codigo}*. Obrigado!`,
            demanda.id
          )
        }
      }
    }

    // Comando STATUS — informa demandas ativas
    if (texto === "STATUS" || texto === "MINHAS DEMANDAS") {
      const videomaker = await prisma.videomaker.findFirst({ where: { telefone: { contains: telefone.slice(-8) } } })
      if (videomaker) {
        const demandas = await prisma.demanda.findMany({
          where: { videomakerId: videomaker.id, statusInterno: { notIn: ["encerrado", "postado", "entregue_cliente"] } },
          take: 5,
          orderBy: { createdAt: "desc" },
        })
        if (demandas.length > 0) {
          const lista = demandas.map((d) => `• *${d.codigo}* — ${d.titulo} (${d.statusInterno})`).join("\n")
          await sendWhatsappMessage(telefone, `📋 *Suas demandas ativas:*\n\n${lista}`)
        } else {
          await sendWhatsappMessage(telefone, "Você não tem demandas ativas no momento. ✅")
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[WhatsApp Webhook] Erro:", e)
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  }
}

// GET — health check do webhook
export async function GET() {
  return NextResponse.json({ ok: true, webhook: "VideoOps WhatsApp Webhook ativo" })
}
