import { z } from "zod"
import type { PrismaClient } from "@prisma/client"
import { PADRAO_IA } from "@/lib/ia-orcamento"
import { comOrg } from "@/lib/org-contexto"
import { registrarAuditoria, correlacaoAuditoria } from "@/lib/auditoria"

export const politicaEditavelSchema = z.object({
  habilitada: z.boolean(),
  tokensDia: z.number().int().min(0).max(1_000_000),
  simultaneas: z.number().int().min(1).max(5),
}).strict()
export const alteracaoPoliticaSchema = z.object({ anterior: politicaEditavelSchema, nova: politicaEditavelSchema }).strict()
export type PoliticaEditavel = z.infer<typeof politicaEditavelSchema>
export class ConflitoPoliticaIA extends Error {}
const editavel = (p: PoliticaEditavel): PoliticaEditavel => ({ habilitada: p.habilitada, tokensDia: p.tokensDia, simultaneas: p.simultaneas })
const igual = (a: PoliticaEditavel, b: PoliticaEditavel) => a.habilitada === b.habilitada && a.tokensDia === b.tokensDia && a.simultaneas === b.simultaneas

export async function alterarPoliticaIA(db: PrismaClient, ator: { organizacaoId: string; usuarioId: string }, entrada: z.infer<typeof alteracaoPoliticaSchema>) {
  const { anterior, nova } = alteracaoPoliticaSchema.parse(entrada)
  return comOrg(ator.organizacaoId, () => db.$transaction(async tx => {
    // Mesmo lock de reservar/iniciar: uma redução/desativação vale para o próximo checkpoint.
    const empresa = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM organizacoes WHERE id=${ator.organizacaoId} FOR UPDATE`
    if (!empresa.length) throw new Error("Empresa indisponível")
    const atual = await tx.politicaIA.findUnique({ where: { organizacaoId: ator.organizacaoId } }) ?? PADRAO_IA
    if (igual(atual, nova)) return { politica: editavel(atual), alterada: false }
    if (!igual(atual, anterior)) throw new ConflitoPoliticaIA()
    const politica = await tx.politicaIA.upsert({ where: { organizacaoId: ator.organizacaoId }, create: { organizacaoId: ator.organizacaoId, ...nova }, update: nova })
    await registrarAuditoria(tx, ator, { acao: "configuracao.alterada", recurso: "politica_ia", recursoId: ator.organizacaoId, correlationId: correlacaoAuditoria(), antes: editavel(atual), depois: editavel(politica) })
    return { politica: editavel(politica), alterada: true }
  }))
}
