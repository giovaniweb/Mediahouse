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
//   - o perfil de quem não tem vínculo abre só se ele estiver num card daqui.
// Com ou sem a rede (Onda 2B): escalar videomaker sem vínculo é recusado — menos
// quem já está no card (salvar o card de novo não pode derrubá-lo). Quem é da
// rede entra pelo convite, que cria o vínculo quando ele aceita.
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { moduloAtivo } from "@/lib/modulos-org"
import { parseToken } from "@/lib/equipe-token"

export const FORA_DA_REDE =
  "Este profissional não é da sua empresa. Quem é da rede de videomakers entra na sua lista pelo convite da rede."

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
 * nunca é recusado.
 *
 * Desde a Onda 2B, o videomaker precisa ter vínculo com a empresa, com ou sem
 * o módulo "rede": quem é da rede entra pelo convite, e o "aceito" cria o
 * vínculo. Escalar direto entregaria o telefone de quem não aceitou (Termos do
 * Profissional, seção 5). A rede ligada só abre a BUSCA (/videomakers/rede).
 */
export async function podeEscalarVideomaker(
  organizacaoId: string,
  videomakerId: string,
  atual?: string | null,
): Promise<boolean> {
  if (atual && atual === videomakerId) return true
  return temVinculo(organizacaoId, videomakerId)
}

/**
 * A pessoa escolhida para um slot do card (token unificado ou id cru) pode
 * entrar? Confere a PESSOA, não o prefixo, porque o resolvedor
 * (src/lib/equipe-resolver.ts) leva qualquer token a um videomaker ou editor:
 *   - videomaker ("vm:<id>", id cru no slot de captação, prefixo desconhecido
 *     "x:<id>", e "vm:" no slot de EDIÇÃO, que vira editor espelho com os
 *     dados dele) → precisa de vínculo, com ou sem a rede (Onda 2B);
 *   - "user:<id>" → o usuário é da empresa; senão, se ele é dono de um perfil
 *     de videomaker, esse perfil precisa de vínculo; se é dono de um editor,
 *     vale a regra do editor; usuário solto de outra empresa não entra;
 *   - editor ("ed:<id>", id cru no slot de edição) → com a rede, como antes;
 *     sem a rede, só com vínculo de editor (achado da revisão do #156).
 * `atual` é quem já está no slot: mantê-lo nunca é recusado. Conferir ANTES de
 * resolver: resolver cria o vínculo.
 */
export async function pessoaDoSlotLiberada(
  organizacaoId: string,
  token: string,
  slot: "captacao" | "edicao",
  atual?: string | null,
): Promise<boolean> {
  if (!token) return true
  const semPrefixo = !token.includes(":")
  const { origem, id } = parseToken(token)
  if (atual && atual === id && (semPrefixo || (slot === "captacao" ? origem === "vm" : origem === "ed"))) return true

  const editorLiberado = async (editorId: string) =>
    (await empresaVeRede(organizacaoId)) ||
    !!(await prisma.editorOrganizacao.findFirst({ where: { organizacaoId, editorId }, select: { id: true } }))

  if (origem === "user") {
    const membro = await prisma.usuarioOrganizacao.findFirst({ where: { organizacaoId, usuarioId: id }, select: { id: true } })
    if (membro) return true
    const perfil = await prisma.videomaker.findUnique({ where: { usuarioId: id }, select: { id: true } })
    if (perfil) return temVinculo(organizacaoId, perfil.id)
    const editor = await prisma.editor.findUnique({ where: { usuarioId: id }, select: { id: true } })
    if (editor) return editorLiberado(editor.id)
    return false
  }
  if (origem === "ed" || (semPrefixo && slot === "edicao")) return editorLiberado(id)
  return temVinculo(organizacaoId, id)
}

/** Pode abrir o perfil? Sem a rede: só quem tem vínculo ou já está num card desta empresa. */
export async function podeVerVideomaker(organizacaoId: string, videomakerId: string): Promise<boolean> {
  if (await empresaVeRede(organizacaoId)) return true
  if (await temVinculo(organizacaoId, videomakerId)) return true
  const card = await prisma.demanda.findFirst({ where: { organizacaoId, videomakerId }, select: { id: true } })
  return !!card
}
