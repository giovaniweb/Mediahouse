import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { getOrgId, semOrg } from "@/lib/org"
import { ehGestor } from "@/lib/papel"
import { veNotaDoVideomaker } from "@/lib/permissoes-server"
import { PagamentoInvalido } from "@/lib/pagamentos"
import { agirNaNota } from "@/lib/nota-da-gravacao"

type Params = { params: Promise<{ id: string }> }

// A nota do videomaker na ficha da gravação e na página Notas fiscais: marcar
// como cadastrada para pagamento e como paga (12/11/2026; "enviar_compras" e
// "marcar_enviada" ainda são aceitos e valem "cadastrada").
// Quem age é quem vê a nota: gestão, quem vê custos ou quem aprova pagamentos.
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()
  if (!(await veNotaDoVideomaker(session.user.id, organizacaoId, ehGestor(session)))) {
    return NextResponse.json({ error: "Sem permissão para a nota do videomaker." }, { status: 403 })
  }
  const corpo = z.object({ acao: z.enum(["enviar_compras", "marcar_enviada", "marcar_cadastrada", "marcar_paga"]) }).safeParse(await req.json().catch(() => null))
  if (!corpo.success) return NextResponse.json({ error: "Ação inválida." }, { status: 400 })

  const { id } = await params
  try {
    return NextResponse.json(await agirNaNota({ organizacaoId, usuarioId: session.user.id }, id, corpo.data.acao))
  } catch (e) {
    if (e instanceof PagamentoInvalido) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}
