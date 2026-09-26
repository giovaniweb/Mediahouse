import { requireAcesso } from "@/lib/acesso"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { diariasDaEmpresa, fiscaisDaEmpresaEmLote } from "@/lib/videomaker-vinculo"
import { lerValorMonetario } from "@/lib/numeros"
import { erroDeCampo } from "@/lib/erros-api"

// GET /api/custos-videomaker — listar custos com filtros opcionais
export async function GET(req: NextRequest) {
  const acesso = await requireAcesso("verCustos")
  if (acesso instanceof NextResponse) return acesso

  const { searchParams } = new URL(req.url)
  const videomakerId = searchParams.get("videomakerId")
  const demandaId = searchParams.get("demandaId")
  const pago = searchParams.get("pago")
  const de = searchParams.get("de")
  const ate = searchParams.get("ate")

  const { organizacaoId } = acesso

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
      videomaker: { select: { id: true, nome: true, cidade: true } },
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

  // Diária e fiscais vêm das tabelas por empresa, em UMA consulta cada — a lista
  // tem dezenas de linhas e uma consulta por linha viraria N+1 justamente na tela
  // mais pesada. A forma do JSON é preservada (`custo.videomaker.chavePix`,
  // `.cpfCnpj`, `.valorDiaria`) para Custos e Aprovações não mudarem junto.
  const ids = custos.map((c) => c.videomakerId)
  const [diarias, fiscais] = await Promise.all([
    diariasDaEmpresa(ids, organizacaoId),
    fiscaisDaEmpresaEmLote(ids, organizacaoId),
  ])

  return NextResponse.json({
    custos: custos.map((c) => {
      const f = fiscais.get(c.videomakerId)
      return {
        ...c,
        videomaker: {
          ...c.videomaker,
          valorDiaria: diarias.get(c.videomakerId) ?? null,
          cpfCnpj: f?.cpfCnpj ?? null,
          chavePix: f?.chavePix ?? null,
        },
      }
    }),
    resumo: { totalGasto, totalPago, totalPendente },
    porVideomaker: Object.entries(porVideomaker)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.total - a.total),
  })
}

// POST /api/custos-videomaker — registrar novo custo
export async function POST(req: NextRequest) {
  const acesso = await requireAcesso("verCustos")
  if (acesso instanceof NextResponse) return acesso
  if (!["admin", "gestor"].includes(acesso.papel)) return NextResponse.json({ error: "Sem permissão para alterar custos" }, { status: 403 })

  const { organizacaoId } = acesso

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

  const vinculo = await prisma.videomakerOrganizacao.findUnique({
    where: { organizacaoId_videomakerId: { videomakerId, organizacaoId } }, select: { id: true },
  })
  if (!vinculo) return NextResponse.json({ error: "Videomaker não encontrado nesta empresa" }, { status: 404 })
  if (demandaId) {
    const demanda = await prisma.demanda.findFirst({ where: { id: demandaId, organizacaoId }, select: { id: true } })
    if (!demanda) return NextResponse.json({ error: "Demanda não encontrada" }, { status: 404 })
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
