import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import bcrypt from "bcryptjs"
import type { TipoUsuario, CategoriaPessoa, AreaAtuacao } from "@prisma/client"

// PATCH /api/usuarios/[id] — atualiza dados + Pessoas & Acessos (categoria/função/áreas/papel)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params

  const isOwn = session.user.id === id
  const isPrivileged = ["admin", "gestor"].includes(session.user.tipo)

  if (!isOwn && !isPrivileged) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  const organizacaoId = await getOrgId(session)

  // Isolamento: privilegiado só edita pessoas da própria organização
  if (isPrivileged && !isOwn && organizacaoId) {
    const membro = await prisma.usuarioOrganizacao.findUnique({
      where: { usuarioId_organizacaoId: { usuarioId: id, organizacaoId } },
      select: { id: true },
    })
    if (!membro) return NextResponse.json({ error: "Pessoa não encontrada nesta organização" }, { status: 404 })
  }

  const body = await req.json()
  const { status, tipo, nome, email, telefone, novaSenha } = body

  const data: Record<string, unknown> = {}
  if (nome) data.nome = nome
  if (telefone !== undefined) data.telefone = telefone
  if (email && isPrivileged) data.email = email
  if (isPrivileged && status) data.status = status
  if (isPrivileged && tipo) data.tipo = tipo

  // Admin/gestor pode forçar reset de senha
  if (isPrivileged && novaSenha && typeof novaSenha === "string" && novaSenha.length >= 6) {
    data.senhaHash = await bcrypt.hash(novaSenha, 12)
  }

  const usuario = await prisma.usuario.update({
    where: { id },
    data,
    select: { id: true, nome: true, email: true, tipo: true, status: true },
  })

  // Pessoas & Acessos: atualiza as dimensões por organização na membership.
  if (isPrivileged && organizacaoId) {
    const memData: Record<string, unknown> = {}
    if (body.papel) memData.papel = body.papel as TipoUsuario
    else if (tipo) memData.papel = tipo as TipoUsuario
    if (body.categoria) memData.categoria = body.categoria as CategoriaPessoa
    if (body.funcaoProfissional !== undefined) memData.funcaoProfissional = (body.funcaoProfissional as string)?.trim() || null
    if (Array.isArray(body.areas)) {
      const validas: AreaAtuacao[] = ["audiovisual", "growth", "eventos"]
      memData.areas = (body.areas as string[]).filter((a) => validas.includes(a as AreaAtuacao))
    }
    if (Object.keys(memData).length > 0) {
      await prisma.usuarioOrganizacao.updateMany({ where: { usuarioId: id, organizacaoId }, data: memData })
    }
  }

  return NextResponse.json({ usuario })
}

// DELETE /api/usuarios/[id] — desativa pessoa na ORGANIZAÇÃO ATIVA (admin/gestor).
// Se a pessoa pertence só a esta org: inativa a conta global. Se pertence a mais de
// uma org: remove apenas o vínculo desta org (não afeta outras empresas).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params

  if (!["admin", "gestor"].includes(session.user.tipo)) {
    return NextResponse.json({ error: "Sem permissão para desativar usuários" }, { status: 403 })
  }
  if (session.user.id === id) {
    return NextResponse.json({ error: "Não é possível desativar sua própria conta aqui" }, { status: 400 })
  }
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  // Só desativa quem pertence à organização ativa
  const membership = await prisma.usuarioOrganizacao.findUnique({
    where: { usuarioId_organizacaoId: { usuarioId: id, organizacaoId } },
    select: { id: true },
  })
  if (!membership) return NextResponse.json({ error: "Pessoa não encontrada nesta organização" }, { status: 404 })

  const totalOrgs = await prisma.usuarioOrganizacao.count({ where: { usuarioId: id } })

  if (totalOrgs <= 1) {
    const usuario = await prisma.usuario.update({
      where: { id },
      data: { status: "inativo" },
      select: { id: true, nome: true, status: true },
    })
    return NextResponse.json({ usuario, escopo: "global" })
  }

  // Pertence a outras empresas → remove só o vínculo desta org
  await prisma.usuarioOrganizacao.delete({ where: { id: membership.id } })
  const usuario = await prisma.usuario.findUnique({ where: { id }, select: { id: true, nome: true, status: true } })
  return NextResponse.json({ usuario, escopo: "organizacao" })
}
