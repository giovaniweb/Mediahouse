import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import type { TipoUsuario } from "@prisma/client"

// Funções internas que podem ser responsáveis por conteúdos de Growth.
// Exclui videomaker/editor (audiovisual) e solicitante/gestor_eventos.
const TIPOS_GROWTH: TipoUsuario[] = [
  "designer", "social", "gestor", "admin", "operacao", "analista_crm", "gestor_trafego", "auxiliar_admin",
]

const LABEL_TIPO: Partial<Record<TipoUsuario, string>> = {
  designer: "Designer",
  social: "Social Media",
  gestor: "Gestor",
  admin: "Admin",
  operacao: "Operação",
  analista_crm: "Analista CRM",
  gestor_trafego: "Gestor de Tráfego",
  auxiliar_admin: "Auxiliar Administrativo",
}

// GET /api/growth/responsaveis — usuários internos da organização logada elegíveis
// como responsáveis por conteúdos de Growth. Isolado por organizacaoId (membership),
// sem videomakers externos, sem usuários de outra empresa, sem fallback Contourline.
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const usuarios = await prisma.usuario.findMany({
    where: {
      status: "ativo",
      tipo: { in: TIPOS_GROWTH },
      // Somente membros da organização logada (isolamento multiempresa)
      organizacoes: { some: { organizacaoId } },
    },
    select: { id: true, nome: true, email: true, tipo: true },
    orderBy: [{ tipo: "asc" }, { nome: "asc" }],
  })

  const responsaveis = usuarios.map((u) => {
    const labelTipo = LABEL_TIPO[u.tipo] ?? u.tipo
    return { id: u.id, nome: u.nome, email: u.email, tipo: labelTipo, label: `${u.nome} · ${labelTipo}` }
  })

  return NextResponse.json({ responsaveis })
}
