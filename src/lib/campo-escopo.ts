// Escopo do painel de campo — o workspace do videomaker.
//
// Aqui a regra é o OPOSTO do resto do sistema. Nas telas internas, a pessoa está
// dentro de UMA empresa e só vê aquilo. No painel de campo, ela é um
// profissional da REDE: vê o trabalho dela em todas as empresas que a
// contrataram, junto, porque a agenda dela é uma só.
//
// O que isso NÃO pode virar: ver a operação de empresa que nunca a contratou.
// Até 24/08/2026, `campo/agenda` e `campo/ranking` consultavam sem escopo
// nenhum — um videomaker da Contourline enxergava a agenda e o ranking de
// qualquer outra empresa da plataforma. Passava despercebido porque só havia
// uma empresa de verdade.
//
// A fronteira é o VÍNCULO: as empresas com que a pessoa tem relação comercial.
import { prisma } from "@/lib/prisma"

/** Perfil de videomaker da pessoa logada, se houver. */
export async function videomakerDoUsuario(usuarioId: string) {
  return prisma.videomaker.findFirst({ where: { usuarioId }, select: { id: true, nome: true } })
}

/**
 * Empresas que este videomaker atende. É a fronteira do painel de campo:
 * qualquer consulta cross-company aqui tem que caber neste conjunto.
 *
 * Lista vazia significa "nenhuma empresa" — e quem chama precisa tratar como
 * vazio, nunca como "sem filtro". `{ in: [] }` no Prisma não retorna nada, que é
 * o comportamento certo, mas depender disso por acidente é frágil.
 */
export async function organizacoesDoVideomaker(videomakerId: string): Promise<string[]> {
  const vinculos = await prisma.videomakerOrganizacao.findMany({
    where: { videomakerId, emListaNegra: false },
    select: { organizacaoId: true },
  })
  return vinculos.map((v) => v.organizacaoId)
}

/** Nome e slug das empresas, para etiquetar cada item na tela. */
export async function etiquetasDeOrganizacao(ids: string[]) {
  if (ids.length === 0) return new Map<string, { nome: string; slug: string }>()
  const orgs = await prisma.organizacao.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, nome: true, slug: true },
  })
  return new Map(orgs.map((o) => [o.id, { nome: o.nome, slug: o.slug }]))
}
