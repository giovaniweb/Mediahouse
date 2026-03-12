import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { calcularPeso } from "@/lib/peso-demanda"

// Rota pública — não requer autenticação
const schema = z.object({
  nomeCliente: z.string().min(2, "Nome é obrigatório"),
  email: z.string().email("E-mail inválido"),
  telefone: z.string().min(10, "Telefone inválido"),
  empresa: z.string().optional(),
  titulo: z.string().min(3, "Título obrigatório"),
  descricao: z.string().min(10, "Descrição obrigatória"),
  tipoVideo: z.string().min(1),
  cidade: z.string().min(2),
  dataLimite: z.string().optional(),
  dataEvento: z.string().optional(),
  localEvento: z.string().optional(),
  referencia: z.string().optional(),
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
  let solicitante = await prisma.usuario.findUnique({ where: { email: data.email } })

  if (!solicitante) {
    // Cria conta básica de solicitante externo (sem senha real, precisará resetar)
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
  }

  const peso = calcularPeso(data.tipoVideo, "normal")

  const demanda = await prisma.demanda.create({
    data: {
      codigo: gerarCodigo(),
      titulo: data.titulo,
      descricao: data.descricao + (data.empresa ? `\n\nEmpresa: ${data.empresa}` : ""),
      departamento: "outros",
      tipoVideo: data.tipoVideo,
      cidade: data.cidade,
      prioridade: "normal",
      statusInterno: "aguardando_aprovacao_interna",
      statusVisivel: "entrada",
      pesoDemanda: peso,
      solicitanteId: solicitante.id,
      dataLimite: data.dataLimite ? new Date(data.dataLimite) : undefined,
      dataEvento: data.dataEvento ? new Date(data.dataEvento) : undefined,
      localEvento: data.localEvento,
      referencia: data.referencia,
    },
  })

  await prisma.historicoStatus.create({
    data: {
      demandaId: demanda.id,
      statusNovo: "aguardando_aprovacao_interna",
      usuarioId: solicitante.id,
      origem: "manual",
      observacao: "Demanda criada via formulário externo",
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

  return NextResponse.json({ ok: true, codigo: demanda.codigo }, { status: 201 })
}
