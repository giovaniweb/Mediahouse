import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { autenticarCutflow } from "@/lib/cutflow"

type Params = { params: Promise<{ id: string }> }

// GET /api/cutflow/demandas/[id]/arquivos — o link do material bruto do card.
//
// Exige que ESTE computador tenha puxado o card: sem isso, qualquer sessão do
// plugin veria o link de qualquer card da empresa.
//
// O NuFlow não acessa mais o Google Drive (decisão de 03/10/2026): não lista a
// pasta nem entrega token. O editor baixa pelo link, com a própria conta Google
// — o mesmo caminho que o plugin já seguia para link que não é pasta do Drive.
export async function GET(req: NextRequest, { params }: Params) {
  const ctx = await autenticarCutflow(req)
  if (ctx instanceof NextResponse) return ctx
  const { organizacaoId } = ctx
  const { id } = await params

  const puxada = await prisma.cutflowPuxada.findUnique({ where: { demandaId: id, organizacaoId }, select: { sessaoId: true } })
  if (!puxada || puxada.sessaoId !== ctx.sessaoId) {
    return NextResponse.json({ error: "Puxe o card neste computador antes de baixar o material." }, { status: 409 })
  }
  const demanda = await prisma.demanda.findFirst({
    where: { id, organizacaoId },
    select: { linkFolderBrutos: true, linkBrutos: true },
  })
  if (!demanda) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

  const link = demanda.linkFolderBrutos ?? demanda.linkBrutos ?? null
  if (!link) return NextResponse.json({ arquivos: [], aviso: "O card não tem link de material bruto." })
  return NextResponse.json({ arquivos: [], manual: true, link, aviso: "Baixe o material bruto pelo link, com a sua conta Google." })
}
