import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET /api/aprovacao-video/[token] — busca info da aprovação (público, sem auth)
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const aprovacao = await prisma.aprovacaoVideo.findUnique({
    where: { token },
    include: {
      demanda: {
        select: { id: true, codigo: true, titulo: true, departamento: true, tipoVideo: true },
      },
    },
  })

  if (!aprovacao) {
    return NextResponse.json({ error: "Link de aprovação não encontrado" }, { status: 404 })
  }

  if (aprovacao.expiresAt && aprovacao.expiresAt < new Date()) {
    return NextResponse.json({ error: "Este link de aprovação expirou" }, { status: 410 })
  }

  return NextResponse.json({ aprovacao })
}

// POST /api/aprovacao-video/[token] — aprova ou solicita feedback (público, sem auth)
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const body = await req.json()
  const { acao, aprovadoPor, comentario } = body // acao: "aprovar" | "feedback"

  if (!["aprovar", "feedback"].includes(acao)) {
    return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
  }

  const aprovacao = await prisma.aprovacaoVideo.findUnique({ where: { token } })
  if (!aprovacao) return NextResponse.json({ error: "Link não encontrado" }, { status: 404 })

  if (aprovacao.expiresAt && aprovacao.expiresAt < new Date()) {
    return NextResponse.json({ error: "Link expirado" }, { status: 410 })
  }

  if (aprovacao.status !== "pendente") {
    return NextResponse.json({ error: "Esta aprovação já foi respondida", status: aprovacao.status }, { status: 400 })
  }

  const novoStatus = acao === "aprovar" ? "aprovado" : "feedback_solicitado"

  const updated = await prisma.aprovacaoVideo.update({
    where: { token },
    data: { status: novoStatus, aprovadoPor, comentario },
  })

  // Se aprovado, atualiza status da demanda
  if (acao === "aprovar") {
    await prisma.demanda.update({
      where: { id: aprovacao.demandaId },
      data: { statusInterno: "aprovado", statusVisivel: "para_postar" },
    })
    await prisma.historicoStatus.create({
      data: {
        demandaId: aprovacao.demandaId,
        statusAnterior: aprovacao.status,
        statusNovo: "aprovado",
        origem: "manual",
        observacao: `Vídeo aprovado pelo cliente${aprovadoPor ? ` (${aprovadoPor})` : ""}`,
      },
    })
  } else {
    // Solicita ajuste
    await prisma.demanda.update({
      where: { id: aprovacao.demandaId },
      data: { statusInterno: "ajuste_solicitado", statusVisivel: "aprovacao" },
    })
    await prisma.historicoStatus.create({
      data: {
        demandaId: aprovacao.demandaId,
        statusAnterior: "revisao_pendente",
        statusNovo: "ajuste_solicitado",
        origem: "manual",
        observacao: `Feedback do cliente: ${comentario ?? "Ajuste solicitado"}`,
      },
    })
  }

  // Cria alerta para a equipe
  await prisma.alertaIA.create({
    data: {
      demandaId: aprovacao.demandaId,
      tipoAlerta: acao === "aprovar" ? "video_aprovado" : "ajuste_solicitado",
      mensagem: acao === "aprovar"
        ? `✅ Vídeo aprovado pelo cliente${aprovadoPor ? ` (${aprovadoPor})` : ""}!`
        : `🔄 Cliente solicitou ajustes: "${comentario ?? "Sem comentário"}"`,
      severidade: acao === "aprovar" ? "info" : "aviso",
    },
  })

  return NextResponse.json({ ok: true, status: updated.status })
}
