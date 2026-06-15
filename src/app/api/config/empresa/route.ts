import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"

// GET /api/config/empresa — retorna dados da empresa (público para videomakers)
// NOTA: consumo público — resolução por org fica no pacote de consumo (junto do S8/e-mail).
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
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const body = await req.json()

  const existing = await prisma.configEmpresa.findFirst({ where: { organizacaoId } })

  // Converte string vazia para null (campo não preenchido = sem dado, não string vazia)
  const v = (val: unknown) => (typeof val === "string" ? val.trim() || null : (val ?? null))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: Record<string, any> = {
    cnpj: v(body.cnpj),
    razaoSocial: v(body.razaoSocial),
    nomeFantasia: v(body.nomeFantasia),
    endereco: v(body.endereco),
    bairro: v(body.bairro),
    cidade: v(body.cidade),
    estado: v(body.estado),
    cep: v(body.cep),
    email: v(body.email),
    telefone: v(body.telefone),
    pixKey: v(body.pixKey),
    pixTipo: v(body.pixTipo),
    observacoesNF: v(body.observacoesNF),
  }

  // Campos Drive — só sobrescreve se vieram no body (evitar apagar OAuth token)
  if ("googleDriveFolderId" in body) {
    data.googleDriveFolderId = body.googleDriveFolderId || null
  }

  let empresa
  if (existing) {
    empresa = await prisma.configEmpresa.update({ where: { id: existing.id }, data })
  } else {
    empresa = await prisma.configEmpresa.create({ data: { ...data, organizacaoId } })
  }

  return NextResponse.json({ empresa })
}
