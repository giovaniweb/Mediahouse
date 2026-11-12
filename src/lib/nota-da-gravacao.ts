import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { registrarAuditoria } from "@/lib/auditoria"
import { PagamentoInvalido, conferirPagamentoAberto, custoUnicoDoJob } from "@/lib/pagamentos"
import { EVENTO_NOTA } from "@/lib/status"
import { emSegundoPlano } from "@/lib/notificar"
import { avisarGravacao } from "@/lib/avisos-gravacao"

// A nota do videomaker de gravação externa, no caminho da casa: o videomaker
// manda a nota pelo link, a Débora recebe por e-mail (com os dados de
// pagamento) e cadastra para pagamento, e a nota é paga. "Cadastrada para
// pagamento" substituiu o "enviar para compras" (Giovani, 12/11/2026): não há
// mais e-mail para compras daqui. Cada passo avisa o videomaker.
export type AcaoDaNota = "enviar_compras" | "marcar_enviada" | "marcar_cadastrada" | "marcar_paga"

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
      if (custo.statusPagamento !== "aguardando_pagamento") throw new PagamentoInvalido("Marque como paga depois de cadastrar a nota para pagamento.")
      const r = await prisma.custoVideomaker.updateMany({
        where: { id: custo.id, organizacaoId: ator.organizacaoId, statusPagamento: "aguardando_pagamento", pago: false },
        data: { statusPagamento: "pago", pago: true, dataPagamento: new Date(), pagoPorId: ator.usuarioId },
      })
      if (r.count === 0) throw new PagamentoInvalido("A nota mudou enquanto isso. Atualize a página.")
      await registrar(ator, d.id, d.statusInterno, custo.id, "Nota do videomaker paga", "finalizado")
      // O videomaker fica sabendo do pagamento (lib/avisos-gravacao.ts).
      emSegundoPlano(() => avisarGravacao(ator.organizacaoId, d.id, "nota_paga", ator.usuarioId), "aviso-gravacao")
      return { mensagem: "Nota marcada como paga. O videomaker foi avisado." }
    }

    // marcar_cadastrada; "enviar_compras" e "marcar_enviada" são os nomes de
    // antes de 12/11/2026 e caem aqui (sem o e-mail para compras, que saiu).
    // `aguardando_pagamento` é "cadastrada para pagamento".
    if (custo.statusPagamento === "aguardando_pagamento") return { mensagem: "A nota já estava cadastrada para pagamento." }
    if (custo.statusPagamento !== "nf_enviada" || !custo.notaFiscalUrl) throw new PagamentoInvalido("A nota do videomaker ainda não chegou.")
    const r = await prisma.custoVideomaker.updateMany({
      where: { id: custo.id, organizacaoId: ator.organizacaoId, statusPagamento: "nf_enviada", pago: false },
      data: { statusPagamento: "aguardando_pagamento", cadastradoPagamentoEm: new Date(), cadastradoPagamentoPorId: ator.usuarioId },
    })
    if (r.count === 0) return { mensagem: "A nota já estava cadastrada para pagamento." }
    await prisma.alertaIA.updateMany({
      where: { organizacaoId: ator.organizacaoId, demandaId: d.id, status: "ativo", tipoAlerta: { in: ["pagamento_pendente", "nf_recebida"] } },
      data: { status: "resolvido", resolvedAt: new Date() },
    })
    await registrar(ator, d.id, d.statusInterno, custo.id, "Nota cadastrada para pagamento", "enviado")
    // O videomaker fica sabendo, com a arte do carimbo (lib/avisos-gravacao.ts).
    emSegundoPlano(() => avisarGravacao(ator.organizacaoId, d.id, "nota_cadastrada", ator.usuarioId), "aviso-gravacao")
    return { mensagem: "Nota marcada como cadastrada para pagamento. O videomaker foi avisado." }
  })
}
