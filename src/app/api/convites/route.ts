import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// POST /api/convites — criar convite para videomaker
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { demandaId, videomakerId } = await req.json()
  if (!demandaId || !videomakerId) {
    return NextResponse.json({ error: "demandaId e videomakerId obrigatórios" }, { status: 400 })
  }

  // Verificar se já existe convite pendente
  const existente = await prisma.conviteVideomaker.findFirst({
    where: { demandaId, videomakerId, status: "pendente" },
  })
  if (existente) {
    return NextResponse.json({ error: "Já existe convite pendente", convite: existente }, { status: 409 })
  }

  const convite = await prisma.conviteVideomaker.create({
    data: {
      demandaId,
      videomakerId,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48h
    },
    include: {
      videomaker: { select: { nome: true, telefone: true } },
      demanda: { select: { codigo: true, titulo: true } },
    },
  })

  // Enviar notificação WhatsApp ao videomaker
  const vm = convite.videomaker
  if (vm.telefone) {
    const baseUrl = process.env.NEXTAUTH_URL || "https://videoops.vercel.app"
    const link = `${baseUrl}/convite/${convite.token}`

    try {
      const configWpp = await prisma.configWhatsapp.findFirst({ where: { ativo: true } })
      if (configWpp) {
        const phone = vm.telefone.replace(/\D/g, "")
        await fetch(`${configWpp.instanceUrl}/message/sendText/${configWpp.instanceId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: configWpp.apiKey,
          },
          body: JSON.stringify({
            number: phone,
            text: `Oi ${vm.nome}! Voce foi convidado para a demanda *${convite.demanda.codigo} - ${convite.demanda.titulo}*.\n\nAcesse o link abaixo para aceitar ou recusar:\n${link}\n\nO convite expira em 48h.`,
          }),
        })
      }
    } catch (e) {
      console.error("Erro ao enviar WhatsApp de convite:", e)
    }
  }

  return NextResponse.json(convite, { status: 201 })
}

// GET /api/convites?demandaId=xxx — listar convites de uma demanda
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const demandaId = req.nextUrl.searchParams.get("demandaId")
  if (!demandaId) {
    return NextResponse.json({ error: "demandaId obrigatório" }, { status: 400 })
  }

  const convites = await prisma.conviteVideomaker.findMany({
    where: { demandaId },
    include: {
      videomaker: { select: { nome: true, telefone: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(convites)
}
