import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { recalcularMediaVideomaker } from "@/lib/avaliacao"

// Avaliação INTERNA de videomaker — quem contratou dando a nota.
//
// O handler não tinha checagem de sessão nenhuma: quem respondia era o
// middleware, e só porque `/api/videomakers` não está na lista de rotas
// públicas. Uma linha a mais naquela lista, um matcher ajustado, e a rota
// passava a aceitar POST de qualquer um — com `origem: "interno"` no corpo,
// porque o campo vinha do cliente. A nota de um profissional é o ativo dele no
// marketplace; a porta não pode depender só do middleware.
//
// A avaliação pública por QR tem rota própria: /api/publico/avaliar.

// POST /api/videomakers/[id]/avaliar
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { nota, comentario, demandaId } = body

  const valor = parseInt(nota)
  if (!Number.isInteger(valor) || valor < 1 || valor > 5) {
    return NextResponse.json({ error: "Nota deve ser entre 1 e 5" }, { status: 400 })
  }

  const vm = await prisma.videomaker.findUnique({ where: { id }, select: { id: true } })
  if (!vm) return NextResponse.json({ error: "Videomaker não encontrado" }, { status: 404 })

  const avaliacao = await prisma.avaliacaoVideomaker.create({
    data: {
      videomakerId: id,
      nota: valor,
      comentario: comentario ?? null,
      demandaId: demandaId ?? null,
      // `origem` e `avaliadorId` saem da sessão, não do corpo. Aqui é sempre
      // interno — quem avalia é quem está logado.
      origem: "interno",
      avaliadorId: session.user.id,
    },
  })

  const novaMedia = await recalcularMediaVideomaker(id)
  return NextResponse.json({ avaliacao, novaMedia }, { status: 201 })
}

// GET /api/videomakers/[id]/avaliar — listar avaliações
//
// DÍVIDA CONHECIDA (Fase 2): a lista devolve os comentários de TODAS as
// empresas. A nota agregada é global de propósito, mas o comentário é
// observação interna de quem contratou. Separar exige coluna de organização em
// `avaliacoes_videomaker`.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params

  const [avaliacoes, { _avg, _count }] = await Promise.all([
    prisma.avaliacaoVideomaker.findMany({
      where: { videomakerId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.avaliacaoVideomaker.aggregate({
      where: { videomakerId: id },
      _avg: { nota: true },
      _count: true,
    }),
  ])

  // Média e total sobre TUDO, não só sobre as 50 primeiras — antes o `take: 50`
  // silenciosamente virava o universo do cálculo, e a média da tela divergia da
  // do perfil assim que o profissional passava de 50 avaliações.
  return NextResponse.json({
    avaliacoes,
    media: Math.round((_avg.nota ?? 0) * 10) / 10,
    total: _count,
  })
}
