import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { criarFila, enfileirar, type LeaseJob } from "@/lib/fila-duravel"

const TIPO = "execucoes.recuperar"
const fila = criarFila(prisma)

/** Primeira rotina migrada: apenas banco; não repete chamadas de IA ou mensagens. */
export async function recuperarExecucoesDuravel(organizacaoId: string) {
  await comOrg(organizacaoId, () => prisma.$transaction(async tx => {
    const [r] = await tx.$queryRaw<{ agora: Date }[]>`SELECT (clock_timestamp() AT TIME ZONE 'UTC') AS agora`
    const hora = Math.floor(r.agora.getTime()/3_600_000)
    await enfileirar(tx, { organizacaoId, tipo: TIPO, referencia: organizacaoId,
      chave: String(hora), expiraEm: new Date(r.agora.getTime()+3_600_000) })
  }))
  const jobs = await fila.reivindicar(organizacaoId, 1, [TIPO])
  const resumo = { reivindicados: jobs.length, concluidos: 0, falhos: 0, obsoletos: 0 }
  for (const job of jobs) {
    const lease: LeaseJob = { ...job, leaseToken: job.leaseToken! }
    // Nunca interpretar payload arbitrário como função/ferramenta.
    if (job.tipo !== TIPO || job.versao !== 1 || job.referencia !== organizacaoId) {
      if (await fila.falhar(lease,"tipo_desconhecido",false)) resumo.falhos++
      else resumo.obsoletos++
      continue
    }
    try {
      const concluiu = await fila.concluirLocal(lease,async (tx,j) => {
        // Revalida no instante do efeito; execuções recentes/concluídas não mudam.
        const [r] = await tx.$queryRaw<{ agora: Date }[]>`SELECT (clock_timestamp() AT TIME ZONE 'UTC') AS agora`
        await tx.agenteExecucao.updateMany({ where: { organizacaoId: j.organizacaoId, status: "executando",
          createdAt: { lt: new Date(r.agora.getTime()-30*60_000) } },
          data: { status: "erro", erro: "Execução interrompida (função encerrada antes de concluir)", finishedAt: r.agora } })
      })
      if (concluiu) resumo.concluidos++
      else resumo.obsoletos++
    } catch {
      // Texto bruto do banco/provedor nunca entra em log persistido ou HTTP.
      if (await fila.falhar(lease)) resumo.falhos++
      else resumo.obsoletos++
    }
  }
  return resumo
}
