import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type Params = { params: Promise<{ id: string }> }

const CHECKLIST_BASE = [
  { texto: "Camera principal carregada", categoria: "equipamento" as const },
  { texto: "Cartões de memória formatados", categoria: "equipamento" as const },
  { texto: "Tripé e estabilizador conferidos", categoria: "equipamento" as const },
  { texto: "Áudio (microfone lapela/boom)", categoria: "equipamento" as const },
  { texto: "Carregadores e baterias reserva", categoria: "equipamento" as const },
  { texto: "Credenciamento confirmado", categoria: "logistica" as const },
  { texto: "Briefing do dia enviado à equipe", categoria: "logistica" as const },
  { texto: "Pasta Drive criada e compartilhada", categoria: "entrega" as const },
]

function gerarSlug(titulo: string): string {
  return titulo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .substring(0, 50)
    + "-" + Date.now().toString(36)
}

// POST /api/demandas/[id]/converter-evento
// Converte uma Demanda de cobertura em um EventoCobertura completo
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params

  const demanda = await prisma.demanda.findUnique({
    where: { id },
    include: {
      videomaker: { select: { id: true, nome: true } },
      produtos: { select: { produto: { select: { id: true, nome: true } } }, take: 1 },
    },
  })

  if (!demanda) return NextResponse.json({ error: "Demanda não encontrada" }, { status: 404 })
  if (demanda.coberturaId) {
    return NextResponse.json(
      { error: "Esta demanda já foi convertida em evento", coberturaId: demanda.coberturaId },
      { status: 409 }
    )
  }

  // Determinar datas do evento
  const dataRef = demanda.dataCaptacao ?? demanda.dataLimite ?? new Date()
  const dataInicio = dataRef
  const dataFim = dataRef

  // Produto vinculado (se houver)
  const produtoId = demanda.produtos?.[0]?.produto?.id ?? null

  // Criar o EventoCobertura com dados da demanda
  const cobertura = await prisma.eventoCobertura.create({
    data: {
      titulo: demanda.titulo,
      slug: gerarSlug(demanda.titulo),
      tipo: "outro",
      status: demanda.statusVisivel === "finalizado" ? "concluido" : "planejamento",
      descricao: demanda.descricao,
      cliente: demanda.clienteFinalNome ?? demanda.nomeSolicitante ?? null,
      local: demanda.localGravacao ?? demanda.localEvento ?? null,
      cidade: demanda.cidade ?? null,
      dataInicio,
      dataFim,
      totalDias: 1,
      linkDrive: demanda.linkFolderBrutos ?? demanda.linkFolderFinal ?? null,
      produtoId,
      createdById: session.user.id,
      // Criar checklist base para o dia 1
      checklist: {
        create: CHECKLIST_BASE.map((item, i) => ({
          dia: 1,
          texto: item.texto,
          categoria: item.categoria,
          ordem: i,
        })),
      },
      // Adicionar videomaker da demanda como membro da equipe
      ...(demanda.videomaker
        ? {
            equipe: {
              create: {
                videomakerId: demanda.videomaker.id,
                nome: demanda.videomaker.nome,
                funcao: "captacao",
              },
            },
          }
        : {}),
    },
  })

  // Vincular a demanda ao evento criado
  await prisma.demanda.update({
    where: { id },
    data: { coberturaId: cobertura.id },
  })

  // Log no evento
  await prisma.eventoCoberturaLog.create({
    data: {
      coberturaId: cobertura.id,
      usuarioId: session.user.id,
      acao: "criado",
      detalhe: `Evento criado a partir da demanda ${demanda.codigo} — ${demanda.titulo}`,
    },
  }).catch(() => null)

  return NextResponse.json({ cobertura, ok: true })
}
