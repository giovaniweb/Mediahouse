import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

// GET /api/usuarios — lista todos os usuários (admin/gestor)
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  if (!["admin", "gestor"].includes(session.user.tipo)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  const usuarios = await prisma.usuario.findMany({
    select: {
      id: true,
      nome: true,
      email: true,
      telefone: true,
      tipo: true,
      status: true,
      avatarUrl: true,
      createdAt: true,
    },
    orderBy: { nome: "asc" },
  })

  const videomakers = await prisma.videomaker.findMany({
    select: { id: true, nome: true, email: true, telefone: true, status: true, createdAt: true },
    orderBy: { nome: "asc" },
  })
  const editores = await prisma.editor.findMany({
    select: { id: true, nome: true, email: true, telefone: true, status: true, createdAt: true },
    orderBy: { nome: "asc" },
  })

  return NextResponse.json({ usuarios, videomakers, editores })
}

// POST /api/usuarios — cria novo usuário (admin)
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  if (!["admin", "gestor"].includes(session.user.tipo)) {
    return NextResponse.json({ error: "Sem permissão para criar usuários" }, { status: 403 })
  }

  const body = await req.json()
  const { nome, email, senha, tipo, telefone } = body

  // email é opcional — usuário pode logar pelo telefone
  if (!nome || !senha || !tipo) {
    return NextResponse.json({ error: "Campos obrigatórios: nome, senha, tipo" }, { status: 400 })
  }

  // Verificar unicidade de email (se fornecido)
  const emailFinal = email?.trim() || null
  if (emailFinal) {
    const existe = await prisma.usuario.findUnique({ where: { email: emailFinal } })
    if (existe) return NextResponse.json({ error: "E-mail já cadastrado" }, { status: 409 })
  }

  // Verificar unicidade por telefone (se não tem email)
  if (!emailFinal && telefone) {
    const cleanDigits = telefone.replace(/\D/g, "")
    const existePorTel = await prisma.usuario.findFirst({
      where: { telefone: { contains: cleanDigits } },
    })
    if (existePorTel) return NextResponse.json({ error: "Telefone já cadastrado" }, { status: 409 })
  }

  const senhaHash = await bcrypt.hash(senha, 12)

  const usuario = await prisma.usuario.create({
    data: { nome, email: emailFinal, senhaHash, tipo, telefone },
    select: { id: true, nome: true, email: true, tipo: true, status: true },
  })

  return NextResponse.json({ usuario }, { status: 201 })
}
