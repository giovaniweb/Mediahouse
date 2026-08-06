// Responsáveis de demanda — ponto único de leitura e escrita.
//
// Modelo: a tabela `demanda_responsavel` (M2M) é a FONTE DA VERDADE.
// `Demanda.responsavelId` é uma coluna derivada — o "responsável principal",
// mantida em sincronia para os `include: { responsavel }` e ordenações que já
// existem no app. Ninguém deve escrever `responsavelId` direto.
//
// Por que isso existe: a UI manda `responsavelId` (singular, edição inline no
// modal) ou `responsavelIds[]` (multi, Growth). Antes, o caminho singular só
// gravava a coluna escalar e nunca a M2M — e como o filtro consulta a M2M, a
// demanda sumia do filtro por responsável logo depois de ser atribuída.
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

// Normaliza as duas formas de entrada numa lista canônica.
// `undefined` = o campo não veio no body (não mexer nos responsáveis).
// `[]`        = veio vazio (limpar os responsáveis).
export function lerResponsaveisDoBody(body: Record<string, unknown>): string[] | undefined {
  if (Array.isArray(body.responsavelIds)) {
    return Array.from(new Set((body.responsavelIds as unknown[]).filter((v): v is string => typeof v === "string" && !!v)))
  }
  if (body.responsavelId !== undefined) {
    const id = body.responsavelId
    return typeof id === "string" && id ? [id] : []
  }
  return undefined
}

// Garante que todos os responsáveis pertencem à organização (sem cross-org).
// Retorna a lista validada ou um NextResponse 400 para a rota devolver direto.
export async function validarResponsaveis(
  ids: string[],
  organizacaoId: string
): Promise<string[] | NextResponse> {
  if (ids.length === 0) return []
  const membros = await prisma.usuario.findMany({
    where: { id: { in: ids }, organizacoes: { some: { organizacaoId } } },
    select: { id: true },
  })
  const validos = new Set(membros.map((m) => m.id))
  if (validos.size !== ids.length) {
    return NextResponse.json({ error: "Responsável inválido para esta organização" }, { status: 400 })
  }
  return ids
}

// ÚNICO ponto de escrita: reconstrói a M2M e sincroniza a coluna derivada numa
// transação, para os dois nunca divergirem. O primeiro da lista é o principal.
export async function setResponsaveis(
  demandaId: string,
  usuarioIds: string[]
): Promise<{ principalId: string | null }> {
  const principalId = usuarioIds[0] ?? null
  await prisma.$transaction([
    prisma.demandaResponsavel.deleteMany({
      where: { demandaId, ...(usuarioIds.length > 0 ? { usuarioId: { notIn: usuarioIds } } : {}) },
    }),
    ...(usuarioIds.length > 0
      ? [
          prisma.demandaResponsavel.createMany({
            data: usuarioIds.map((usuarioId) => ({ demandaId, usuarioId })),
            skipDuplicates: true,
          }),
        ]
      : []),
    prisma.demanda.update({ where: { id: demandaId }, data: { responsavelId: principalId } }),
  ])
  return { principalId }
}

// Filtro por responsável. Cobre a M2M e também a coluna derivada, para que
// demandas antigas (criadas por rotas que nunca populavam a M2M) continuem
// aparecendo enquanto o backfill não roda.
export function whereResponsavel(usuarioId: string): Prisma.DemandaWhereInput {
  return {
    OR: [{ responsaveis: { some: { usuarioId } } }, { responsavelId: usuarioId }],
  }
}
