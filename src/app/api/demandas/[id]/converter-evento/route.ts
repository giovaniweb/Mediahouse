import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type Params = { params: Promise<{ id: string }> }

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
