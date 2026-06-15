import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg, pertenceAOrg } from "@/lib/org"

function compDe(d: Date): number {
  return d.getUTCFullYear() * 100 + (d.getUTCMonth() + 1)
}

function podeEditar(tipo?: string) {
  return tipo === "admin" || tipo === "gestor"
}

// GET /api/producao-manual?de=YYYY-MM-DD&ate=YYYY-MM-DD&area=audiovisual
// Retorna lançamentos no intervalo + total agregado por categoria.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const sp = req.nextUrl.searchParams
  const area = sp.get("area") === "design" ? "design" : "audiovisual"
  const de = sp.get("de") ? new Date(sp.get("de")!) : new Date(new Date().getFullYear(), 0, 1)
  const ate = sp.get("ate") ? new Date(sp.get("ate")!) : new Date()

  const lancamentos = await prisma.producaoManual.findMany({
    where: { organizacaoId, area, competencia: { gte: compDe(de), lte: compDe(ate) } },
    orderBy: [{ competencia: "desc" }, { categoria: "asc" }],
  })

  // Agregado por categoria, separado por grupo (produção de vídeos x frentes presenciais)
  const producaoPorCategoria: Record<string, number> = {}
  const presencialPorCategoria: Record<string, number> = {}
  for (const l of lancamentos) {
    const alvo = l.grupo === "presencial" ? presencialPorCategoria : producaoPorCategoria
    alvo[l.categoria] = (alvo[l.categoria] ?? 0) + l.quantidade
  }
  const totalManual = Object.values(producaoPorCategoria).reduce((a, b) => a + b, 0)
  const totalPresencial = Object.values(presencialPorCategoria).reduce((a, b) => a + b, 0)

  return NextResponse.json({
    lancamentos,
    // compat + novos campos
    porCategoria: producaoPorCategoria,
    totalManual,
    producaoPorCategoria,
    presencialPorCategoria,
    totalPresencial,
  })
}

// POST /api/producao-manual — upsert { competencia, area, categoria, quantidade }
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  if (!podeEditar((session.user as { tipo?: string }).tipo)) {
    return NextResponse.json({ error: "Apenas admin/gestor podem lançar produção manual" }, { status: 403 })
  }
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const body = await req.json()
  const competencia = parseInt(body.competencia)
  const categoria = (body.categoria ?? "").trim()
  const quantidade = parseInt(body.quantidade) || 0
  const area = body.area === "design" ? "design" : "audiovisual"
  const grupo = body.grupo === "presencial" ? "presencial" : "producao"
  if (!competencia || !categoria) return NextResponse.json({ error: "competencia e categoria obrigatórios" }, { status: 400 })

  // Upsert por org (a unique composta do schema não inclui org ainda — fazemos manual p/ não colidir entre empresas)
  const existing = await prisma.producaoManual.findFirst({
    where: { organizacaoId, competencia, area, grupo, categoria },
    select: { id: true },
  })
  const item = existing
    ? await prisma.producaoManual.update({ where: { id: existing.id }, data: { quantidade } })
    : await prisma.producaoManual.create({ data: { organizacaoId, competencia, area, grupo, categoria, quantidade } })
  return NextResponse.json({ item })
}

// DELETE /api/producao-manual?id=
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  if (!podeEditar((session.user as { tipo?: string }).tipo)) {
    return NextResponse.json({ error: "Apenas admin/gestor" }, { status: 403 })
  }
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()
  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 })
  const reg = await prisma.producaoManual.findUnique({ where: { id }, select: { organizacaoId: true } })
  if (!pertenceAOrg(reg, organizacaoId)) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  await prisma.producaoManual.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
