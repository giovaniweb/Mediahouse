import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { autenticarCutflow, editorCutflow, FORA_DA_FILA } from "@/lib/cutflow"
import { EVENTO_CUTFLOW_PUXADO } from "@/lib/status"

type Params = { params: Promise<{ id: string }> }

// POST /api/cutflow/fila/[id]/puxar — este computador assume o card.
//
// A trava é a linha em cutflow_puxadas (`demandaId` único no banco): dois
// computadores puxando ao mesmo tempo, um entra e o outro recebe 409 com o nome
// de quem está editando. Puxar de novo do mesmo computador devolve o que já
// existe (o plugin pode repetir depois de cair a rede).
//
// O status do card NÃO muda aqui: a passagem para `editando` segue a guarda de
// transição normal (próxima etapa do Cutflow). O que fica é o fato, no
// histórico, com a hora em que a edição começou.
export async function POST(req: NextRequest, { params }: Params) {
  const ctx = await autenticarCutflow(req)
  if (ctx instanceof NextResponse) return ctx
  const { organizacaoId } = ctx
  const { id } = await params

  const editor = await editorCutflow(organizacaoId)
  if ("erro" in editor) return NextResponse.json({ error: editor.erro }, { status: 409 })

  const demanda = await prisma.demanda.findFirst({
    where: { id, organizacaoId, editorId: editor.id, statusInterno: { notIn: [...FORA_DA_FILA] } },
    select: { id: true, codigo: true, statusInterno: true },
  })
  if (!demanda) return NextResponse.json({ error: "Este card não está na fila do Cutflow." }, { status: 404 })

  const ocupada = async () => {
    const p = await prisma.cutflowPuxada.findUnique({
      where: { demandaId: id, organizacaoId },
      select: { usuarioId: true, sessaoId: true, puxadaEm: true },
    })
    if (!p) return null
    if (p.sessaoId === ctx.sessaoId) return NextResponse.json({ puxada: true, jaEra: true, desde: p.puxadaEm })
    const quem = await prisma.usuario.findUnique({ where: { id: p.usuarioId }, select: { nome: true } })
    const por = p.usuarioId === ctx.usuarioId ? "você, em outro computador" : quem?.nome ?? "outra pessoa"
    return NextResponse.json({ error: `Em edição por ${por}.`, emEdicaoPor: por, desde: p.puxadaEm }, { status: 409 })
  }

  const antes = await ocupada()
  if (antes) return antes
  try {
    await prisma.cutflowPuxada.create({
      data: { organizacaoId, demandaId: id, usuarioId: ctx.usuarioId, sessaoId: ctx.sessaoId },
    })
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") return (await ocupada()) ?? NextResponse.json({ error: "Tente de novo." }, { status: 409 })
    throw e
  }

  const quem = await prisma.usuario.findUnique({ where: { id: ctx.usuarioId }, select: { nome: true } })
  await prisma.historicoStatus.create({
    data: {
      demandaId: id,
      statusAnterior: demanda.statusInterno,
      statusNovo: EVENTO_CUTFLOW_PUXADO,
      usuarioId: ctx.usuarioId,
      origem: "automacao",
      observacao: `Edição iniciada no Cutflow por ${quem?.nome ?? "alguém"}${ctx.nomeComputador ? ` (${ctx.nomeComputador})` : ""}`,
    },
  })
  return NextResponse.json({ puxada: true, jaEra: false, codigo: demanda.codigo })
}
