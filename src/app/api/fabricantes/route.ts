import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, orgPublica } from "@/lib/org"

/**
 * Organização desta requisição.
 *
 * A rota está na lista de caminhos públicos porque o formulário de demanda
 * (aberto, sem conta) monta o seletor de fabricante com ela. Então há dois
 * caminhos: com sessão, a empresa ativa; sem sessão, o `?org=` do formulário.
 */
async function orgDaRequisicao(req: NextRequest): Promise<string | null> {
  const session = await auth().catch(() => null)
  if (session?.user) return getOrgId(session)
  return orgPublica(req.nextUrl.searchParams.get("org"))
}

// GET — fabricantes DESTA empresa.
//
// Listava todos, de todas as empresas: os 7 da Contourline apareciam no
// formulário de qualquer outro cliente da plataforma.
export async function GET(req: NextRequest) {
  const organizacaoId = await orgDaRequisicao(req)
  if (!organizacaoId) return NextResponse.json([])

  const fabricantes = await prisma.fabricante.findMany({
    where: { ativo: true, organizacaoId },
    orderBy: { nome: "asc" },
    include: { _count: { select: { produtos: true } } },
  })
  return NextResponse.json(fabricantes)
}

// POST — cria fabricante na empresa de quem está logado.
//
// Exigia NADA: sem sessão, sem organização. Qualquer pessoa na internet podia
// criar fabricante — e, como a tabela era global, ele aparecia para todos.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return NextResponse.json({ error: "Organização não encontrada na sessão" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const nome = (body.nome as string | undefined)?.trim()
  if (!nome) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 })

  const fab = await prisma.fabricante.upsert({
    where: { organizacaoId_nome: { organizacaoId, nome } },
    update: { ativo: true },
    create: { nome, organizacaoId },
  })
  return NextResponse.json(fab)
}
