import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import type { AreaAtuacao } from "@prisma/client"

// Rótulo amigável da função profissional (fallback ao tipo legado do usuário).
const LABEL_FUNCAO: Record<string, string> = {
  social: "Social Media", designer: "Designer", analista_crm: "Analista CRM",
  gestor_trafego: "Gestor de Tráfego", gestor: "Gestor", admin: "Admin",
  operacao: "Operação", auxiliar_admin: "Auxiliar Administrativo",
  videomaker: "Videomaker", editor: "Editor", fotografo: "Fotógrafo",
  copywriter: "Copywriter", produtor: "Produtor", coordenador: "Coordenador",
  atendimento: "Atendimento",
}

function rotularFuncao(funcao: string | null, tipoLegado: string): string {
  const key = funcao ?? tipoLegado
  return LABEL_FUNCAO[key] ?? key
}

// GET /api/growth/responsaveis?area=growth|audiovisual
// Equipe INTERNA ativa da org logada, filtrada pela ÁREA de atuação (Pessoas &
// Acessos). Serve os dois kanbans — o audiovisual passou a ter filtro por
// responsável e reusa esta rota em vez de ganhar uma cópia. Padrão: growth.
// Exclui solicitantes, externos, inativos e usuários de outra org.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const area: AreaAtuacao = req.nextUrl.searchParams.get("area") === "audiovisual" ? "audiovisual" : "growth"

  const membros = await prisma.usuarioOrganizacao.findMany({
    where: {
      organizacaoId,
      categoria: "interna",
      areas: { has: area },
      usuario: { status: "ativo" },
    },
    select: {
      funcaoProfissional: true,
      usuario: { select: { id: true, nome: true, email: true, tipo: true } },
    },
    orderBy: { usuario: { nome: "asc" } },
  })

  const responsaveis = membros.map((m) => {
    const tipoLabel = rotularFuncao(m.funcaoProfissional, m.usuario.tipo)
    return { id: m.usuario.id, nome: m.usuario.nome, email: m.usuario.email, tipo: tipoLabel, label: `${m.usuario.nome} · ${tipoLabel}` }
  })

  return NextResponse.json({ responsaveis })
}
