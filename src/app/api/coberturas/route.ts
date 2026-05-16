import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

async function requireAuth() {
  const session = await auth()
  if (!session?.user) return null
  return session
}

function gerarSlug(titulo: string): string {
  return (
    titulo
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 60) +
    "-" +
    Date.now().toString(36)
  )
}

const CHECKLIST_BASE = [
  // Equipamento (celular como principal)
  { texto: "Celular carregado (>80%)", categoria: "equipamento" as const },
  { texto: "Microfone conectado e testado", categoria: "equipamento" as const },
  { texto: "Iluminação (ring light / LED)", categoria: "equipamento" as const },
  { texto: "Power Bank carregado", categoria: "equipamento" as const },
  // Logística
  { texto: "Credenciamento confirmado", categoria: "logistica" as const },
  { texto: "Recurso financeiro disponível", categoria: "logistica" as const },
  { texto: "Hotel confirmado", categoria: "logistica" as const },
  { texto: "Passagens conferidas", categoria: "logistica" as const },
  // Conteúdo
  { texto: "Vídeo hype do evento", categoria: "conteudo" as const },
  { texto: "Vídeo convite para o stand", categoria: "conteudo" as const },
  { texto: "Vídeo explicando onde é o stand", categoria: "conteudo" as const },
  { texto: "Vídeo depoimentos de equipamentos", categoria: "conteudo" as const },
  { texto: "Vídeo brand / institucional", categoria: "conteudo" as const },
  { texto: "Vídeo criativos do evento", categoria: "conteudo" as const },
  { texto: "Vídeo fechamento do dia", categoria: "conteudo" as const },
  { texto: "Vídeo some day", categoria: "conteudo" as const },
  { texto: "Vídeo fechamento do evento", categoria: "conteudo" as const },
  // Entrega
  { texto: "Pasta Drive criada e compartilhada", categoria: "entrega" as const },
]

// GET /api/coberturas — lista com filtros
export async function GET(req: NextRequest) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const status = sp.get("status")
  const tipo = sp.get("tipo")
  const search = sp.get("search") ?? ""
  const produtoId = sp.get("produtoId")

  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (tipo) where.tipo = tipo
  if (produtoId) where.produtoId = produtoId
  if (search) {
    where.OR = [
      { titulo: { contains: search, mode: "insensitive" } },
      { cliente: { contains: search, mode: "insensitive" } },
      { cidade: { contains: search, mode: "insensitive" } },
    ]
  }

  const coberturas = await prisma.eventoCobertura.findMany({
    where,
    orderBy: { dataInicio: "desc" },
    include: {
      produto: { select: { id: true, nome: true } },
      _count: { select: { uploads: true, equipe: true, checklist: true } },
    },
  })

  return NextResponse.json({ coberturas })
}

// POST /api/coberturas — criar
export async function POST(req: NextRequest) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  try {
    const body = await req.json()
    const {
      titulo,
      tipo,
      descricao,
      cliente,
      local,
      cidade,
      dataInicio,
      dataFim,
      totalDias,
      produtoId,
      linkDrive,
      checklistExtra,
      programacaoPorDia,
    } = body

    if (!titulo || !dataInicio || !dataFim) {
      return NextResponse.json({ error: "titulo, dataInicio e dataFim são obrigatórios" }, { status: 400 })
    }

    const slug = gerarSlug(titulo)

    // Calcular totalDias automaticamente se não informado
    const dias =
      totalDias ??
      Math.max(
        1,
        Math.round(
          (new Date(dataFim).getTime() - new Date(dataInicio).getTime()) / (1000 * 60 * 60 * 24)
        ) + 1
      )

    const cobertura = await prisma.eventoCobertura.create({
      data: {
        titulo: titulo.trim(),
        slug,
        tipo: tipo ?? "outro",
        descricao: descricao?.trim() || null,
        cliente: cliente?.trim() || null,
        local: local?.trim() || null,
        cidade: cidade?.trim() || null,
        dataInicio: new Date(dataInicio),
        dataFim: new Date(dataFim),
        totalDias: dias,
        produtoId: produtoId || null,
        linkDrive: linkDrive?.trim() || null,
        createdById: session.user.id,
      },
    })

    // Criar checklist base para o dia 1
    await prisma.eventoCoberturaChecklist.createMany({
      data: CHECKLIST_BASE.map((item) => ({
        coberturaId: cobertura.id,
        dia: 1,
        texto: item.texto,
        categoria: item.categoria,
        concluido: false,
      })),
    })

    // Adicionar itens específicos do briefing ao dia 1
    if (Array.isArray(checklistExtra) && checklistExtra.length > 0) {
      const validCategorias = ["equipamento", "logistica", "conteudo", "entrega"]
      await prisma.eventoCoberturaChecklist.createMany({
        data: (checklistExtra as Array<{ texto: string; categoria: string }>)
          .filter((item) => item.texto && validCategorias.includes(item.categoria))
          .map((item) => ({
            coberturaId: cobertura.id,
            dia: 1,
            texto: item.texto,
            categoria: item.categoria as "equipamento" | "logistica" | "conteudo" | "entrega",
            concluido: false,
          })),
      })
    }

    // Criar checklist padrão para os demais dias (programacaoPorDia[1..N])
    if (Array.isArray(programacaoPorDia) && programacaoPorDia.length > 1) {
      const diasExtras = (programacaoPorDia as Array<{ dia: number; titulo: string; momentos?: string[] }>).filter(
        (d) => d.dia > 1
      )

      for (const diaInfo of diasExtras) {
        // Checklist base para cada dia extra
        await prisma.eventoCoberturaChecklist.createMany({
          data: CHECKLIST_BASE.map((item) => ({
            coberturaId: cobertura.id,
            dia: diaInfo.dia,
            texto: item.texto,
            categoria: item.categoria,
            concluido: false,
          })),
        })

        // Itens específicos do briefing também para os outros dias
        if (Array.isArray(checklistExtra) && checklistExtra.length > 0) {
          const validCategorias = ["equipamento", "logistica", "conteudo", "entrega"]
          await prisma.eventoCoberturaChecklist.createMany({
            data: (checklistExtra as Array<{ texto: string; categoria: string }>)
              .filter((item) => item.texto && validCategorias.includes(item.categoria))
              .map((item) => ({
                coberturaId: cobertura.id,
                dia: diaInfo.dia,
                texto: item.texto,
                categoria: item.categoria as "equipamento" | "logistica" | "conteudo" | "entrega",
                concluido: false,
              })),
          })
        }
      }
    }

    // Log
    await prisma.eventoCoberturaLog
      .create({
        data: {
          coberturaId: cobertura.id,
          usuarioId: session.user.id,
          acao: "criacao",
          detalhe: `Evento "${cobertura.titulo}" criado`,
        },
      })
      .catch(() => null)

    return NextResponse.json({ cobertura }, { status: 201 })
  } catch (e) {
    console.error("[Coberturas] Erro ao criar:", e)
    return NextResponse.json({ error: "Erro ao criar cobertura" }, { status: 500 })
  }
}
