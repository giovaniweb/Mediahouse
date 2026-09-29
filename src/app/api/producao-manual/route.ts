import { recorteMetricas, RecorteInvalido } from "@/lib/metricas-recorte"
import { requireAcesso } from "@/lib/acesso"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { pertenceAOrg } from "@/lib/org"
import { lerInteiro } from "@/lib/numeros"

function compDe(d: Date): number {
  return d.getUTCFullYear() * 100 + (d.getUTCMonth() + 1)
}

function podeEditar(tipo?: string) {
  return tipo === "admin" || tipo === "gestor"
}

// GET /api/producao-manual?de=YYYY-MM-DD&ate=YYYY-MM-DD&area=audiovisual
// Retorna lançamentos no intervalo + total agregado por categoria.
export async function GET(req: NextRequest) {
  const acesso = await requireAcesso("verRelatorios")
  if (acesso instanceof NextResponse) return acesso
  const { organizacaoId } = acesso

  const sp = req.nextUrl.searchParams
  let recorte
  try { recorte = recorteMetricas(new URLSearchParams({ periodo: "ano", ...Object.fromEntries(sp) })) }
  catch (e) { if (e instanceof RecorteInvalido) return NextResponse.json({ error: e.message }, { status: 400 }); throw e }
  const area = recorte.area, de = new Date(recorte.de), ate = new Date(recorte.ate)

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
    fonte: "lancamento_mensal",
    recorte,
    totalCombinado: null,
    aviso: "Valores mensais; podem repetir entregas automáticas e não devem ser somados sem conciliação.",
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
  const acesso = await requireAcesso("verRelatorios")
  if (acesso instanceof NextResponse) return acesso
  if (!podeEditar(acesso.papel)) {
    return NextResponse.json({ error: "Apenas admin/gestor podem lançar produção manual" }, { status: 403 })
  }
  const { organizacaoId } = acesso

  const body = await req.json()
  const competencia = lerInteiro(body.competencia)
  const categoria = (body.categoria ?? "").trim()
  const quantidade = lerInteiro(body.quantidade) ?? 0
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
  const acesso = await requireAcesso("verRelatorios")
  if (acesso instanceof NextResponse) return acesso
  if (!podeEditar(acesso.papel)) {
    return NextResponse.json({ error: "Apenas admin/gestor" }, { status: 403 })
  }
  const { organizacaoId } = acesso
  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 })
  const reg = await prisma.producaoManual.findUnique({ where: { id }, select: { organizacaoId: true } })
  if (!pertenceAOrg(reg, organizacaoId)) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  await prisma.producaoManual.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
