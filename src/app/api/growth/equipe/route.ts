import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"

const LABEL_FUNCAO: Record<string, string> = {
  social: "Social Media", designer: "Designer", analista_crm: "Analista CRM",
  gestor_trafego: "Gestor de Tráfego", gestor: "Gestor", admin: "Admin",
  operacao: "Operação", auxiliar_admin: "Auxiliar Administrativo",
  videomaker: "Videomaker", editor: "Editor", fotografo: "Fotógrafo",
  copywriter: "Copywriter", produtor: "Produtor", coordenador: "Coordenador",
  atendimento: "Atendimento",
}

// GET /api/growth/equipe — equipe Growth = pessoas INTERNAS ativas da org logada com
// área de atuação = growth. NÃO lista solicitantes, externos, inativos, sistema/teste
// nem usuários de outra organização. Não depende do model legado Designer.
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const membros = await prisma.usuarioOrganizacao.findMany({
    where: {
      organizacaoId,
      categoria: "interna",
      areas: { has: "growth" },
      usuario: { status: "ativo" },
    },
    select: {
      papel: true, funcaoProfissional: true, areas: true,
      usuario: { select: { id: true, nome: true, email: true, telefone: true, tipo: true } },
    },
    orderBy: { usuario: { nome: "asc" } },
  })

  const equipe = membros.map((m) => ({
    id: m.usuario.id,
    nome: m.usuario.nome,
    email: m.usuario.email,
    telefone: m.usuario.telefone,
    papel: m.papel,
    funcao: m.funcaoProfissional ? (LABEL_FUNCAO[m.funcaoProfissional] ?? m.funcaoProfissional) : (LABEL_FUNCAO[m.usuario.tipo] ?? m.usuario.tipo),
    areas: m.areas,
  }))

  return NextResponse.json({ equipe })
}
