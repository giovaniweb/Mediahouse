// Quem sobe, troca ou apaga arquivo de uma demanda (04/11/2026).
//
// As rotas de envio (`upload-url` e `upload-video`) e o registro da versão que
// vai ao cliente (`POST /api/aprovacao-video`) conferiam só a EMPRESA. Qualquer
// pessoa logada nela, inclusive o videomaker externo e o solicitante, chamava a
// rota direto num card que não era dela e trocava ou apagava o vídeo final, os
// brutos ou os anexos. A tela não chegava lá; a rota aceitava.
//
// A régua é a da ficha (DemandaDetalhe):
//   1. o card precisa estar no escopo da pessoa (`demandaNoEscopo`). Fora dele,
//      a resposta é 404, como para um card que não existe: as rotas de leitura,
//      edição e exclusão da ficha respondem igual;
//   2. no escopo, sobe a gestão, quem tem "Editar Demanda" ou quem faz a peça
//      (responsáveis, editor e designer do card). É o `souResponsavel ||
//      podeEditar` que a ficha usa para oferecer o "Enviar para aprovação". O
//      designer entra por aqui: o preset dele não tem "Editar Demanda", e é
//      ele quem sobe a arte;
//   3. no anexo (documento), também o solicitante, no próprio pedido. Os
//      formulários de criação anexam logo depois de criar o card, e o
//      solicitante não tem "Editar Demanda".
//
// O videomaker NÃO entra em "faz a peça": ele entrega pelo link do convite
// (/api/convites/[token]/entrega), que tem a própria trava.
import { NextResponse } from "next/server"
import type { Session } from "next-auth"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { ehGestor } from "@/lib/papel"
import { demandaNoEscopo } from "@/lib/escopo-demanda"
import { permissoesEfetivas } from "@/lib/permissoes-server"

/** O que a rota vai gravar: os tipos de `upload-url` e de `upload-video`. */
export type ArquivoDaDemanda = "final" | "brutos" | "thumbnail" | "documento"

export const SEM_PERMISSAO_DE_ENVIO =
  "Neste card, só sobe ou remove arquivo quem faz a peça, quem pode editar demandas ou a gestão."

type PessoasDoCard = {
  solicitanteId: string
  responsavelId: string | null
  responsaveis: { usuarioId: string }[]
  editor: { usuarioId: string | null } | null
  designer: { usuarioId: string | null } | null
}

/** Quem faz a peça: os responsáveis, o editor e o designer do card. */
export function fazAPeca(usuarioId: string, d: PessoasDoCard): boolean {
  return [
    d.responsavelId,
    ...d.responsaveis.map((r) => r.usuarioId),
    d.editor?.usuarioId,
    d.designer?.usuarioId,
  ].includes(usuarioId)
}

/** O mesmo "quem faz a peça", como filtro de lista (GET /api/aprovacao-video). */
export function filtroFazAPeca(usuarioId: string): Prisma.DemandaWhereInput {
  return {
    OR: [
      { responsavelId: usuarioId },
      { responsaveis: { some: { usuarioId } } },
      { editor: { usuarioId } },
      { designer: { usuarioId } },
    ],
  }
}

/** A regra, sem banco: quem já está no escopo e não é gestão nem tem "Editar Demanda". */
export function podeEnviarPeloCard(usuarioId: string, d: PessoasDoCard, arquivo: ArquivoDaDemanda): boolean {
  if (fazAPeca(usuarioId, d)) return true
  return arquivo === "documento" && d.solicitanteId === usuarioId
}

/** O que a regra de cada rota pode olhar no card, além de quem faz a peça. */
export type CardDaGuarda = PessoasDoCard & {
  socialId: string | null
  edicaoPor: string | null
  videomaker: { usuarioId: string | null } | null
}

/**
 * A guarda das rotas que mexem num card (12/11/2026): a mesma régua do envio,
 * para checklist, produto, conversão em evento e os links da ficha. Roda
 * DEPOIS de `requireDemandaOrg`, que confere a empresa. Devolve `null` para
 * liberar; senão, a resposta: 404 fora do escopo, como a ficha; 403 no escopo
 * para quem não é gestão, não tem "Editar Demanda" e a `regra` não libera.
 */
