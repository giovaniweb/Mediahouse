import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireDemandaOrg } from "@/lib/org"
import { comOrg } from "@/lib/org-contexto"
import { permissoesEfetivas } from "@/lib/permissoes-server"
import { avaliarTransferencia, podeTransferir, responderTransferencia, TransferenciaInvalida } from "@/lib/transferir-para-demandas"

// /api/jobs/[id]/transferir — Job criado por engano volta para o quadro de
// Demandas (audiovisual). A regra inteira mora em lib/transferir-para-demandas.

type Params = { params: Promise<{ id: string }> }

// GET — prévia para a tela: o que vai acontecer, ou o que impede. Não grava.
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const guard = await requireDemandaOrg(session, id)
  if (guard instanceof NextResponse) return guard
  const { organizacaoId } = guard

  const vinculo = await permissoesEfetivas(session.user.id, organizacaoId)
  if (!vinculo || !podeTransferir(vinculo.papel)) {
    return NextResponse.json({ error: "Só admin ou gestor pode transferir um Job para Demandas." }, { status: 403 })
  }
  try {
    const avaliacao = await comOrg(organizacaoId, () => prisma.$transaction((tx) => avaliarTransferencia(tx, organizacaoId, id)))
    return NextResponse.json(avaliacao, { headers: { "Cache-Control": "private, no-store" } })
  } catch (e) {
    if (e instanceof TransferenciaInvalida) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}

// POST { confirmar: true, tipoVideo? } — executa.
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  return responderTransferencia(session, id, body ?? {})
}
