import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { acessoAoKit } from "@/lib/kit-videomaker-server"

type Params = { params: Promise<{ id: string }> }

// PUT /api/gravacoes/kit/[id] — título e texto (a colinha se ajusta com o tempo).
export async function PUT(req: NextRequest, { params }: Params) {
  const acesso = await acessoAoKit(true)
  if (acesso instanceof NextResponse) return acesso
  const { id } = await params
  const e = z.object({ titulo: z.string().trim().min(2).max(120).optional(), texto: z.string().trim().min(1).max(4000).optional() }).strict()
    .safeParse(await req.json().catch(() => null))
  if (!e.success) return NextResponse.json({ error: "Confira o título e o texto." }, { status: 400 })
  const r = await comOrg(acesso.organizacaoId, () => prisma.materialVideomaker.updateMany({ where: { id, organizacaoId: acesso.organizacaoId }, data: e.data }))
  if (!r.count) return NextResponse.json({ error: "Material não encontrado." }, { status: 404 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/gravacoes/kit/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const acesso = await acessoAoKit(true)
  if (acesso instanceof NextResponse) return acesso
  const { id } = await params
  const r = await comOrg(acesso.organizacaoId, () => prisma.materialVideomaker.deleteMany({ where: { id, organizacaoId: acesso.organizacaoId } }))
  if (!r.count) return NextResponse.json({ error: "Material não encontrado." }, { status: 404 })
  return NextResponse.json({ ok: true })
}
