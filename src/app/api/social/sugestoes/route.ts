import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { lerSugestao, TAG_SOLICITACAO } from "@/lib/social-quadro"

// "Mandar ideia" — qualquer pessoa logada da empresa manda uma ideia ou uma
// solicitação para a social media de uma linha. Mesmo banco de ideias
// (IdeiaVideo); cai em Ideias do quadro dela com "Enviada por Fulano". Quem
// manda não aciona a equipe: só a social transforma em plano ou pedido.

// GET — as linhas para escolher e o que esta pessoa já mandou, com o andamento.
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const [linhas, enviadas] = await Promise.all([
    prisma.linhaProjeto.findMany({
      where: { organizacaoId, ativo: true },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
    prisma.ideiaVideo.findMany({
      where: { organizacaoId, usuarioId: session.user.id, linhaProjetoId: { not: null }, status: { not: "rascunho" } },
      select: {
        id: true, titulo: true, status: true, dataPostagem: true, tags: true, createdAt: true,
        linhaProjeto: { select: { nome: true } },
        demanda: { select: { codigo: true, statusVisivel: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ])
  return NextResponse.json({ linhas, enviadas })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const lido = lerSugestao(await req.json().catch(() => ({})))
  if (!lido.ok) return NextResponse.json({ error: lido.motivo }, { status: 400 })
  const { solicitacao, ...d } = lido.dados
  const linha = await prisma.linhaProjeto.findFirst({ where: { id: d.linhaProjetoId, organizacaoId, ativo: true }, select: { id: true } })
  if (!linha) return NextResponse.json({ error: "Linha de produto não encontrada." }, { status: 404 })

  const ideia = await prisma.ideiaVideo.create({
    data: {
      organizacaoId,
      ...d,
      origem: "manual",
      status: "nova",
      usuarioId: session.user.id,
      enviadoPor: session.user.name ?? null,
      tags: solicitacao ? [TAG_SOLICITACAO] : [],
    },
    select: { id: true },
  })
  return NextResponse.json(ideia, { status: 201 })
}
