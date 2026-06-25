import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg, pertenceAOrg } from "@/lib/org"
import { normalizarNome } from "@/lib/pessoas"

type Params = { params: Promise<{ id: string }> }

// PATCH /api/growth/linhas-projetos/[id] — edita nome/descricao/ativo (ownership por org).
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const { id } = await params
  const alvo = await prisma.linhaProjeto.findUnique({ where: { id }, select: { organizacaoId: true } })
  if (!alvo || !pertenceAOrg(alvo, organizacaoId)) return NextResponse.json({ error: "Linha/projeto não encontrada" }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {}
  if (body.nome !== undefined) {
    const nome = (body.nome as string).trim().replace(/\s+/g, " ")
    if (!nome) return NextResponse.json({ error: "Nome inválido" }, { status: 400 })
    // Evita colisão normalizada (caixa/espaços/acentos) com OUTRA linha da mesma org
    const outras = await prisma.linhaProjeto.findMany({
      where: { organizacaoId, NOT: { id } },
      select: { nome: true },
    })
    const alvo = normalizarNome(nome)
    if (outras.some((l) => normalizarNome(l.nome) === alvo)) {
      return NextResponse.json({ error: "Já existe uma linha/projeto com esse nome" }, { status: 409 })
    }
    data.nome = nome
  }
  if (body.descricao !== undefined) data.descricao = (body.descricao as string)?.trim() || null
  if (typeof body.ativo === "boolean") data.ativo = body.ativo

  const linha = await prisma.linhaProjeto.update({
    where: { id },
    data,
    select: { id: true, nome: true, descricao: true, ativo: true },
  })
  return NextResponse.json({ linha })
}

// DELETE /api/growth/linhas-projetos/[id] — soft delete (ativo=false). Nunca apaga
// fisicamente se houver demandas vinculadas. Ownership por org.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const { id } = await params
  const alvo = await prisma.linhaProjeto.findUnique({ where: { id }, select: { organizacaoId: true } })
  if (!alvo || !pertenceAOrg(alvo, organizacaoId)) return NextResponse.json({ error: "Linha/projeto não encontrada" }, { status: 404 })

  const emUso = await prisma.demanda.count({ where: { linhaProjetoId: id } })
  if (emUso === 0) {
    // Sem vínculos → pode remover fisicamente
    await prisma.linhaProjeto.delete({ where: { id } })
    return NextResponse.json({ ok: true, hardDelete: true })
  }
  // Com vínculos → soft delete (preserva histórico das demandas antigas)
  await prisma.linhaProjeto.update({ where: { id }, data: { ativo: false } })
  return NextResponse.json({ ok: true, hardDelete: false, demandasVinculadas: emUso })
}
