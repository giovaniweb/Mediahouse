import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

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

  const sp = req.nextUrl.searchParams
  const area = sp.get("area") === "design" ? "design" : "audiovisual"
  const de = sp.get("de") ? new Date(sp.get("de")!) : new Date(new Date().getFullYear(), 0, 1)
  const ate = sp.get("ate") ? new Date(sp.get("ate")!) : new Date()

  const lancamentos = await prisma.producaoManual.findMany({
    where: { area, competencia: { gte: compDe(de), lte: compDe(ate) } },
    orderBy: [{ competencia: "desc" }, { categoria: "asc" }],
  })

  // Agregado por categoria (soma no período)
  const porCategoria: Record<string, number> = {}
  for (const l of lancamentos) porCategoria[l.categoria] = (porCategoria[l.categoria] ?? 0) + l.quantidade
  const totalManual = Object.values(porCategoria).reduce((a, b) => a + b, 0)

  return NextResponse.json({ lancamentos, porCategoria, totalManual })
}

// POST /api/producao-manual — upsert { competencia, area, categoria, quantidade }
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  if (!podeEditar((session.user as { tipo?: string }).tipo)) {
    return NextResponse.json({ error: "Apenas admin/gestor podem lançar produção manual" }, { status: 403 })
  }

  const body = await req.json()
  const competencia = parseInt(body.competencia)
  const categoria = (body.categoria ?? "").trim()
  const quantidade = parseInt(body.quantidade) || 0
  const area = body.area === "design" ? "design" : "audiovisual"
  if (!competencia || !categoria) return NextResponse.json({ error: "competencia e categoria obrigatórios" }, { status: 400 })

  const item = await prisma.producaoManual.upsert({
    where: { competencia_area_categoria: { competencia, area, categoria } },
    create: { competencia, area, categoria, quantidade },
    update: { quantidade },
  })
  return NextResponse.json({ item })
}

// DELETE /api/producao-manual?id=
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  if (!podeEditar((session.user as { tipo?: string }).tipo)) {
    return NextResponse.json({ error: "Apenas admin/gestor" }, { status: 403 })
  }
  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 })
  await prisma.producaoManual.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
