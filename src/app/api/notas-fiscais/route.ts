import { NextRequest, NextResponse } from "next/server"
import type { StatusInterno } from "@prisma/client"
import { requireAcesso } from "@/lib/acesso"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { erroDeCampo } from "@/lib/erros-api"
import { intervaloCalendario, RecorteInvalido } from "@/lib/metricas-recorte"
import { ETAPA_DO_STATUS, rotuloDoTipoDeGravacao } from "@/lib/etapas-da-gravacao"
import { momentoDoJob } from "@/lib/ficha-do-job"
import { estadoNoPainel, retratoDasNotas } from "@/lib/notas-fiscais-painel"
import { pagamentoDe, rotuloDoValor } from "@/lib/pagamento-do-videomaker"
import { diariasDaEmpresa, fiscaisDaEmpresaEmLote } from "@/lib/videomaker-vinculo"

// GET /api/notas-fiscais — a página "Notas fiscais" (12/11/2026).
//
// Só gestão e financeiro: admin e gestor pelo papel, os outros com `verCustos`
// (a porta de Custos, que já mostra diária e PIX). Quem só aprova não entra:
// a página mostra valor e chave PIX inteira.
//
// Filtros: ?de=AAAA-MM-DD&ate=AAAA-MM-DD (dia da gravação) e ?videomakerId=.
// As ações (cadastrada para pagamento, paga) vão por POST /api/jobs/[id]/nota.

// Material entregue ou concluída: da edição em diante.
const STATUS_DO_PAINEL = (Object.entries(ETAPA_DO_STATUS) as [StatusInterno, string][])
  .filter(([, etapa]) => ["em_edicao", "para_enviar", "concluido"].includes(etapa))
  .map(([s]) => s)

const nomeCurto = (n: string | null | undefined) => n?.trim() || null

export async function GET(req: NextRequest) {
  const acesso = await requireAcesso()
  if (acesso instanceof NextResponse) return acesso
  if (!["admin", "gestor"].includes(acesso.papel) && !acesso.permissoes.verCustos) {
    return NextResponse.json({ error: "Só a gestão e o financeiro veem as notas fiscais." }, { status: 403 })
  }
  const { organizacaoId } = acesso
  const sp = new URL(req.url).searchParams
  const videomakerId = sp.get("videomakerId") || null
  let periodo: { gte?: Date; lt?: Date }
  try { periodo = intervaloCalendario(sp.get("de"), sp.get("ate")) }
  catch (e) {
    if (e instanceof RecorteInvalido) return erroDeCampo(e.campo ?? "de", e.message)
    throw e
  }
  const comPeriodo = periodo.gte || periodo.lt

  const linhas = await comOrg(organizacaoId, async () => {
    const demandas = await prisma.demanda.findMany({
      where: {
        organizacaoId,
        tipoGravacao: { not: null },
        videomakerId: videomakerId ?? { not: null },
        statusInterno: { in: STATUS_DO_PAINEL },
        ...(comPeriodo ? { OR: [{ dataCaptacao: periodo }, { dataCaptacao: null, dataEvento: periodo }] } : {}),
      },
      select: {
        id: true, codigo: true, titulo: true, clienteFinalNome: true, statusInterno: true, tipoGravacao: true,
        dataCaptacao: true, dataEvento: true, localGravacao: true, localEvento: true, cidade: true, videomakerId: true,
        videomaker: { select: { id: true, nome: true } },
        custos: {
          select: {
            id: true, videomakerId: true, valor: true, valorConfirmadoEm: true, statusPagamento: true, pago: true, notaFiscalUrl: true,
            cadastradoPagamentoEm: true, dataPagamento: true,
            cadastradoPagamentoPor: { select: { nome: true } }, pagoPor: { select: { nome: true } },
          },
        },
        notasFiscais: { select: { videomakerId: true, status: true, url: true, updatedAt: true }, orderBy: { updatedAt: "desc" } },
      },
      orderBy: [{ dataCaptacao: "desc" }, { dataEvento: "desc" }, { codigo: "desc" }],
      take: 500,
    })
    // Diária e fiscais em uma consulta cada (a lista pode ter centenas de linhas).
    const ids = demandas.map((d) => d.videomakerId!)
    const [diarias, fiscais] = await Promise.all([diariasDaEmpresa(ids, organizacaoId), fiscaisDaEmpresaEmLote(ids, organizacaoId)])
    return demandas.map((d) => {
      // Só o que é do videomaker atual: um trocado no meio do caminho tem o dele à parte.
      const custos = d.custos.filter((c) => c.videomakerId === d.videomakerId)
      const notas = d.notasFiscais.filter((n) => n.videomakerId === d.videomakerId)
      const estado = estadoNoPainel({ statusInterno: d.statusInterno, videomakerId: d.videomakerId, custos, notasFiscais: notas })
      const custo = custos.find((c) => c.pago || c.statusPagamento === "pago") ?? custos.find((c) => c.notaFiscalUrl) ?? custos[0] ?? null
      const enviada = notas.find((n) => n.status === "enviada" || n.status === "aprovada")
      const pagamento = estado === "sem_pedido" ? null : pagamentoDe(custos, diarias.get(d.videomakerId!), fiscais.get(d.videomakerId!))
      const momento = momentoDoJob(d)
      return {
        demandaId: d.id,
        codigo: d.codigo,
        cliente: d.clienteFinalNome?.trim() || d.titulo,
        tipo: rotuloDoTipoDeGravacao(d.tipoGravacao),
        dia: momento?.dia ?? null,
        local: [d.localGravacao?.trim() || d.localEvento?.trim(), d.cidade?.trim()].filter(Boolean).join(" — ") || null,
        videomaker: d.videomaker,
        estado,
        notaUrl: custo?.notaFiscalUrl ?? enviada?.url ?? null,
        enviadaEm: enviada?.updatedAt ?? null,
        cadastrada: custo?.cadastradoPagamentoEm ? { em: custo.cadastradoPagamentoEm, por: nomeCurto(custo.cadastradoPagamentoPor?.nome) } : null,
        paga: custo && (custo.pago || custo.statusPagamento === "pago") ? { em: custo.dataPagamento, por: nomeCurto(custo.pagoPor?.nome) } : null,
        pagamento: pagamento ? {
          valor: rotuloDoValor(pagamento),
          chavePix: pagamento.chavePix, tipoPix: pagamento.tipoPix,
          dadosBancarios: pagamento.dadosBancarios, cpfCnpj: pagamento.cpfCnpj,
        } : null,
      }
    })
  })

  // A lista do filtro não encolhe com o próprio filtro: todos os videomakers das gravações da página.
  const comGravacao = await comOrg(organizacaoId, () => prisma.demanda.findMany({
    where: { organizacaoId, tipoGravacao: { not: null }, videomakerId: { not: null }, statusInterno: { in: STATUS_DO_PAINEL } },
    select: { videomaker: { select: { id: true, nome: true } } }, distinct: ["videomakerId"],
  }))
  const videomakers = comGravacao.flatMap((d) => d.videomaker ? [d.videomaker] : []).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
  return NextResponse.json(
    { linhas, retrato: retratoDasNotas(linhas.map((l) => l.estado)), videomakers },
    { headers: { "Cache-Control": "private, no-store" } },
  )
}
