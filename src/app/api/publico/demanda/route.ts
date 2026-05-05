import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { calcularPeso } from "@/lib/peso-demanda"
import { sendWhatsappMessage } from "@/lib/whatsapp"

// Rota pública — não requer autenticação
const schema = z.object({
  nomeCliente: z.string().min(2, "Nome é obrigatório"),
  email: z.string().email("E-mail inválido"),
  telefone: z.string().min(10, "Telefone inválido"),
  empresa: z.string().optional(),
  titulo: z.string().min(3, "Título obrigatório"),
  descricao: z.string().min(10, "Descrição obrigatória"),
  tipoVideo: z.string().min(1),
  cidade: z.string().optional().default("N/A"),
  dataLimite: z.string().optional(),
  dataEvento: z.string().optional(),
  localEvento: z.string().optional(),
  referencia: z.string().optional(),
  // Cobertura — cliente final
  clienteFinalNome: z.string().optional(),
  clienteFinalTelefone: z.string().optional(),
  clienteFinalEmail: z.string().optional(),
})

function gerarCodigo(): string {
  const ano = new Date().getFullYear().toString().slice(-2)
  const rand = Math.floor(Math.random() * 9000 + 1000)
  return `VOP-EXT-${ano}-${rand}`
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const data = parsed.data

  // Busca ou cria usuário solicitante externo
  // Prioridade: telefone (evita duplicatas), depois email
  const telDigits = data.telefone.replace(/\D/g, "")
  let solicitante = null

  // 1. Buscar por telefone primeiro (previne duplicatas)
  if (telDigits.length >= 8) {
    solicitante = await prisma.usuario.findFirst({
      where: { telefone: { contains: telDigits.slice(-9) } },
    })
  }

  // 2. Se não achou por telefone, buscar por email
  if (!solicitante) {
    solicitante = await prisma.usuario.findUnique({ where: { email: data.email } })
  }

  if (!solicitante) {
    const { randomBytes } = await import("crypto")
    const bcrypt = (await import("bcryptjs")).default
    const tempSenha = randomBytes(16).toString("hex")
    const senhaHash = await bcrypt.hash(tempSenha, 10)

    solicitante = await prisma.usuario.create({
      data: {
        nome: data.nomeCliente,
        email: data.email,
        telefone: data.telefone,
        tipo: "solicitante",
        senhaHash,
      },
    })
  } else {
    // Atualiza dados faltantes no cadastro existente
    const updates: Record<string, string> = {}
    if (!solicitante.telefone && data.telefone) updates.telefone = data.telefone
    if (!solicitante.email && data.email) updates.email = data.email
    if (Object.keys(updates).length > 0) {
      await prisma.usuario.update({ where: { id: solicitante.id }, data: updates })
    }
  }

  const isCobertura = data.tipoVideo === "cobertura_evento"
  const departamento = isCobertura ? "eventos" : "outros"
  const peso = calcularPeso(data.tipoVideo, "normal")

  // Normaliza telefone do solicitante para WhatsApp
  const telSolicitante = data.telefone.replace(/\D/g, "")

  const demanda = await prisma.demanda.create({
    data: {
      codigo: gerarCodigo(),
      titulo: data.titulo,
      descricao: data.descricao + (data.empresa ? `\n\nEmpresa: ${data.empresa}` : ""),
      departamento,
      tipoVideo: data.tipoVideo,
      cidade: data.cidade || "N/A",
      prioridade: "normal",
      statusInterno: "aguardando_aprovacao_interna",
      statusVisivel: "entrada",
      pesoDemanda: peso,
      solicitanteId: solicitante.id,
      telefoneSolicitante: telSolicitante,
      dataLimite: data.dataLimite ? new Date(data.dataLimite) : undefined,
      dataEvento: data.dataEvento ? new Date(data.dataEvento) : undefined,
      localEvento: data.localEvento,
      referencia: data.referencia,
      // Cliente final (cobertura)
      clienteFinalNome: data.clienteFinalNome,
      clienteFinalTelefone: data.clienteFinalTelefone,
      clienteFinalEmail: data.clienteFinalEmail,
    },
  })

  await prisma.historicoStatus.create({
    data: {
      demandaId: demanda.id,
      statusNovo: "aguardando_aprovacao_interna",
      usuarioId: solicitante.id,
      origem: "manual",
      observacao: `Demanda criada via formulário externo por ${data.nomeCliente}`,
    },
  })

  await prisma.alertaIA.create({
    data: {
      demandaId: demanda.id,
      tipoAlerta: "demanda_externa",
      mensagem: `📥 Demanda externa de ${data.nomeCliente} (${data.email}): "${data.titulo}" aguarda aprovação.`,
      severidade: "aviso",
      acaoSugerida: "Aprovar ou recusar demanda externa",
    },
  })

  // Notifica o solicitante via WhatsApp
  if (telSolicitante.length >= 10) {
    const primeiroNome = data.nomeCliente.split(" ")[0]
    await sendWhatsappMessage(
      telSolicitante,
      `Hey ${primeiroNome}! Aqui é a *NuFlow* 🤖\n\n✅ Sua solicitação foi recebida!\n\n📋 *${demanda.codigo}* — ${data.titulo}\n\nNossa equipe vai analisar e te aviso assim que tiver novidade. 🚀`,
      demanda.id
    ).catch(() => null)
  }

  // Notifica gestores via WhatsApp
  const gestores = await prisma.usuario.findMany({
    where: { tipo: { in: ["admin", "gestor"] }, status: "ativo" },
    select: { telefone: true, nome: true },
  })
  for (const g of gestores) {
    if (g.telefone) {
      sendWhatsappMessage(
        g.telefone,
        `📥 *Nova solicitação externa*\n\n📋 *${demanda.codigo}* — ${data.titulo}\n👤 De: ${data.nomeCliente} (${data.telefone})\n${isCobertura ? `📸 Cobertura em ${data.cidade}` : `🎬 Vídeo: ${data.tipoVideo}`}\n\nAguarda aprovação no sistema.`,
        demanda.id
      ).catch(() => null)
    }
  }

  return NextResponse.json({ ok: true, codigo: demanda.codigo }, { status: 201 })
}
