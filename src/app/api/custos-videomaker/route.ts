import { intervaloCalendario, RecorteInvalido } from "@/lib/metricas-recorte"
import { z } from "zod"
import { requireAcesso } from "@/lib/acesso"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { diariasDaEmpresa, fiscaisDaEmpresaEmLote, type FiscaisDaEmpresa } from "@/lib/videomaker-vinculo"
import { lerValorMonetario } from "@/lib/numeros"
import { erroDeCampo } from "@/lib/erros-api"

// GET /api/custos-videomaker — listar custos com filtros opcionais
//
// Lê quem tem `verCustos` ou `verAprovacoes`: a tela de Aprovações lista as
// notas enviadas para quem aprova, e o líder audiovisual não tem `verCustos`.
// Sem `verCustos`, a lista sai sem diária e sem CPF/CNPJ e PIX — regra do
// hotfix de produção de 02/10/2026 (PR #73), mantida na integração.
export async function GET(req: NextRequest) {
  const acesso = await requireAcesso()
  if (acesso instanceof NextResponse) return acesso
  const verCustos = acesso.permissoes.verCustos
  if (!verCustos && !acesso.permissoes.verAprovacoes) return NextResponse.json({ error: "Sem permissão" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const videomakerId = searchParams.get("videomakerId")
  const demandaId = searchParams.get("demandaId")
  const pago = searchParams.get("pago")
  const de = searchParams.get("de")
  const ate = searchParams.get("ate")

  let dataReferencia
  try { dataReferencia = intervaloCalendario(de, ate) }
  catch (e) {
    if (e instanceof RecorteInvalido) return erroDeCampo(e.campo ?? "de", e.message)
    throw e
  }
  const { organizacaoId } = acesso

  const custos = await prisma.custoVideomaker.findMany({
    where: {
      organizacaoId,
      ...(videomakerId && { videomakerId }),
      ...(demandaId && { demandaId }),
      ...(pago !== null && pago !== undefined && { pago: pago === "true" }),
      ...(de !== null || ate !== null ? { dataReferencia } : {}),
    },
    include: {
      videomaker: { select: { id: true, nome: true, cidade: true } },
      demanda: { select: { id: true, codigo: true, titulo: true, tipoVideo: true } },
    },
    orderBy: [{ dataReferencia: "desc" }, { id: "desc" }],
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
  const [diarias, fiscais] = verCustos
    ? await Promise.all([diariasDaEmpresa(ids, organizacaoId), fiscaisDaEmpresaEmLote(ids, organizacaoId)])
    : [new Map<string, number | null>(), new Map<string, FiscaisDaEmpresa>()]

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
  }, { headers: { "Cache-Control": "private, no-store" } })
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
  const referencia = z.union([z.iso.date(), z.iso.datetime({ offset: true })]).safeParse(dataReferencia)
  if (!referencia.success) return erroDeCampo("dataReferencia", "Informe uma data de referência válida.")
  let instanteReferencia: Date
  try {
    instanteReferencia = referencia.data.length === 10 ? intervaloCalendario(referencia.data, null).gte! : new Date(referencia.data)
  } catch { return erroDeCampo("dataReferencia", "Informe uma data de referência válida.") }

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
      dataReferencia: instanteReferencia,
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
