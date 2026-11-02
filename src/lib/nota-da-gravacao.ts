import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { registrarAuditoria } from "@/lib/auditoria"
import { PagamentoInvalido, conferirPagamentoAberto, custoUnicoDoJob } from "@/lib/pagamentos"
import { sendEmailNotaParaCompras } from "@/lib/email"
import { momentoDoJob, rotuloDoMomento } from "@/lib/ficha-do-job"
import { EVENTO_NOTA } from "@/lib/status"
import { emSegundoPlano } from "@/lib/notificar"
import { avisarGravacao } from "@/lib/avisos-gravacao"
import { comToken } from "@/lib/midia"

// A nota do videomaker de gravação externa, no caminho da casa (Giovani,
// 29/10/2026): o videomaker manda a nota pelo link, a Débora encaminha ao setor
// de compras, compras paga. Sem "aprovar pagamento", sem valor nem PIX a
// conferir: isso é de compras, que trabalha com a nota.
//
// Encaminhar tenta o e-mail ANTES de mudar o estado. Se o e-mail falhar, nada
// muda e a frase diz o plano B — baixar a nota, mandar por fora e marcar como
// enviada (`marcar_enviada`). Erro do sistema não trava o fluxo.

export type AcaoDaNota = "enviar_compras" | "marcar_enviada" | "marcar_paga"

type Ator = { organizacaoId: string; usuarioId: string }

async function lerGravacao(ator: Ator, demandaId: string) {
  const d = await prisma.demanda.findFirst({
    where: { id: demandaId, organizacaoId: ator.organizacaoId },
    select: {
      id: true, codigo: true, titulo: true, clienteFinalNome: true, statusInterno: true,
      dataCaptacao: true, dataEvento: true, videomakerId: true, videomaker: { select: { nome: true } },
    },
  })
  if (!d) throw new PagamentoInvalido("Gravação não encontrada.", 404)
  if (!d.videomakerId) throw new PagamentoInvalido("Esta gravação não tem videomaker.")
  const custo = await custoUnicoDoJob(prisma, ator.organizacaoId, d.id, d.videomakerId)
  if (!custo) throw new PagamentoInvalido("A nota do videomaker ainda não chegou.")
  return { d, custo }
}

/**
 * O link da nota no e-mail para compras. Quem recebe não tem conta: o endereço
 * vai absoluto e, quando a nota veio pelo link do videomaker, com a credencial
 * daquele envio (a mesma que a página dele usa; lib/midia-acesso.ts aceita).
 */
async function linkDaNotaParaCompras(demandaId: string, videomakerId: string, url: string): Promise<string> {
  const nf = await prisma.notaFiscalUpload.findFirst({ where: { demandaId, videomakerId, url }, select: { token: true } })
  const link = (nf && comToken(url, nf.token)) || url
  if (!link.startsWith("/")) return link
  const base = process.env.NEXTAUTH_URL?.trim().replace(/\/$/, "") || "https://nuflow.space"
  return `${base}${link}`
}

async function registrar(ator: Ator, demandaId: string, statusInterno: string, custoId: string, texto: string, decisao: "enviado" | "finalizado") {
  await prisma.historicoStatus.create({
    data: { demandaId, statusAnterior: statusInterno, statusNovo: EVENTO_NOTA, usuarioId: ator.usuarioId, origem: "manual", observacao: texto },
  })
  await registrarAuditoria(prisma, ator, {
    acao: "manutencao.custos", recurso: "custo", recursoId: custoId, correlationId: randomUUID(),
    depois: { operacao: "editar", alterados: 1, decisao },
  })
}

export async function agirNaNota(ator: Ator, demandaId: string, acao: AcaoDaNota): Promise<{ mensagem: string }> {
  return comOrg(ator.organizacaoId, async () => {
    const { d, custo } = await lerGravacao(ator, demandaId)
    conferirPagamentoAberto(custo)

    if (acao === "marcar_paga") {
      if (custo.statusPagamento !== "aguardando_pagamento") throw new PagamentoInvalido("Marque como paga depois de enviar a nota para compras.")
      const r = await prisma.custoVideomaker.updateMany({
        where: { id: custo.id, organizacaoId: ator.organizacaoId, statusPagamento: "aguardando_pagamento", pago: false },
        data: { statusPagamento: "pago", pago: true, dataPagamento: new Date() },
      })
      if (r.count === 0) throw new PagamentoInvalido("A nota mudou enquanto isso. Atualize a página.")
      await registrar(ator, d.id, d.statusInterno, custo.id, "Nota do videomaker paga", "finalizado")
      // O videomaker fica sabendo do pagamento (lib/avisos-gravacao.ts).
      emSegundoPlano(() => avisarGravacao(ator.organizacaoId, d.id, "nota_paga", ator.usuarioId), "aviso-gravacao")
      return { mensagem: "Nota marcada como paga. O videomaker foi avisado." }
    }

    if (custo.statusPagamento === "aguardando_pagamento") return { mensagem: "A nota já foi enviada para compras." }
    if (custo.statusPagamento !== "nf_enviada" || !custo.notaFiscalUrl) throw new PagamentoInvalido("A nota do videomaker ainda não chegou.")

    let porEmail = false
    if (acao === "enviar_compras") {
      const quem = await prisma.usuario.findUnique({ where: { id: ator.usuarioId }, select: { email: true } })
      const quando = momentoDoJob(d)
      const r = await sendEmailNotaParaCompras({
        nomeVideomaker: d.videomaker?.nome ?? "Videomaker",
        cliente: d.clienteFinalNome?.trim() || d.titulo,
        codigo: d.codigo,
        dataGravacao: quando ? rotuloDoMomento(quando) : null,
        notaFiscalUrl: await linkDaNotaParaCompras(d.id, d.videomakerId!, custo.notaFiscalUrl),
      }, ator.organizacaoId, [quem?.email])
      if (!r.ok) {
        throw new PagamentoInvalido(`O e-mail para compras não saiu (${r.error ?? "erro no envio"}). Baixe a nota, mande por fora e marque como enviada.`, 502)
      }
      porEmail = true
    }

    const r = await prisma.custoVideomaker.updateMany({
      where: { id: custo.id, organizacaoId: ator.organizacaoId, statusPagamento: "nf_enviada", pago: false },
      data: { statusPagamento: "aguardando_pagamento", emailFinanceiroAt: porEmail ? new Date() : null },
    })
    if (r.count === 0) return { mensagem: "A nota já foi enviada para compras." }
    await prisma.alertaIA.updateMany({
      where: { organizacaoId: ator.organizacaoId, demandaId: d.id, status: "ativo", tipoAlerta: { in: ["pagamento_pendente", "nf_recebida"] } },
      data: { status: "resolvido", resolvedAt: new Date() },
    })
    await registrar(ator, d.id, d.statusInterno, custo.id, porEmail ? "Nota enviada para compras por e-mail" : "Nota enviada para compras (por fora)", "enviado")
    return { mensagem: porEmail ? "Nota enviada para compras. Você recebeu a cópia." : "Nota marcada como enviada para compras." }
  })
}
