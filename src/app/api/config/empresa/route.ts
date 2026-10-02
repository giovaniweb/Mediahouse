import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { ehGestor } from "@/lib/papel"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { getPermissoes, permissoesEfetivas } from "@/lib/permissoes-server"

// Dados que o videomaker precisa para emitir a nota contra a empresa: é o que o
// painel dele mostra. Nada aqui é credencial.
const CAMPOS_FISCAIS = {
  razaoSocial: true, nomeFantasia: true, cnpj: true,
  endereco: true, bairro: true, cidade: true, estado: true, cep: true,
  email: true, telefone: true, pixKey: true, pixTipo: true, observacoesNF: true,
} as const

// O que a tela de Configurações lê além disso. `googleRefreshToken` NUNCA entra
// numa resposta: nenhuma tela precisa dele, e quem o tem lê e apaga o Drive
// inteiro da conta conectada (escopo `drive`).
const CAMPOS_GESTAO = {
  ...CAMPOS_FISCAIS,
  id: true, catalogoMostrarFabricante: true,
  googleDriveEmail: true, googleDriveConnectedAt: true, googleDriveFolderId: true,
  createdAt: true, updatedAt: true,
} as const

// GET /api/config/empresa — dados da empresa ATIVA de quem pede.
//
// Até 02/10/2026 esta rota resolvia a empresa por `?org=` ou pela empresa
// pública padrão e devolvia a linha inteira, refresh token do Drive incluído.
// Como nenhum consumidor passava `?org=`, a tela de Configurações de QUALQUER
// empresa mostrava os dados da padrão — e qualquer conta logada lia o token
// dela. Os três consumidores (Configurações duas vezes e o painel do
// videomaker) são autenticados; o caminho público não tinha uso.
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  // Papel e permissão vêm do vínculo no banco, não da sessão (ver papel.ts).
  const vinculo = await permissoesEfetivas(session.user.id, organizacaoId)
  if (!vinculo) return NextResponse.json({ error: "Sem permissão" }, { status: 403 })

  const gestao = vinculo.papel === "admin" || vinculo.papel === "gestor" || vinculo.permissoes.gerenciarConfig
  if (!gestao) {
    const empresa = await prisma.configEmpresa.findFirst({ where: { organizacaoId }, select: CAMPOS_FISCAIS })
    return NextResponse.json({ empresa })
  }

  const linha = await prisma.configEmpresa.findFirst({
    where: { organizacaoId },
    select: { ...CAMPOS_GESTAO, googleRefreshToken: true },
  })
  if (!linha) return NextResponse.json({ empresa: null })
  const { googleRefreshToken, ...empresa } = linha
  return NextResponse.json({ empresa: { ...empresa, driveConectado: !!googleRefreshToken } })
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

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }

  const existing = await prisma.configEmpresa.findFirst({ where: { organizacaoId } })

  // Converte string vazia para null (campo não preenchido = sem dado, não string vazia)
  const v = (val: unknown) => (typeof val === "string" ? val.trim() || null : null)

  // Só grava o campo que veio no corpo. A aba do Drive manda apenas
  // `googleDriveFolderId`; antes, cada campo ausente virava null e salvar a pasta
  // apagava CNPJ, PIX e endereço da empresa — justamente o que o videomaker usa
  // para emitir a nota.
  const data: Record<string, string | null> = {}
  for (const campo of Object.keys(CAMPOS_FISCAIS)) {
    if (campo in body) data[campo] = v(body[campo])
  }
  if ("googleDriveFolderId" in body) {
    data.googleDriveFolderId = body.googleDriveFolderId || null
  }

  if (existing) {
    await prisma.configEmpresa.update({ where: { id: existing.id }, data })
  } else {
    await prisma.configEmpresa.create({ data: { ...data, organizacaoId } })
  }

  // A resposta tem o mesmo recorte do GET de gestão: sem o refresh token.
  const empresa = await prisma.configEmpresa.findFirst({ where: { organizacaoId }, select: CAMPOS_GESTAO })
  return NextResponse.json({ empresa })
}
