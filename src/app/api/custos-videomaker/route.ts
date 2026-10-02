import { Prisma } from "@prisma/client"
import { pagamentoCusto } from "@/lib/custos-setor"
import { randomUUID } from "node:crypto"
import { registrarAuditoria } from "@/lib/auditoria"
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
  const validos = custos.filter(c => Number.isFinite(c.valor) && c.valor >= 0 && (c.valor > 0 || c.valorConfirmadoEm !== null))
  const somar = (lista: typeof custos) => lista.reduce((s,c) => s.plus(new Prisma.Decimal(c.valor.toString()).toDecimalPlaces(2)), new Prisma.Decimal(0)).toNumber()
  const totalGasto = somar(validos)
  const totalPago = somar(validos.filter(c => pagamentoCusto(c.pago,c.statusPagamento) === "pago"))
  const totalPendente = somar(validos.filter(c => pagamentoCusto(c.pago,c.statusPagamento) === "pendente"))
  const conflitosPagamento = custos.filter(c => pagamentoCusto(c.pago,c.statusPagamento) === "conflito").length
  const valoresSemConfirmacao = custos.filter(c => !Number.isFinite(c.valor) || c.valor < 0 || (c.valor === 0 && !c.valorConfirmadoEm)).length

  // Agrupar por videomaker
  const porVideomaker: Record<string, { nome: string; total: number; count: number }> = {}
  for (const c of validos) {
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
        pagamentoEmConflito: pagamentoCusto(c.pago,c.statusPagamento) === "conflito",
        valorPendenteConfirmacao: !Number.isFinite(c.valor) || c.valor < 0 || (c.valor === 0 && !c.valorConfirmadoEm),
        videomaker: {
          ...c.videomaker,
          valorDiaria: diarias.get(c.videomakerId) ?? null,
          cpfCnpj: f?.cpfCnpj ?? null,
          chavePix: f?.chavePix ?? null,
        },
      }
    }),
    resumo: { totalGasto, totalPago, totalPendente },
    qualidade: { conflitosPagamento, valoresSemConfirmacao, aviso: "Estados divergentes não entram nos totais pago/pendente. Valores desconhecidos exigem conferência." },
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

  if (demandaId && pago===true) return NextResponse.json({error:"Registre o custo do job, envie a NF e aprove antes de marcar o pagamento."},{status:409})
  if (pago !== undefined && typeof pago !== "boolean") return erroDeCampo("pago", "Informe um estado de pagamento válido.")
  if (tipo !== undefined && !["diaria", "mensalidade", "projeto", "bonus", "despesa", "equipamento"].includes(tipo)) return erroDeCampo("tipo", "Selecione um tipo de custo válido.")
  for (const [campo, valorData] of [["dataPagamento",dataPagamento],["dataVencimento",dataVencimento]]) {
    if (valorData && (typeof valorData !== "string" || !z.union([z.iso.date(),z.iso.datetime({offset:true})]).safeParse(valorData).success)) return erroDeCampo(campo, "Informe uma data válida.")
  }
  const fatoOrigem = req.headers.get("Idempotency-Key")
  if (fatoOrigem !== null && !/^[a-zA-Z0-9_-]{8,128}$/.test(fatoOrigem)) return erroDeCampo("origem", "Identificação de origem inválida.")
  const custo = await prisma.$transaction(async tx => {
  if (fatoOrigem) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${organizacaoId}:custo-externo:${fatoOrigem}`}, 0))`
    const anterior = await tx.custoVideomaker.findUnique({ where: { organizacaoId_fatoOrigem: { organizacaoId, fatoOrigem } } })
    if (anterior) {
      if (anterior.videomakerId !== videomakerId || anterior.demandaId !== (demandaId || null) || anterior.tipo !== (tipo ?? "diaria") || anterior.valor !== valorLido.valor || anterior.dataReferencia.getTime() !== instanteReferencia.getTime() || anterior.descricao !== (descricao ?? null) || anterior.pago !== (pago ?? false) || anterior.comprovante !== (comprovante ?? null) || anterior.dataPagamento?.toISOString() !== (dataPagamento ? new Date(dataPagamento).toISOString() : undefined) || anterior.dataVencimento?.toISOString() !== (dataVencimento ? new Date(dataVencimento).toISOString() : undefined)) return null
      return anterior
    }
  }
  const criado = await tx.custoVideomaker.create({
    data: {
      organizacaoId,
      fatoOrigem,
      videomakerId,
      demandaId: demandaId || null,
      tipo: tipo ?? "diaria",
      valor: valorLido.valor!,
      valorConfirmadoEm: new Date(),
      descricao,
      dataReferencia: instanteReferencia,
      dataVencimento: dataVencimento ? new Date(dataVencimento) : null,
      pago: pago ?? false,
      statusPagamento: pago === true ? "pago" : "pendente_nf",
      dataPagamento: dataPagamento ? new Date(dataPagamento) : null,
      comprovante,
    },
    include: {
      videomaker: { select: { id: true, nome: true } },
      demanda: { select: { id: true, codigo: true, titulo: true } },
    },
  })

    await registrarAuditoria(tx, acesso, { acao: "manutencao.custos", recurso: "custo", recursoId: criado.id, correlationId: randomUUID(), depois: { operacao: "criar", alterados: 1 } })
    return criado
  })
  if (!custo) return NextResponse.json({ error: "Esta origem já foi usada com outros dados. Confira o lançamento antes de repetir." }, { status: 409 })
  return NextResponse.json({ custo }, { status: 201 })
}
