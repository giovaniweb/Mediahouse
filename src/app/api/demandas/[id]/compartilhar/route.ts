import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireDemandaOrg } from "@/lib/org"

type Params = { params: Promise<{ id: string }> }

// Só quem pode editar a demanda pode expor ou revogar o link público dela.
async function podeCompartilhar(usuarioId: string, tipo: string): Promise<boolean> {
  if (["admin", "gestor"].includes(tipo)) return true
  const perm = await prisma.permissaoUsuario.findUnique({
    where: { usuarioId },
    select: { editarDemanda: true },
  })
  return !!perm?.editarDemanda
}

function montarLink(token: string): string {
  const base = (process.env.NEXTAUTH_URL ?? "http://localhost:3000").trim().replace(/\/$/, "")
  return `${base}/d/${token}`
}

// POST /api/demandas/[id]/compartilhar — gera o link (ou rotaciona com ?rotacionar=1).
// Rotacionar invalida o link já enviado: é como se revoga o acesso de quem recebeu.
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const guard = await requireDemandaOrg(session, id)
  if (guard instanceof NextResponse) return guard

  if (!(await podeCompartilhar(session.user.id, session.user.tipo))) {
    return NextResponse.json({ error: "Sem permissão para compartilhar" }, { status: 403 })
  }

  const rotacionar = req.nextUrl.searchParams.get("rotacionar") === "1"
  const atual = await prisma.demanda.findUnique({
    where: { id },
    select: { publicToken: true, codigo: true },
  })

  const token = !atual?.publicToken || rotacionar ? randomBytes(18).toString("base64url") : atual.publicToken

  await prisma.demanda.update({
    where: { id },
    data: { publicToken: token, publicTokenAtivo: true },
  })

  await prisma.logAutomacao.create({
    data: {
      demandaId: id,
      automacao: rotacionar ? "link_publico_rotacionado" : "link_publico_gerado",
      status: "sucesso",
      outputJson: { por: session.user.id, codigo: atual?.codigo },
    },
  }).catch(() => null)

  return NextResponse.json({ ok: true, link: montarLink(token), ativo: true })
}

// DELETE /api/demandas/[id]/compartilhar — revoga o link (mantém o token para
// que um novo "Compartilhar" possa reativar o mesmo endereço, se for o caso).
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const guard = await requireDemandaOrg(session, id)
  if (guard instanceof NextResponse) return guard

  if (!(await podeCompartilhar(session.user.id, session.user.tipo))) {
    return NextResponse.json({ error: "Sem permissão para revogar" }, { status: 403 })
  }

  const dem = await prisma.demanda.update({
    where: { id },
    data: { publicTokenAtivo: false },
    select: { codigo: true },
  })

  await prisma.logAutomacao.create({
    data: {
      demandaId: id,
      automacao: "link_publico_revogado",
      status: "sucesso",
      outputJson: { por: session.user.id, codigo: dem.codigo },
    },
  }).catch(() => null)

  return NextResponse.json({ ok: true, ativo: false })
}
