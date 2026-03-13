import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/custos-videomaker — listar custos com filtros opcionais
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const videomakerId = searchParams.get("videomakerId")
  const demandaId = searchParams.get("demandaId")
  const pago = searchParams.get("pago")
  const de = searchParams.get("de")
  const ate = searchParams.get("ate")

  const custos = await prisma.custoVideomaker.findMany({
    where: {
      ...(videomakerId && { videomakerId }),
      ...(demandaId && { demandaId }),
      ...(pago !== null && pago !== undefined && { pago: pago === "true" }),
      ...(de && { dataReferencia: { gte: new Date(de) } }),
      ...(ate && { dataReferencia: { lte: new Date(ate) } }),
    },
    include: {
      videomaker: { select: { id: true, nome: true, cidade: true, valorDiaria: true } },
      demanda: { select: { id: true, codigo: true, titulo: true, tipoVideo: true } },
    },
    orderBy: { dataReferencia: "desc" },
  })

  // Calcular totais
  const totalGasto = custos.reduce((sum, c) => sum + c.valor, 0)
  const totalPago = custos.filter((c) => c.pago).reduce((sum, c) => sum + c.valor, 0)
  const totalPendente = custos.filter((c) => !c.pago).reduce((sum, c) => sum + c.valor, 0)

  // Agrupar por videomaker
  const porVideomaker: Record<string, { nome: string; total: number; count: number }> = {}
  for (const c of custos) {
    const vid = c.videomaker
    if (!porVideomaker[vid.id]) {
      porVideomaker[vid.id] = { nome: vid.nome, total: 0, count: 0 }
    }
    porVideomaker[vid.id].total += c.valor
    porVideomaker[vid.id].count += 1
  }

  return NextResponse.json({
    custos,
    resumo: { totalGasto, totalPago, totalPendente },
    porVideomaker: Object.entries(porVideomaker)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.total - a.total),
  })
}

// POST /api/custos-videomaker — registrar novo custo
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const body = await req.json()
  const { videomakerId, demandaId, tipo, valor, descricao, dataReferencia, pago, dataPagamento, comprovante } = body

  if (!videomakerId || !valor || !dataReferencia) {
    return NextResponse.json({ error: "videomakerId, valor e dataReferencia são obrigatórios" }, { status: 400 })
  }

  const custo = await prisma.custoVideomaker.create({
    data: {
      videomakerId,
      demandaId: demandaId || null,
      tipo: tipo ?? "diaria",
      valor: parseFloat(valor),
      descricao,
      dataReferencia: new Date(dataReferencia),
      pago: pago ?? false,
      dataPagamento: dataPagamento ? new Date(dataPagamento) : null,
      comprovante,
    },
    include: {
      videomaker: { select: { id: true, nome: true } },
      demanda: { select: { id: true, codigo: true, titulo: true } },
    },
  })

  return NextResponse.json({ custo }, { status: 201 })
}
