import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/config/empresa — retorna dados da empresa (público para videomakers)
export async function GET() {
  const empresa = await prisma.configEmpresa.findFirst()
  return NextResponse.json({ empresa })
}

// POST /api/config/empresa — cria ou atualiza dados da empresa (admin/gestor)
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  // Verificar permissão
  const perm = await prisma.permissaoUsuario.findUnique({ where: { usuarioId: session.user.id } })
  if (!perm?.gerenciarConfig && session.user.tipo !== "admin" && session.user.tipo !== "gestor") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  const body = await req.json()

  const existing = await prisma.configEmpresa.findFirst()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: Record<string, any> = {
    cnpj: body.cnpj ?? null,
    razaoSocial: body.razaoSocial ?? null,
    nomeFantasia: body.nomeFantasia ?? null,
    endereco: body.endereco ?? null,
    bairro: body.bairro ?? null,
    cidade: body.cidade ?? null,
    estado: body.estado ?? null,
    cep: body.cep ?? null,
    email: body.email ?? null,
    telefone: body.telefone ?? null,
    pixKey: body.pixKey ?? null,
    pixTipo: body.pixTipo ?? null,
    observacoesNF: body.observacoesNF ?? null,
  }

  // Campos Drive — só sobrescreve se vieram no body (evitar apagar OAuth token)
  if ("googleDriveFolderId" in body) {
    data.googleDriveFolderId = body.googleDriveFolderId || null
  }

  let empresa
  if (existing) {
    empresa = await prisma.configEmpresa.update({ where: { id: existing.id }, data })
  } else {
    empresa = await prisma.configEmpresa.create({ data })
  }

  return NextResponse.json({ empresa })
}
