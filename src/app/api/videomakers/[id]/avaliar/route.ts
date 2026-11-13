import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { recalcularMediaVideomaker } from "@/lib/avaliacao"
import { getOrgId, semOrg } from "@/lib/org"
import { LIMITE_COMENTARIO_AVALIACAO } from "@/lib/avaliacao-limite"
import { avaliacoesVideomakerDaEmpresa, scoreDaRede } from "@/lib/rede"
import { podeVerVideomaker } from "@/lib/videomakers-da-rede"

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
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const { id } = await params
  const body = await req.json()
  const { nota, comentario, demandaId } = body

  const valor = parseInt(nota)
  if (!Number.isInteger(valor) || valor < 1 || valor > 5) {
    return NextResponse.json({ error: "Nota deve ser entre 1 e 5" }, { status: 400 })
  }
  if (comentario != null && (typeof comentario !== "string" || comentario.length > LIMITE_COMENTARIO_AVALIACAO)) {
    return NextResponse.json({ error: `Comentário com até ${LIMITE_COMENTARIO_AVALIACAO} caracteres.` }, { status: 400 })
  }

  // Só avalia quem tem o profissional na lista (Política de Avaliações, seção 2):
  // uma empresa que só o encontrou na rede não pode mexer na média dele.
  const vm = await prisma.videomaker.findFirst({ where: { id, vinculos: { some: { organizacaoId } } }, select: { id: true } })
  if (!vm) return NextResponse.json({ error: "Só a empresa que trabalha com este profissional pode avaliá-lo." }, { status: 404 })

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
      organizacaoId,
    },
  })

  const novaMedia = await recalcularMediaVideomaker(id)
  return NextResponse.json({ avaliacao, novaMedia }, { status: 201 })
}

// GET /api/videomakers/[id]/avaliar — listar avaliações
//
// Duas coisas com regras diferentes na mesma tela (Política de Avaliações):
//
//   a NOTA agregada é da REDE — média dos últimos 24 meses, a partir de 3
//   avaliações, sem as que estão contestadas (lib/rede, função score_rede).
//
//   o COMENTÁRIO é de quem contratou. Antes, esta lista trazia também os
//   comentários das avaliações por QR sem dono, e eles apareciam para todas as
//   empresas. Agora só os desta empresa (lib/rede).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const { id } = await params
  // Sem a rede (módulo "rede"), o score de quem não é da empresa nem esteve num
  // card dela não aparece: é o mesmo recorte do perfil.
  if (!(await podeVerVideomaker(organizacaoId, id))) return NextResponse.json({ error: "Videomaker não encontrado" }, { status: 404 })

  const [avaliacoes, score] = await Promise.all([
    avaliacoesVideomakerDaEmpresa(id, organizacaoId),
    scoreDaRede("videomaker", id),
  ])

  return NextResponse.json({ avaliacoes, score, media: score.media, total: score.avaliacoes })
}
