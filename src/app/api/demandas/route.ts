import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { calcularPeso } from "@/lib/peso-demanda"
import { STATUS_PARA_COLUNA } from "@/lib/status"
import type { Prioridade, Departamento } from "@prisma/client"

const criarDemandaSchema = z.object({
  titulo: z.string().min(3),
  descricao: z.string().min(10),
  departamento: z.enum(["growth", "eventos", "institucional", "rh", "audiovisual", "outros"]),
  tipoVideo: z.string().min(1),
  cidade: z.string().min(2),
  prioridade: z.enum(["normal", "alta", "urgente"]).default("normal"),
  motivoUrgencia: z.string().optional(),
  dataLimite: z.string().optional(),
  // Campos condicionais
  campanha: z.string().optional(),
  objetivo: z.string().optional(),
  plataforma: z.string().optional(),
  dataEvento: z.string().optional(),
  localEvento: z.string().optional(),
  cobertura: z.boolean().optional(),
  publico: z.string().optional(),
  mensagemPrincipal: z.string().optional(),
  // Extras
  referencia: z.string().optional(),
  localGravacao: z.string().optional(),
  linkBrutos: z.string().optional(),
})

function gerarCodigo(): string {
  const ano = new Date().getFullYear().toString().slice(-2)
  const rand = Math.floor(Math.random() * 9000 + 1000)
  return `VOP-${ano}-${rand}`
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { searchParams } = req.nextUrl
  const departamento = searchParams.get("departamento")
  const prioridade = searchParams.get("prioridade")
  const statusVisivel = searchParams.get("statusVisivel")
  const editorId = searchParams.get("editorId")
  const videomakerId = searchParams.get("videomakerId")

  const where: Record<string, unknown> = {}
  if (departamento) where.departamento = departamento
  if (prioridade) where.prioridade = prioridade
  if (statusVisivel) where.statusVisivel = statusVisivel
  if (editorId) where.editorId = editorId
  if (videomakerId) where.videomakerId = videomakerId

  const demandas = await prisma.demanda.findMany({
    where,
    include: {
      solicitante: { select: { id: true, nome: true, email: true } },
      videomaker: { select: { id: true, nome: true, cidade: true } },
      editor: { select: { id: true, nome: true } },
      _count: { select: { comentarios: true, arquivos: true } },
    },
    orderBy: [
      { prioridade: "desc" },
      { createdAt: "desc" },
    ],
  })

  return NextResponse.json(demandas)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const body = await req.json()
  const parsed = criarDemandaSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data

  // Validar urgência
  if (data.prioridade === "urgente" && !data.motivoUrgencia) {
    return NextResponse.json(
      { error: "Motivo de urgência é obrigatório." },
      { status: 400 }
    )
  }

  const statusInterno = data.prioridade === "urgente"
    ? "urgencia_pendente_aprovacao"
    : "pedido_criado"

  const statusVisivel = STATUS_PARA_COLUNA[statusInterno]
  const peso = calcularPeso(data.tipoVideo, data.prioridade as Prioridade)

  const demanda = await prisma.demanda.create({
    data: {
      codigo: gerarCodigo(),
      titulo: data.titulo,
      descricao: data.descricao,
      departamento: data.departamento as Departamento,
      tipoVideo: data.tipoVideo,
      cidade: data.cidade,
      prioridade: data.prioridade as Prioridade,
      motivoUrgencia: data.motivoUrgencia,
      statusInterno,
      statusVisivel,
      pesoDemanda: peso,
      solicitanteId: session.user.id,
      dataLimite: data.dataLimite ? new Date(data.dataLimite) : undefined,
      campanha: data.campanha,
      objetivo: data.objetivo,
      plataforma: data.plataforma,
      dataEvento: data.dataEvento ? new Date(data.dataEvento) : undefined,
      localEvento: data.localEvento,
      cobertura: data.cobertura,
      publico: data.publico,
      mensagemPrincipal: data.mensagemPrincipal,
      referencia: data.referencia,
      localGravacao: data.localGravacao,
    },
  })

  // Registrar histórico inicial
  await prisma.historicoStatus.create({
    data: {
      demandaId: demanda.id,
      statusNovo: statusInterno,
      usuarioId: session.user.id,
      origem: "manual",
      observacao: "Demanda criada",
    },
  })

  // Criar alerta se urgente
  if (data.prioridade === "urgente") {
    await prisma.alertaIA.create({
      data: {
        demandaId: demanda.id,
        tipoAlerta: "urgencia_pendente",
        mensagem: `Nova urgência: "${data.titulo}" aguarda aprovação do gestor.`,
        severidade: "critico",
        acaoSugerida: "Aprovar ou rejeitar urgência",
      },
    })
  }

  return NextResponse.json(demanda, { status: 201 })
}
