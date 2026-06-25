import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import bcrypt from "bcryptjs"
import type { TipoUsuario, CategoriaPessoa, AreaAtuacao } from "@prisma/client"

// GET /api/usuarios — Pessoas & Acessos da organização logada (admin/gestor).
// ISOLADO por organização (via membership). Inclui categoria/função/áreas/papel.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  if (!["admin", "gestor"].includes(session.user.tipo)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const { searchParams } = new URL(req.url)
  const busca = searchParams.get("busca")?.trim()

  const memberships = await prisma.usuarioOrganizacao.findMany({
    where: {
      organizacaoId,
      ...(busca ? {
        usuario: {
          OR: [
            { nome: { contains: busca, mode: "insensitive" } },
            { email: { contains: busca, mode: "insensitive" } },
            { telefone: { contains: busca } },
          ],
        },
      } : {}),
    },
    select: {
      papel: true, categoria: true, funcaoProfissional: true, areas: true,
      usuario: { select: { id: true, nome: true, email: true, telefone: true, tipo: true, status: true, avatarUrl: true, createdAt: true } },
    },
    orderBy: { usuario: { nome: "asc" } },
  })

  const usuarios = memberships.map((m) => ({
    ...m.usuario,
    papel: m.papel,
    categoria: m.categoria,
    funcaoProfissional: m.funcaoProfissional,
    areas: m.areas,
  }))

  if (busca) {
    return NextResponse.json({ usuarios, videomakers: [], editores: [] })
  }

  // Videomaker externo é GLOBAL (rede compartilhada). Editor é interno e por org.
  const videomakers = await prisma.videomaker.findMany({
    select: { id: true, nome: true, email: true, telefone: true, status: true, createdAt: true, usuarioId: true },
    orderBy: { nome: "asc" },
  })
  const editores = await prisma.editor.findMany({
    where: { organizacaoId },
    select: { id: true, nome: true, email: true, telefone: true, status: true, createdAt: true, usuarioId: true },
    orderBy: { nome: "asc" },
  })

  return NextResponse.json({ usuarios, videomakers, editores })
}

// POST /api/usuarios — cria pessoa + membership na organização logada (admin/gestor).
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  if (!["admin", "gestor"].includes(session.user.tipo)) {
    return NextResponse.json({ error: "Sem permissão para criar usuários" }, { status: 403 })
  }
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const body = await req.json()
  const { nome, email, senha, tipo, telefone } = body

  if (!nome || !senha || !tipo) {
    return NextResponse.json({ error: "Campos obrigatórios: nome, senha, tipo" }, { status: 400 })
  }

  const emailFinal = email?.trim() || null
  if (emailFinal) {
    const existe = await prisma.usuario.findUnique({ where: { email: emailFinal } })
    if (existe) return NextResponse.json({ error: "E-mail já cadastrado" }, { status: 409 })
  }

  const telDigits = telefone?.replace(/\D/g, "") ?? ""
  if (telDigits.length >= 8) {
    const existePorTel = await prisma.usuario.findFirst({
      where: { telefone: { contains: telDigits.slice(-9) } },
      select: { id: true, nome: true, email: true, telefone: true },
    })
    if (existePorTel) {
      return NextResponse.json({ error: "Telefone já cadastrado", usuario: existePorTel }, { status: 409 })
    }
  }

  if (!emailFinal && !telDigits) {
    return NextResponse.json({ error: "Informe ao menos e-mail ou telefone" }, { status: 400 })
  }

  const senhaHash = await bcrypt.hash(senha, 12)
  const usuario = await prisma.usuario.create({
    data: { nome, email: emailFinal, senhaHash, tipo: tipo as TipoUsuario, telefone },
    select: { id: true, nome: true, email: true, tipo: true, status: true },
  })

  // Membership na org logada (Pessoas & Acessos). Dimensões opcionais no body.
  const areasValidas: AreaAtuacao[] = ["audiovisual", "growth", "eventos"]
  const areas = Array.isArray(body.areas) ? (body.areas as string[]).filter((a) => areasValidas.includes(a as AreaAtuacao)) as AreaAtuacao[] : []
  await prisma.usuarioOrganizacao.create({
    data: {
      usuarioId: usuario.id,
      organizacaoId,
      papel: tipo as TipoUsuario,
      categoria: (body.categoria as CategoriaPessoa) ?? "interna",
      funcaoProfissional: (body.funcaoProfissional as string | undefined)?.trim() || tipo,
      areas,
    },
  })

  return NextResponse.json({ usuario }, { status: 201 })
}
