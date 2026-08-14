import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { lerValorMonetario } from "@/lib/numeros"
import { erroDeCampo } from "@/lib/erros-api"

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

  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const custos = await prisma.custoVideomaker.findMany({
    where: {
      organizacaoId,
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

  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const body = await req.json()
  const { videomakerId, demandaId, tipo, valor, descricao, dataReferencia, dataVencimento, pago, dataPagamento, comprovante } = body

  if (!videomakerId) return erroDeCampo("videomakerId", "Selecione o videomaker.")
  if (!dataReferencia) return erroDeCampo("dataReferencia", "Informe a data de referência.")

  // `!valor` recusaria um custo de zero e deixaria passar texto não numérico
  // (que virava NaN no banco). A leitura separa "ausente" de "inválido".
  const valorLido = lerValorMonetario(valor)
  if (!valorLido.ok || valorLido.valor === null) {
    return erroDeCampo("valor", "Informe um valor numérico maior ou igual a zero.")
  }

  const custo = await prisma.custoVideomaker.create({
    data: {
      organizacaoId,
      videomakerId,
      demandaId: demandaId || null,
      tipo: tipo ?? "diaria",
      valor: valorLido.valor,
      descricao,
      dataReferencia: new Date(dataReferencia),
      dataVencimento: dataVencimento ? new Date(dataVencimento) : null,
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
