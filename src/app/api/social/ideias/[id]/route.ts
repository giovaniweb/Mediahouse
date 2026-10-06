import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import type { Session } from "next-auth"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { escopoSocial, podeEditarLinha, semLinha } from "@/lib/social"
import { diaDaPostagem, lerIdeiaSocial } from "@/lib/social-quadro"

type Params = { params: Promise<{ id: string }> }

// A ideia que ainda não virou pedido é dela para mudar. Depois do pedido, quem
// manda é a demanda — mexer na ideia mudaria o quadro sem mudar o que a equipe vê.
async function ideiaEditavel(session: Session | null, id: string) {
  const escopo = await escopoSocial(session)
  if (escopo instanceof NextResponse) return escopo
  const ideia = await prisma.ideiaVideo.findFirst({
    where: { id, organizacaoId: escopo.organizacaoId },
    select: { id: true, linhaProjetoId: true, demandaId: true, dataPostagem: true },
  })
  if (!ideia) return NextResponse.json({ error: "Ideia não encontrada" }, { status: 404 })
  if (!podeEditarLinha(escopo, ideia.linhaProjetoId)) return semLinha()
  if (ideia.demandaId) return NextResponse.json({ error: "Esta ideia já virou pedido." }, { status: 409 })
  return { escopo, ideia }
}

// PATCH /api/social/ideias/[id] — "Salvar como ideia" de uma ideia que já existe.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const r = await ideiaEditavel(await auth(), id)
  if (r instanceof NextResponse) return r

  const body = await req.json().catch(() => ({}))
  const lido = lerIdeiaSocial(body, { dataAtual: diaDaPostagem(r.ideia.dataPostagem) })
  if (!lido.ok) return NextResponse.json({ error: lido.motivo }, { status: 400 })

  await prisma.ideiaVideo.update({
    where: { id },
    data: { ...lido.dados, formulario: lido.dados.formulario as Prisma.InputJsonValue | undefined },
  })
  return NextResponse.json({ ok: true, id })
}

// DELETE /api/social/ideias/[id] — descarta. Igual ao /ideias: não apaga, marca
// "descartada", e ela some do quadro.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const r = await ideiaEditavel(await auth(), id)
  if (r instanceof NextResponse) return r
  await prisma.ideiaVideo.update({ where: { id }, data: { status: "descartada" } })
  return NextResponse.json({ ok: true })
}
