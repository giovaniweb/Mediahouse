// Leitura e gravação do aceite dos documentos jurídicos.
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { comOrg } from "@/lib/org-contexto"
import { correlacaoAuditoria, registrarAuditoria, type AtorAuditoria } from "@/lib/auditoria"
import { marcaDeVersao, type SlugDocumento } from "@/lib/juridico/documentos"
import { documentosExigidos, documentosPendentes, type OrigemAceite } from "@/lib/juridico/aceite"

export type SituacaoAceite = { exigidos: SlugDocumento[]; pendentes: SlugDocumento[]; anteriores: number }

/**
 * O que falta a pessoa aceitar NA EMPRESA ativa. O aceite mora na empresa: quem
 * participa de duas aceita nas duas, porque o contrato de cada uma é outro.
 */
export async function situacaoDoAceite(usuarioId: string, organizacaoId: string): Promise<SituacaoAceite> {
  const vinculo = await prismaAuth.usuarioOrganizacao.findUnique({
    where: { usuarioId_organizacaoId: { usuarioId, organizacaoId } },
    select: { papel: true, categoria: true },
  })
  const exigidos = documentosExigidos({ papel: vinculo?.papel ?? null, categoria: vinculo?.categoria ?? null })
  const aceites = await comOrg(organizacaoId, () => prisma.aceiteTermos.findMany({
    where: { organizacaoId, titularTipo: "usuario", titularId: usuarioId },
    select: { documentos: true },
  }))
  return { exigidos, pendentes: documentosPendentes(exigidos, aceites), anteriores: aceites.length }
}

/**
 * Grava a prova do aceite e o evento de auditoria NA MESMA transação de quem
 * chama: aceite sem auditoria, ou o contrário, não existe.
 */
export async function registrarAceite(
  tx: Pick<Prisma.TransactionClient, "aceiteTermos" | "eventoAuditoria">,
  ator: AtorAuditoria,
  a: {
    organizacaoId: string
    titularTipo: "usuario" | "videomaker" | "designer"
    titularId: string
    documentos: SlugDocumento[]
    origem: OrigemAceite
    ipHash: string | null
  },
) {
  const documentos = [...new Set(a.documentos)].map(marcaDeVersao)
  const aceite = await tx.aceiteTermos.create({
    data: { organizacaoId: a.organizacaoId, titularTipo: a.titularTipo, titularId: a.titularId, documentos, origem: a.origem, ipHash: a.ipHash },
    select: { id: true },
  })
  await registrarAuditoria(tx, ator, {
    acao: "termos.aceite", recurso: a.titularTipo, recursoId: a.titularId,
    correlationId: correlacaoAuditoria(), depois: { documentos, origem: a.origem },
  })
  return aceite
}
