import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { ehGestor } from "@/lib/papel"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { getPermissoes } from "@/lib/permissoes-server"
import { orgPublica } from "@/lib/org"

// GET /api/config/empresa — dados da empresa, público para videomakers.
//
// Aceita `?org=<slug>`. Sem ele, cai na ORG_PUBLICA_PADRAO: os links que já
// circulam não identificam empresa, e quebrá-los agora tiraria do ar os
// formulários em uso. O que mudou é que o destino deixou de ser "contourline"
// cravado no código e virou configuração — a segunda empresa não herda os links
// da primeira. O `findFirst()` global saiu: ele devolvia dados de QUALQUER
// empresa quando a padrão não existisse.
export async function GET(req: NextRequest) {
  const organizacaoId = await orgPublica(req.nextUrl.searchParams.get("org"))
  if (!organizacaoId) return NextResponse.json({ empresa: null }, { status: 404 })
  const empresa = await prisma.configEmpresa.findFirst({ where: { organizacaoId } })
  return NextResponse.json({ empresa })
}

// POST /api/config/empresa — cria ou atualiza dados da empresa (admin/gestor)
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  // Permissão desta pessoa NESTA empresa (antes era uma linha global por usuário).
  const perm = await getPermissoes(session.user.id, organizacaoId)
  if (!perm?.gerenciarConfig && !ehGestor(session)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

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
