import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { calcularPeso } from "@/lib/peso-demanda"
import { STATUS_PARA_COLUNA } from "@/lib/status"
import { sendWhatsappMessage } from "@/lib/whatsapp"
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
  // Área (audiovisual padrão | design)
  area: z.enum(["audiovisual", "design"]).optional(),
  // Evento mestre vinculado (card criado a partir de um evento)
  eventoGestaoId: z.string().optional(),
  // Videomaker + Editor + Designer (opcionais na criação)
  videomakerId: z.string().optional(),
  editorId: z.string().optional(),
  designerId: z.string().optional(),
  // Cliente final (cobertura/entrega)
  clienteFinalNome: z.string().optional(),
  clienteFinalTelefone: z.string().optional(),
  clienteFinalEmail: z.string().optional(),
  // Produto vinculado
  produtoId: z.string().optional(),
  // Telefone solicitante
  telefoneSolicitante: z.string().optional(),
  // Classificação B2C/B2B
  classificacao: z.enum(["b2c", "b2b"]).optional(),
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
  const statusInterno = searchParams.get("statusInterno")
  const editorId = searchParams.get("editorId")
  const tipoVideo = searchParams.get("tipoVideo")
  const deParam = searchParams.get("de")
  const ateParam = searchParams.get("ate")
  // Paginação (usada pela página /historico)
  const limitParam = searchParams.get("limit")
  const offsetParam = searchParams.get("offset")
  const limit = limitParam ? Math.min(200, parseInt(limitParam)) : undefined
  const offset = offsetParam ? parseInt(offsetParam) : undefined
  let videomakerId = searchParams.get("videomakerId") ?? undefined
  let designerId = searchParams.get("designerId") ?? undefined
  let area = searchParams.get("area") ?? undefined
  const eventoGestaoId = searchParams.get("eventoGestaoId") ?? undefined

  // Auto-filtro: videomakers externos só veem suas próprias demandas
  if (session.user.tipo === "videomaker") {
    const vmRecord = await prisma.videomaker.findFirst({
      where: { usuarioId: session.user.id },
      select: { id: true },
    })
    if (vmRecord) videomakerId = vmRecord.id
  }

  // Auto-filtro: designer só vê suas artes (area=design)
  if (session.user.tipo === "designer") {
    const dRecord = await prisma.designer.findFirst({
      where: { usuarioId: session.user.id },
      select: { id: true },
    })
    if (dRecord) designerId = dRecord.id
    area = "design"
  }

  const where: Record<string, unknown> = {}
  if (area) where.area = area
  if (departamento) where.departamento = departamento
  if (prioridade) where.prioridade = prioridade
  if (statusVisivel) where.statusVisivel = statusVisivel
  if (statusInterno) where.statusInterno = statusInterno
  if (editorId) where.editorId = editorId
  if (videomakerId) where.videomakerId = videomakerId
  if (designerId) where.designerId = designerId
  if (tipoVideo) where.tipoVideo = tipoVideo
  if (eventoGestaoId) where.eventoGestaoId = eventoGestaoId
  // Gestor de eventos só acompanha cards ligados a eventos (não o pipeline todo)
  if (session.user.tipo === "gestor_eventos") where.eventoGestaoId = { not: null }

  // Filtro por data de finalização (usado pela página /historico)
  if (deParam || ateParam) {
    where.OR = [
      {
        finalizadaEm: {
          ...(deParam ? { gte: new Date(deParam) } : {}),
          ...(ateParam ? { lte: new Date(new Date(ateParam).setHours(23, 59, 59, 999)) } : {}),
        },
      },
      {
        finalizadaEm: null,
        updatedAt: {
          ...(deParam ? { gte: new Date(deParam) } : {}),
          ...(ateParam ? { lte: new Date(new Date(ateParam).setHours(23, 59, 59, 999)) } : {}),
        },
      },
    ]
  }

  const produtoId = searchParams.get("produtoId")
  if (produtoId) where.produtos = { some: { produtoId } }

  const search = searchParams.get("search")
  if (search && !where.OR) {
    where.OR = [
      { titulo: { contains: search, mode: "insensitive" } },
      { codigo: { contains: search, mode: "insensitive" } },
      { descricao: { contains: search, mode: "insensitive" } },
    ]
  } else if (search && where.OR) {
    // Se já tem OR (filtro de data), fazer AND com busca via título/código direto
    where.titulo = { contains: search, mode: "insensitive" }
  }

  // Paginação: quando limit está presente, retorna total também
  const usePagination = !!limit

  const [demandas, total] = await Promise.all([
    prisma.demanda.findMany({
      where,
      include: {
        solicitante: { select: { id: true, nome: true, email: true } },
        videomaker: { select: { id: true, nome: true, cidade: true } },
        editor: { select: { id: true, nome: true } },
        designer: { select: { id: true, nome: true } },
        produtos: { select: { produto: { select: { nome: true } } } },
        eventoGestao: { select: { id: true, nome: true } },
        _count: { select: { comentarios: true, arquivos: true } },
      },
      orderBy: [
        { prioridade: "desc" },
        { createdAt: "desc" },
      ],
      ...(limit ? { take: limit } : {}),
      ...(offset ? { skip: offset } : {}),
    }),
    usePagination ? prisma.demanda.count({ where }) : Promise.resolve(undefined),
  ])

  return NextResponse.json({ demandas, ...(usePagination ? { total } : {}) })
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
    : "aguardando_aprovacao_interna"

  const statusVisivel = STATUS_PARA_COLUNA[statusInterno]
  const peso = calcularPeso(data.tipoVideo, data.prioridade as Prioridade)

  const demanda = await prisma.demanda.create({
    data: {
      codigo: gerarCodigo(),
      titulo: data.titulo,
      descricao: data.descricao,
      departamento: data.departamento as Departamento,
      area: (data.area ?? "audiovisual") as "audiovisual" | "design",
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
      // Novos campos
      videomakerId: data.videomakerId || undefined,
      editorId: data.editorId || undefined,
      designerId: data.designerId || undefined,
      eventoGestaoId: data.eventoGestaoId || undefined,
      telefoneSolicitante: data.telefoneSolicitante || undefined,
      classificacao: data.classificacao || undefined,
      linkBrutos: data.linkBrutos || undefined,
    },
  })

  // Vincular produto se fornecido
  if (data.produtoId) {
    await prisma.demandaProduto.create({
      data: { demandaId: demanda.id, produtoId: data.produtoId },
    }).catch(e => console.error("[Demanda] Erro ao vincular produto:", e))
  }

  // Auto-populate checklist a partir de templates
  try {
    const templates = await prisma.checklistTemplate.findMany({
      where: {
        ativo: true,
        OR: [
          { tipoVideo: data.tipoVideo },
          { tipoVideo: null },
        ],
      },
      include: { itens: { orderBy: { ordem: "asc" } } },
    })

    // Priorizar templates específicos do tipoVideo; se não houver, usar o "Geral"
    const templatesFiltrados = templates.filter(t => t.tipoVideo === data.tipoVideo)
    const templatesParaAplicar = templatesFiltrados.length > 0
      ? templatesFiltrados
      : templates.filter(t => t.tipoVideo === null && t.papel === "geral")

    const checklistData = templatesParaAplicar.flatMap(t =>
      t.itens.map(item => ({
        demandaId: demanda.id,
        texto: item.texto,
        ordem: item.ordem,
        grupo: t.papel ?? "geral",
      }))
    )

    if (checklistData.length > 0) {
      await prisma.checklistItem.createMany({ data: checklistData })
    }
  } catch (e) {
    console.error("[Demanda] Erro ao criar checklist automático:", e)
  }

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

  // Criar alerta para gestor
  await prisma.alertaIA.create({
    data: {
      demandaId: demanda.id,
      tipoAlerta: data.prioridade === "urgente" ? "urgencia_pendente" : "aprovacao_pendente",
      mensagem: data.prioridade === "urgente"
        ? `🚨 Nova urgência: "${data.titulo}" aguarda aprovação do gestor.`
        : `📋 Nova demanda: "${data.titulo}" aguarda aprovação interna.`,
      severidade: data.prioridade === "urgente" ? "critico" : "aviso",
      acaoSugerida: "Aprovar ou recusar demanda",
    },
  })

  // NOVO: Notifica gestores/admins via WhatsApp sobre nova demanda
  void notificarGestoresNovaDemanda(
    demanda.codigo,
    data.titulo,
    session.user.name ?? "Usuário",
    data.prioridade as string
  )

  return NextResponse.json(demanda, { status: 201 })
}

/**
 * Notifica gestores/admins via WhatsApp sobre nova demanda criada no portal
 */
async function notificarGestoresNovaDemanda(
  codigo: string,
  titulo: string,
  nomeSolicitante: string,
  prioridade: string
) {
  try {
    const gestores = await prisma.usuario.findMany({
      where: { tipo: { in: ["admin", "gestor"] }, status: "ativo", telefone: { not: null } },
      select: { telefone: true },
    })

    const emoji = prioridade === "urgente" ? "🚨" : prioridade === "alta" ? "⚡" : "📋"
    const prioLabel = prioridade === "urgente" ? "URGENTE" : prioridade === "alta" ? "Alta" : "Normal"

    const msg = `${emoji} *Nova Demanda no Sistema!*\n\n📋 *${codigo}* — ${titulo}\n👤 Solicitante: ${nomeSolicitante}\n⚡ Prioridade: ${prioLabel}\n\nAcesse o sistema para aprovar.`

    for (const g of gestores) {
      if (g.telefone) {
        await sendWhatsappMessage(g.telefone, msg).catch(() => null)
      }
    }
  } catch (e) {
    console.error("[Demanda] Falha ao notificar gestores:", e)
  }
}
