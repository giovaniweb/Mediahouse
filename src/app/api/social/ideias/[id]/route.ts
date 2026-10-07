import { NextRequest, NextResponse } from "next/server"
import { recusarUploads } from "@/lib/midia-limite"
import type { Prisma } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ideiaEditavel } from "@/lib/social"
import { anexosDaIdeia, diaDaPostagem, lerIdeiaSocial } from "@/lib/social-quadro"

type Params = { params: Promise<{ id: string }> }

// PATCH /api/social/ideias/[id] — "Salvar como ideia" de uma ideia que já existe.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const r = await ideiaEditavel(await auth(), id)
  if (r instanceof NextResponse) return r

  const body = await req.json().catch(() => ({}))
  const lido = lerIdeiaSocial(body, { dataAtual: diaDaPostagem(r.ideia.dataPostagem) })
  if (!lido.ok) return NextResponse.json({ error: lido.motivo }, { status: 400 })

  // O anexo só vale se for desta ideia, desta empresa (ver anexosDaIdeia).
  const formulario = lido.dados.formulario
    ? { ...lido.dados.formulario, anexosIdeia: anexosDaIdeia(lido.dados.formulario, r.escopo.organizacaoId, id) }
    : undefined
  // Anexo novo (que a ideia ainda não tinha) tem tamanho e tipo conferidos no
  // servidor (lib/midia-limite). Recusado = apagado e o salvar volta com o motivo.
  if (formulario?.anexosIdeia.length) {
    const antes = await prisma.ideiaVideo.findUnique({ where: { id }, select: { formulario: true } })
    const atuais = new Set(anexosDaIdeia(antes?.formulario, r.escopo.organizacaoId, id).map((a) => a.url))
    const recusa = await recusarUploads(formulario.anexosIdeia.filter((a) => !atuais.has(a.url)).map((a) => a.url))
    if (recusa) return NextResponse.json({ error: recusa.erro }, { status: recusa.status })
  }
  await prisma.ideiaVideo.update({
    where: { id },
    data: { ...lido.dados, formulario: formulario as Prisma.InputJsonValue | undefined },
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