export async function guardaDoCard(
  session: Session,
  organizacaoId: string,
  demandaId: string,
  regra: (usuarioId: string, d: CardDaGuarda) => boolean,
  mensagem: string
): Promise<NextResponse | null> {
  const usuarioId = session.user?.id
  const gestor = ehGestor(session)
  if (!usuarioId || !(await demandaNoEscopo(usuarioId, organizacaoId, gestor, demandaId))) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  }
  if (gestor) return null

  const vinculo = await permissoesEfetivas(usuarioId, organizacaoId)
  if (vinculo?.permissoes.editarDemanda) return null

  const d = await prisma.demanda.findFirst({
    where: { id: demandaId, organizacaoId },
    select: {
      solicitanteId: true,
      responsavelId: true,
      socialId: true,
      edicaoPor: true,
      responsaveis: { select: { usuarioId: true } },
      editor: { select: { usuarioId: true } },
      designer: { select: { usuarioId: true } },
      videomaker: { select: { usuarioId: true } },
    },
  })
  if (d && regra(usuarioId, d)) return null
  return NextResponse.json({ error: mensagem }, { status: 403 })
}

/** Só o escopo, para as leituras: fora dele, 404, como a ficha. */
export async function guardaDoEscopo(session: Session, organizacaoId: string, demandaId: string): Promise<NextResponse | null> {
  const usuarioId = session.user?.id
  if (!usuarioId || !(await demandaNoEscopo(usuarioId, organizacaoId, ehGestor(session), demandaId))) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  }
  return null
}

/**
 * A guarda das rotas de arquivo. Roda DEPOIS de `requireDemandaOrg`, que
 * confere a empresa. Devolve `null` para liberar; senão, a resposta (404 fora
 * do escopo, 403 no escopo sem permissão).
 */
export async function guardaDoEnvio(
  session: Session,
  organizacaoId: string,
  demandaId: string,
  arquivo: ArquivoDaDemanda
): Promise<NextResponse | null> {
  return guardaDoCard(session, organizacaoId, demandaId, (u, d) => podeEnviarPeloCard(u, d, arquivo), SEM_PERMISSAO_DE_ENVIO)
}

// ── As outras rotas do card (12/11/2026) ─────────────────────────────────────
//
// A varredura de 04/11 achou mais rotas que conferiam só a empresa: o checklist,
// os produtos, a conversão em evento, a lista de aprovações e os links do
// material no PUT da ficha. A régua é a mesma: escopo (404) e, nele, gestão,
// "Editar Demanda" ou quem faz a peça. As exceções abaixo vêm de quem usa a
// tela, para não barrar quem trabalha.

export const SEM_PERMISSAO_NO_CARD =
  "Neste card, só mexe quem faz a peça, quem pode editar demandas ou a gestão."

const souOVideomaker = (usuarioId: string, d: CardDaGuarda) => !!d.videomaker?.usuarioId && d.videomaker.usuarioId === usuarioId

/**
 * Marcar e desmarcar item do checklist: também o videomaker e o social do
 * card. O checklist tem os grupos "VM Externo" e "Social Media", e o painel
 * "Em foco" (PainelExecutor) oferece marcar a quem está com o card, inclusive
 * o videomaker. Criar, renomear e apagar item fica com quem faz a peça.
 */
export function podeMarcarChecklist(usuarioId: string, d: CardDaGuarda): boolean {
  return fazAPeca(usuarioId, d) || souOVideomaker(usuarioId, d) || d.socialId === usuarioId
}

/**
 * Trocar `linkBrutos` ou `linkFinal` pelo PUT da ficha. O videomaker do card
 * salva o material dele ali (#136): os brutos sempre; o vídeo final só quando a
 * edição é dele, ou sem edição (os brutos são o vídeo final). É a mesma régua
 * da entrega pelo link do convite (lib/entrega-da-gravacao.ts). Na edição da
 * equipe, o vídeo final é de quem edita.
 */
export function podeTrocarLinksDoMaterial(
  usuarioId: string,
  d: CardDaGuarda,
  campos: { linkBrutos: boolean; linkFinal: boolean }
): boolean {
  if (fazAPeca(usuarioId, d)) return true
  if (!souOVideomaker(usuarioId, d)) return false
  return !campos.linkFinal || d.edicaoPor === "videomaker" || d.edicaoPor === "sem_edicao"
}
