import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrgId, semOrg } from "@/lib/org"
import { prisma } from "@/lib/prisma"
import { moduloAtivo } from "@/lib/modulos-org"
import { permissoesEfetivas } from "@/lib/permissoes-server"
import { podePermissao } from "@/lib/permissoes"
import { lerPedido, VALIDADE_BUSCA_MS } from "@/lib/cutflow"

// POST /api/cutflow/autorizar — passo 2: a pessoa, logada no navegador, autoriza
// o computador do pedido. A sessão NÃO é devolvida aqui: ela vai para o plugin,
// que prova ter o segredo do computador (POST /api/cutflow/sessao).
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const body = await req.json().catch(() => null)
  const pedido = lerPedido(body?.pedido)
  if (!pedido) {
    return NextResponse.json({ error: "Este pedido de conexão venceu ou não é válido. Peça um novo no Cutflow." }, { status: 400 })
  }

  if (!(await moduloAtivo(organizacaoId, "cutflow"))) {
    return NextResponse.json({ error: "O Cutflow não está liberado para esta empresa." }, { status: 403 })
  }
  const vinculo = await permissoesEfetivas(session.user.id, organizacaoId)
  if (!vinculo || !podePermissao(vinculo.permissoes, "usarCutflow")) {
    return NextResponse.json({ error: "Sua conta não tem permissão para usar o Cutflow." }, { status: 403 })
  }

  try {
    await prisma.cutflowSessao.create({
      data: {
        organizacaoId,
        usuarioId: session.user.id,
        dispositivoHash: pedido.dispositivoHash,
        nomeComputador: pedido.nomeComputador || null,
        expiraEm: new Date(Date.now() + VALIDADE_BUSCA_MS),
      },
    })
  } catch (e) {
    // dispositivoHash é único: o mesmo pedido autorizado duas vezes.
    if ((e as { code?: string })?.code === "P2002") {
      return NextResponse.json({ error: "Este computador já foi autorizado. Volte ao Cutflow." }, { status: 409 })
    }
    throw e
  }
  return NextResponse.json({ autorizado: true })
}
