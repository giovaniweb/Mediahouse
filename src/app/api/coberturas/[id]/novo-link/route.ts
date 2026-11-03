import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireCoberturaOrg } from "@/lib/org"
import { novaValidade } from "@/lib/links-publicos"

type Params = { params: Promise<{ id: string }> }

// POST /api/coberturas/[id]/novo-link — troca o endereço da página pública da
// cobertura (/e/<slug>). O antigo para de abrir na hora; o novo vale 180 dias.
// O endereço continua legível (o nome do evento) e ganha um final aleatório,
// que é o que impede adivinhar o endereço de outro evento.
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const { id } = await params
  const guard = await requireCoberturaOrg(session, id)
  if (guard instanceof NextResponse) return guard

  const atual = await prisma.eventoCobertura.findUnique({ where: { id }, select: { slug: true } })
  if (!atual) return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 })
  const base = atual.slug.replace(/-[a-z0-9]{6,}$/, "").slice(0, 60) || "evento"
  const cobertura = await prisma.eventoCobertura.update({
    where: { id },
    data: { slug: `${base}-${randomBytes(6).toString("hex")}`, linkPublicoExpiraEm: novaValidade("cobertura") },
    select: { slug: true, linkPublicoExpiraEm: true },
  })
  return NextResponse.json(cobertura)
}
