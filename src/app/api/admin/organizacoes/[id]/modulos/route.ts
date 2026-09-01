import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
// Painel de Super Admin: lista TODAS as empresas, por definição. Atravessa o
// isolamento pela conexão de dono, atrás de `requireSuperAdmin`.
// Ver src/lib/prisma-admin.ts.
import { prismaAdmin as prisma } from "@/lib/prisma-admin"
import { requireSuperAdmin } from "@/lib/org"
import { MODULOS, DISPONIVEL_NA_PLATAFORMA, PADRAO_MODULOS, type Modulo } from "@/lib/modulos"
import { modulosDaOrganizacao } from "@/lib/modulos-org"

type Params = { params: Promise<{ id: string }> }
const CHAVES = MODULOS.map((m) => m.chave)

// GET — módulos desta empresa, com o catálogo e a origem de cada estado.
//
// `origem` importa na tela: "padrão" e "escolhido" parecem iguais no toggle mas
// significam coisas diferentes — o padrão muda se mudarmos o produto, o
// escolhido não.
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const guard = await requireSuperAdmin(session)
  if (guard instanceof NextResponse) return guard

  const { id } = await params
  const [efetivos, explicitos] = await Promise.all([
    modulosDaOrganizacao(id),
    prisma.moduloOrganizacao.findMany({ where: { organizacaoId: id }, select: { modulo: true, ativo: true } }),
  ])
  const escolhidos = new Map(explicitos.map((e) => [e.modulo, e.ativo]))

  return NextResponse.json({
    modulos: MODULOS.map((m) => ({
      ...m,
      ativo: efetivos[m.chave],
      disponivelNaPlataforma: DISPONIVEL_NA_PLATAFORMA[m.chave],
      padrao: PADRAO_MODULOS[m.chave],
      origem: escolhidos.has(m.chave) ? "escolhido" : "padrao",
    })),
  })
}

// PATCH — liga ou desliga um módulo para esta empresa.
// body: { modulo, ativo }
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  const guard = await requireSuperAdmin(session)
  if (guard instanceof NextResponse) return guard

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const modulo = body.modulo as Modulo
  const ativo = body.ativo

  if (!CHAVES.includes(modulo)) {
    return NextResponse.json({ error: `Módulo inválido. Use: ${CHAVES.join(", ")}` }, { status: 400 })
  }
  if (typeof ativo !== "boolean") {
    return NextResponse.json({ error: "`ativo` deve ser booleano" }, { status: 400 })
  }
  // Ligar o que não existe como produto criaria uma promessa que a plataforma
  // não cumpre: a linha ficaria `ativo: true` e o módulo seguiria escondido,
  // porque a chave geral vence. Melhor recusar do que gravar mentira.
  if (ativo && !DISPONIVEL_NA_PLATAFORMA[modulo]) {
    return NextResponse.json(
      { error: `"${modulo}" ainda não está disponível na plataforma — não dá para vender a nenhum cliente.` },
      { status: 409 }
    )
  }

  const org = await prisma.organizacao.findUnique({ where: { id }, select: { id: true } })
  if (!org) return NextResponse.json({ error: "Organização não encontrada" }, { status: 404 })

  await prisma.moduloOrganizacao.upsert({
    where: { organizacaoId_modulo: { organizacaoId: id, modulo } },
    update: { ativo },
    create: { organizacaoId: id, modulo, ativo },
  })

  return NextResponse.json({ modulos: await modulosDaOrganizacao(id) })
}
