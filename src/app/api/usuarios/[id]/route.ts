import { correlacaoAuditoria, registrarAuditoria } from "@/lib/auditoria"
import { comOrg } from "@/lib/org-contexto"
import { podeAdministrarIdentidade, numeroDeEmpresasDaIdentidade } from "@/lib/identidade-admin"
import { requireAcesso } from "@/lib/acesso"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { contarVinculos } from "@/lib/usuario-vinculos"
import { PRESETS } from "@/lib/permissoes"
import { setPermissoes } from "@/lib/permissoes-server"
import bcrypt from "bcryptjs"
import type { TipoUsuario, CategoriaPessoa, AreaAtuacao } from "@prisma/client"

// PATCH /api/usuarios/[id] — atualiza dados + Pessoas & Acessos (categoria/função/áreas/papel)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await requireAcesso()
  if (acesso instanceof NextResponse) return acesso

  const { id } = await params

  const isOwn = acesso.usuarioId === id
  const isPrivileged = acesso.permissoes.gerenciarUsuarios

  if (!isOwn && !isPrivileged) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  const { organizacaoId } = acesso

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
  if (isOwn && ["papel", "tipo", "liderAudiovisual"].some(campo => campo in body)) {
    return NextResponse.json({ error: "Outra pessoa autorizada deve alterar seu papel" }, { status: 403 })
  }

  const data: Record<string, unknown> = {}
  if (nome) data.nome = nome
  if (telefone !== undefined) data.telefone = telefone
  if (email && isPrivileged) data.email = email
  if (isPrivileged && status) data.status = status

  // Admin/gestor pode forçar reset de senha
  if (isPrivileged && novaSenha && typeof novaSenha === "string" && novaSenha.length >= 6) {
    data.senhaHash = await bcrypt.hash(novaSenha, 12)
  }

  if (Object.keys(data).length && !await podeAdministrarIdentidade(acesso.usuarioId, organizacaoId, id)) {
    return NextResponse.json({ error: "Alterar a identidade compartilhada requer administração da plataforma" }, { status: 403 })
  }

  const correlationId = correlacaoAuditoria()
  const usuario = await comOrg(organizacaoId, () => prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`permissoes:${organizacaoId}:${id}`}, 0))`
    const antes = await tx.usuarioOrganizacao.findUnique({ where: { usuarioId_organizacaoId: { usuarioId: id, organizacaoId } }, select: { papel: true, liderAudiovisual: true, recebeTodosAvisos: true, categoria: true, funcaoProfissional: true, areas: true } })
    const identidadeAntes = await tx.usuario.findUniqueOrThrow({ where: { id } })
    const permissoesAntes = await tx.permissaoUsuario.findUnique({ where: { usuarioId_organizacaoId: { usuarioId: id, organizacaoId } } })
    const usuario = await tx.usuario.update({
      where: { id },
      data,
      select: { id: true, nome: true, email: true, tipo: true, status: true },
    })

    let camposMembro: string[] = []
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
      if (typeof body.liderAudiovisual === "boolean") memData.liderAudiovisual = body.liderAudiovisual
      // Só os avisos — não mexe em permissão nenhuma. É o ponto: acompanhar a
      // operação deixou de exigir virar gestor.
      if (typeof body.recebeTodosAvisos === "boolean") memData.recebeTodosAvisos = body.recebeTodosAvisos
      camposMembro = Object.keys(memData).filter(k => JSON.stringify(antes?.[k as keyof typeof antes]) !== JSON.stringify(memData[k]))
      if (camposMembro.length > 0) {
        await tx.usuarioOrganizacao.updateMany({ where: { usuarioId: id, organizacaoId }, data: memData })
      }
      // Ao promover a Líder audiovisual, concede o preset de permissões de líder
      // (edita, move, vê todas, aprova). Ao desligar, não rebaixa (evita surpresa).
      if (body.liderAudiovisual === true) {
        // O preset vale só nesta empresa — liderar o audiovisual aqui não concede
        // nada em outra empresa de que a pessoa participe.
        await setPermissoes(id, organizacaoId, PRESETS.lider_audiovisual, tx)
      }
    }

    const depois = await tx.usuarioOrganizacao.findUnique({ where: { usuarioId_organizacaoId: { usuarioId: id, organizacaoId } }, select: { papel: true, liderAudiovisual: true, recebeTodosAvisos: true, categoria: true, funcaoProfissional: true, areas: true } })
    const campos = [...Object.keys(data).filter(k => identidadeAntes[k as keyof typeof identidadeAntes] !== data[k]), ...camposMembro]
    if (campos.length || JSON.stringify(antes) !== JSON.stringify(depois)) await registrarAuditoria(tx, acesso, {
      acao: "usuario.alterado", recurso: "usuario", recursoId: id, correlationId,
      antes: { ...antes, ativo: identidadeAntes.status === "ativo" }, depois: { ...depois, ativo: usuario.status === "ativo", campos },
    })
    if (isPrivileged && body.liderAudiovisual === true) {
      const permissoesDepois = await tx.permissaoUsuario.findUniqueOrThrow({ where: { usuarioId_organizacaoId: { usuarioId: id, organizacaoId } } })
      if (!permissoesAntes || Object.entries(PRESETS.lider_audiovisual).some(([k,v]) => permissoesAntes[k as keyof typeof permissoesAntes] !== v)) await registrarAuditoria(tx, acesso, {
        acao: "permissoes.alteradas", recurso: "usuario", recursoId: id, correlationId, antes: permissoesAntes ?? PRESETS[antes?.papel ?? "solicitante"], depois: permissoesDepois,
      })
    }
    return usuario
  }))

  return NextResponse.json({ usuario })
}

// DELETE /api/usuarios/[id] — desativa pessoa na ORGANIZAÇÃO ATIVA (admin/gestor).
// Se a pessoa pertence só a esta org: inativa a conta global. Se pertence a mais de
// uma org: remove apenas o vínculo desta org (não afeta outras empresas).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await requireAcesso("gerenciarUsuarios")
  if (acesso instanceof NextResponse) return acesso

  const { id } = await params

  if (acesso.usuarioId === id) {
    return NextResponse.json({ error: "Não é possível desativar sua própria conta aqui" }, { status: 400 })
  }
  const { organizacaoId } = acesso

  // Só desativa/remove quem pertence à organização ativa
  const membership = await prisma.usuarioOrganizacao.findUnique({
    where: { usuarioId_organizacaoId: { usuarioId: id, organizacaoId } },
    select: { id: true },
  })
  if (!membership) return NextResponse.json({ error: "Pessoa não encontrada nesta organização" }, { status: 404 })

  const totalOrgs = await numeroDeEmpresasDaIdentidade(id)
  const modo = req.nextUrl.searchParams.get("modo")

  if ((modo === "hard" || totalOrgs <= 1) && !await podeAdministrarIdentidade(acesso.usuarioId, organizacaoId, id)) {
    return NextResponse.json({ error: "Operação sobre identidade protegida requer administração da plataforma" }, { status: 403 })
  }

  // ── HARD DELETE controlado: só para cadastro VAZIO (sem vínculos) ──────────
  if (modo === "hard") {
    const vinculos = await contarVinculos(id)
    if (!vinculos.podeExcluir) {
      return NextResponse.json(
        { error: "Este usuário tem vínculos. Mescle com outro usuário antes de excluir.", vinculos, podeExcluir: false },
        { status: 409 }
      )
    }
    // Regra SaaS: pertence a mais de uma org → só super-admin pode apagar globalmente
    if (totalOrgs > 1) {
      const eu = await prisma.usuario.findUnique({ where: { id: acesso.usuarioId }, select: { superAdmin: true } })
      if (!eu?.superAdmin) {
        return NextResponse.json(
          { error: "Usuário pertence a outras organizações. Exclusão global requer super-admin; aqui você pode apenas remover o vínculo desta empresa.", multiOrg: true },
          { status: 403 }
        )
      }
    }
    // Sem vínculos → apaga Usuario; cascades cuidam de membership/permissões/sessões.
    await comOrg(organizacaoId, () => prisma.$transaction(async tx => {
      await tx.usuario.delete({ where: { id } })
      await registrarAuditoria(tx, acesso, { acao: "usuario.removido", recurso: "usuario", recursoId: id, correlationId: correlacaoAuditoria(), depois: { ativo: false } })
    }))
    return NextResponse.json({ ok: true, hardDelete: true })
  }

  // ── SOFT (padrão): desativa global se só nesta org; senão remove só o vínculo ─
  if (totalOrgs <= 1) {
    const usuario = await comOrg(organizacaoId, () => prisma.$transaction(async tx => {
      const antes = await tx.usuario.findUniqueOrThrow({ where: { id }, select: { status: true } })
      const atualizado = await tx.usuario.update({ where: { id }, data: { status: "inativo" }, select: { id: true, nome: true, status: true } })
      if (antes.status !== "inativo") await registrarAuditoria(tx, acesso, { acao: "usuario.removido", recurso: "usuario", recursoId: id, correlationId: correlacaoAuditoria(), depois: { ativo: false } })
      return atualizado
    }))
    return NextResponse.json({ usuario, escopo: "global" })
  }
  await comOrg(organizacaoId, () => prisma.$transaction(async tx => {
    await tx.usuarioOrganizacao.delete({ where: { id: membership.id } })
    await registrarAuditoria(tx, acesso, { acao: "usuario.removido", recurso: "usuario", recursoId: id, correlationId: correlacaoAuditoria(), depois: { ativo: false } })
  }))
  const usuario = await prisma.usuario.findUnique({ where: { id }, select: { id: true, nome: true, status: true } })
  return NextResponse.json({ usuario, escopo: "organizacao" })
}
