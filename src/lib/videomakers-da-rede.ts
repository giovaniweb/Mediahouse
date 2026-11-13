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
import { parseToken } from "@/lib/equipe-token"

export const FORA_DA_REDE =
  "Este videomaker não é da sua empresa. A sua empresa trabalha só com os próprios videomakers."

/** Resposta das rotas da busca e do convite da rede quando a empresa não tem o módulo. */
export const SEM_MODULO_REDE =
  "A busca na rede de videomakers não está ligada para a sua empresa."

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

/**
 * A pessoa escolhida para um slot do card (token unificado ou id cru) é da
 * empresa? Vale para QUALQUER prefixo, porque o resolvedor
 * (src/lib/equipe-resolver.ts) leva todos a um videomaker ou editor:
 *   - "vm:<id>", id cru no slot de captação e qualquer prefixo desconhecido
 *     ("x:<id>") viram videomaker → precisa de vínculo;
 *   - "ed:<id>" → o editor precisa ter vínculo com a empresa;
 *   - "user:<id>" → o usuário precisa ser da empresa (senão "user:" do dono de
 *     um perfil global puxaria esse perfil para dentro);
 *   - id cru no slot de edição é editor → vínculo de editor.
 * `atual` é quem já está no slot: mantê-lo nunca é recusado. Com a rede ligada,
 * tudo passa, como antes. Conferir ANTES de resolver: resolver cria o vínculo.
 */
export async function pessoaDoSlotLiberada(
  organizacaoId: string,
  token: string,
  slot: "captacao" | "edicao",
  atual?: string | null,
): Promise<boolean> {
  if (!token) return true
  if (await empresaVeRede(organizacaoId)) return true
  const semPrefixo = !token.includes(":")
  const { origem, id } = parseToken(token)
  if (atual && atual === id && (semPrefixo || (slot === "captacao" ? origem === "vm" : origem === "ed"))) return true
  if (origem === "user") {
    const membro = await prisma.usuarioOrganizacao.findFirst({ where: { organizacaoId, usuarioId: id }, select: { id: true } })
    return !!membro
  }
  if (origem === "ed" || (semPrefixo && slot === "edicao")) {
    const vinculo = await prisma.editorOrganizacao.findFirst({ where: { organizacaoId, editorId: id }, select: { id: true } })
    return !!vinculo
  }
  return temVinculo(organizacaoId, id)
}

/** Pode abrir o perfil? Sem a rede: só quem tem vínculo ou já está num card desta empresa. */
export async function podeVerVideomaker(organizacaoId: string, videomakerId: string): Promise<boolean> {
  if (await empresaVeRede(organizacaoId)) return true
  if (await temVinculo(organizacaoId, videomakerId)) return true
  const card = await prisma.demanda.findFirst({ where: { organizacaoId, videomakerId }, select: { id: true } })
  return !!card
}
