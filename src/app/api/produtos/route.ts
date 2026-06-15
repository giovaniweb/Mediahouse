import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const { searchParams } = new URL(req.url)
  const includeInactive = searchParams.get("all") === "true"

  const [produtos, ultimasFinalizacoes] = await Promise.all([
    prisma.produto.findMany({
      where: { organizacaoId, ...(includeInactive ? {} : { ativo: true }) },
      include: {
        fabricante: { select: { id: true, nome: true } },
        _count: { select: { demandas: true } },
      },
      orderBy: { peso: "desc" },
    }),
    // Última demanda FINALIZADA por produto — inclui demandas antigas sem finalizadaEm
    // (usa finalizadaEm se disponível, senão updatedAt como proxy)
    prisma.demandaProduto.findMany({
      where: { demanda: { statusVisivel: "finalizado", organizacaoId } },
      select: {
        produtoId: true,
        demanda: { select: { finalizadaEm: true, updatedAt: true } },
      },
      orderBy: { demanda: { updatedAt: "desc" } },
    }),
  ])

  // Mapa produtoId → data mais recente de finalização real
  // Prioriza finalizadaEm (preciso), usa updatedAt como fallback (demandas antigas)
  const ultimaFinalizacaoMap = new Map<string, Date>()
  for (const r of ultimasFinalizacoes) {
    if (!ultimaFinalizacaoMap.has(r.produtoId) && r.demanda) {
      const dataRef = r.demanda.finalizadaEm ?? r.demanda.updatedAt
      ultimaFinalizacaoMap.set(r.produtoId, dataRef)
    }
  }

  const now = new Date()

  const produtosComputados = produtos.map((p) => {
    // Prioridade: última finalização real > ultimoConteudo (campo manual) > data de criação
    const refDate = ultimaFinalizacaoMap.get(p.id) ?? p.ultimoConteudo ?? p.createdAt
    const diasSemConteudo = Math.floor(
      (now.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24)
    )
    const emAlerta = diasSemConteudo > p.alertaDias
    const score = p.peso * (diasSemConteudo / Math.max(p.alertaDias, 1))

    return {
      ...p,
      diasSemConteudo,
      emAlerta,
      score,
      ultimaFinalizacaoReal: ultimaFinalizacaoMap.get(p.id)?.toISOString() ?? null,
    }
  })

  // Sort by priority score DESC (most urgently needs content first)
  produtosComputados.sort((a, b) => b.score - a.score)

  // B2C/B2B counts across all demandas (da organização)
  const classificacaoCounts = await prisma.demanda.groupBy({
    by: ["classificacao"],
    where: { organizacaoId },
    _count: { id: true },
  })

  const b2cTotal = classificacaoCounts.find((c) => c.classificacao === "b2c")?._count.id ?? 0
  const b2bTotal = classificacaoCounts.find((c) => c.classificacao === "b2b")?._count.id ?? 0
  const semClassificacao = classificacaoCounts.find((c) => c.classificacao === null)?._count.id ?? 0

  return NextResponse.json({
    produtos: produtosComputados,
    classificacao: { b2c: b2cTotal, b2b: b2bTotal, sem_classificacao: semClassificacao },
  })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const body = await req.json()

  if (!body.nome || !body.nome.trim()) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 })
  }

  const produto = await prisma.produto.create({
    data: {
      organizacaoId,
      nome: body.nome.trim(),
      descricao: body.descricao?.trim() || null,
      categoria: body.categoria?.trim() || null,
      fabricanteId: body.fabricanteId || null,
      peso: body.peso ? parseFloat(body.peso) : 1.0,
      alertaDias: body.alertaDias ? parseInt(body.alertaDias) : 30,
    },
  })

  return NextResponse.json(produto, { status: 201 })
}
