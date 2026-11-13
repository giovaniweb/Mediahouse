// Videomakers da REDE: o que a empresa enxerga além dos próprios.
//
// O perfil do videomaker é global (prisma/schema.prisma, model Videomaker), e
// até 13/11/2026 toda empresa via, buscava e escalava a rede inteira. Pedido do
// Giovani: a rede passa a ser um recurso pago, ligado por empresa pelo
// super-admin (módulo "rede" em src/lib/modulos.ts). A GH Produção não quer a
// rede; empresa nova nasce sem ela.
//
// "Da empresa" = tem vínculo com ela (videomaker_organizacao). Quem é escalado
// num card ganha o vínculo na hora (src/lib/equipe-resolver.ts), então todo
// videomaker que já trabalhou para a empresa continua aparecendo.
//
// Com a rede DESLIGADA, no servidor:
//   - listas e buscas mostram só quem tem vínculo;
//   - escalar alguém sem vínculo é recusado — menos quem já está no card
//     (salvar o card de novo não pode derrubar o videomaker que já estava lá);
//   - o perfil de quem não tem vínculo abre só se ele estiver num card daqui.
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { moduloAtivo } from "@/lib/modulos-org"

export const FORA_DA_REDE =
  "Este videomaker não é da sua empresa. A sua empresa trabalha só com os próprios videomakers."

/** A empresa enxerga os videomakers da rede? */
export function empresaVeRede(organizacaoId: string | null | undefined): Promise<boolean> {
  return moduloAtivo(organizacaoId, "rede")
}

/** Recorte das listas: com a rede, nada a mais; sem a rede, só quem tem vínculo aqui. */
export function recorteDaRede(organizacaoId: string, veRede: boolean): Prisma.VideomakerWhereInput {
  return veRede ? {} : { vinculos: { some: { organizacaoId } } }
}

async function temVinculo(organizacaoId: string, videomakerId: string): Promise<boolean> {
  const v = await prisma.videomakerOrganizacao.findUnique({
    where: { organizacaoId_videomakerId: { organizacaoId, videomakerId } },
    select: { id: true },
  })
  return !!v
}

/**
 * Pode pôr este videomaker num card? `atual` é quem já está no card: mantê-lo
 * nunca é recusado, mesmo sem a rede.
 */
export async function podeEscalarVideomaker(
  organizacaoId: string,
  videomakerId: string,
  atual?: string | null,
): Promise<boolean> {
  if (atual && atual === videomakerId) return true
  if (await empresaVeRede(organizacaoId)) return true
  return temVinculo(organizacaoId, videomakerId)
}

/** Pode abrir o perfil? Sem a rede: só quem tem vínculo ou já está num card desta empresa. */
export async function podeVerVideomaker(organizacaoId: string, videomakerId: string): Promise<boolean> {
  if (await empresaVeRede(organizacaoId)) return true
  if (await temVinculo(organizacaoId, videomakerId)) return true
  const card = await prisma.demanda.findFirst({ where: { organizacaoId, videomakerId }, select: { id: true } })
  return !!card
}
