import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/org"

type Params = { params: Promise<{ id: string }> }

// PATCH /api/admin/organizacoes/[id] — ativa, desativa ou renomeia (super-admin).
//
// `ativo` já existia no schema e era LIDO em toda parte — o seletor de empresa,
// as rotas públicas, o cron dos agentes —, mas nada nunca o escrevia. Desligar
// um cliente era um UPDATE à mão no banco.
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  const guard = await requireSuperAdmin(session)
  if (guard instanceof NextResponse) return guard

  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const data: { ativo?: boolean; nome?: string } = {}
  if (typeof body.ativo === "boolean") data.ativo = body.ativo
  if (typeof body.nome === "string" && body.nome.trim()) data.nome = body.nome.trim()
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada a alterar. Envie `ativo` ou `nome`." }, { status: 400 })
  }

  // Desligar a empresa onde o próprio super-admin está trabalhando o deixaria
  // sem organização resolvível no meio da sessão — e a tela quebraria sem dizer
  // por quê. Barrar aqui é mais barato que explicar depois.
  if (data.ativo === false) {
    const usuarioId = guard.usuarioId
    const ehMinha = await prisma.usuarioOrganizacao.findUnique({
      where: { usuarioId_organizacaoId: { usuarioId, organizacaoId: id } },
      select: { id: true },
    })
    // Só conta se for minha: para empresa de cliente, a resposta não muda nada
    // e a consulta seria desperdício em toda troca de estado.
    const quantasAtivas = ehMinha
      ? await prisma.usuarioOrganizacao.count({ where: { usuarioId, organizacao: { ativo: true } } })
      : 0
    if (ehMinha && quantasAtivas <= 1) {
      return NextResponse.json(
        { error: "Esta é a sua única empresa ativa. Desligá-la deixaria você sem acesso." },
        { status: 409 }
      )
    }
  }

  const org = await prisma.organizacao.update({
    where: { id },
    data,
    select: { id: true, nome: true, slug: true, ativo: true },
  }).catch(() => null)
  if (!org) return NextResponse.json({ error: "Organização não encontrada" }, { status: 404 })

  return NextResponse.json({ organizacao: org })
}
