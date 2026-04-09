import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type Params = { params: Promise<{ id: string }> }

// POST /api/usuarios/[id]/promover
// Body: { tipo: "gestor" | "operacao" | "social" }
// Promove um solicitante para um tipo de usuário com mais permissões
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const userTipo = (session.user as { tipo?: string }).tipo
  if (userTipo !== "admin" && userTipo !== "gestor") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()
  const { tipo } = body

  const tiposPermitidos = ["gestor", "operacao", "social", "admin"]
  if (!tiposPermitidos.includes(tipo)) {
    return NextResponse.json({ error: `Tipo inválido. Use: ${tiposPermitidos.join(", ")}` }, { status: 400 })
  }

  const usuario = await prisma.usuario.findUnique({ where: { id } })
  if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })

  if (usuario.tipo !== "solicitante") {
    return NextResponse.json({ error: `Usuário já é "${usuario.tipo}", não é um solicitante` }, { status: 400 })
  }

  const atualizado = await prisma.usuario.update({
    where: { id },
    data: { tipo: tipo as import("@prisma/client").TipoUsuario },
  })

  return NextResponse.json({ ok: true, usuario: { id: atualizado.id, nome: atualizado.nome, tipo: atualizado.tipo } })
}
