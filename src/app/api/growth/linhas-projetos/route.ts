import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"

// Normaliza nome p/ comparação de duplicado (trim + colapsa espaços + caixa + sem acentos).
// Assim "Médica", "Medica" e "  medica " são tratados como a mesma linha.
function normalizar(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
}

// GET /api/growth/linhas-projetos — linhas/projetos da org logada (ordenado por nome).
// Por padrão só ATIVOS (usado pelo select do modal). ?incluirInativas=1 traz todos
// (usado pela tela de gestão em Configurações).
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const incluirInativas = req.nextUrl.searchParams.get("incluirInativas") === "1"
  const linhas = await prisma.linhaProjeto.findMany({
    where: { organizacaoId, ...(incluirInativas ? {} : { ativo: true }) },
    select: { id: true, nome: true, descricao: true, ativo: true },
    orderBy: { nome: "asc" },
  })
  return NextResponse.json({ linhas })
}

// POST /api/growth/linhas-projetos — cria linha/projeto na org logada.
// body: { nome, descricao? }. Impede duplicado (por variação de espaços/caixa) na mesma org.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const body = await req.json().catch(() => ({}))
  const nome = (body.nome as string | undefined)?.trim().replace(/\s+/g, " ")
  if (!nome) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 })

  // Duplicado por variação simples (caixa/espaços) dentro da mesma org
  const existentes = await prisma.linhaProjeto.findMany({
    where: { organizacaoId },
    select: { id: true, nome: true, ativo: true },
  })
  const dup = existentes.find((l) => normalizar(l.nome) === normalizar(nome))
  if (dup) {
    // Se existir mas inativa, reativa em vez de duplicar
    if (!dup.ativo) {
      const reativada = await prisma.linhaProjeto.update({
        where: { id: dup.id },
        data: { ativo: true, ...(body.descricao !== undefined ? { descricao: body.descricao?.trim() || null } : {}) },
        select: { id: true, nome: true, descricao: true, ativo: true },
      })
      return NextResponse.json({ linha: reativada }, { status: 200 })
    }
    return NextResponse.json({ error: "Já existe uma linha/projeto com esse nome" }, { status: 409 })
  }

  const linha = await prisma.linhaProjeto.create({
    data: { organizacaoId, nome, descricao: (body.descricao as string | undefined)?.trim() || null },
    select: { id: true, nome: true, descricao: true, ativo: true },
  })
  return NextResponse.json({ linha }, { status: 201 })
}
