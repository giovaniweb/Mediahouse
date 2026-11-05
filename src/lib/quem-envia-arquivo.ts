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

/** A regra, sem banco: quem já está no escopo e não é gestão nem tem "Editar Demanda". */
export function podeEnviarPeloCard(usuarioId: string, d: PessoasDoCard, arquivo: ArquivoDaDemanda): boolean {
  const fazAPeca = [
    d.responsavelId,
    ...d.responsaveis.map((r) => r.usuarioId),
    d.editor?.usuarioId,
    d.designer?.usuarioId,
  ].includes(usuarioId)
  if (fazAPeca) return true
  return arquivo === "documento" && d.solicitanteId === usuarioId
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
      responsaveis: { select: { usuarioId: true } },
      editor: { select: { usuarioId: true } },
      designer: { select: { usuarioId: true } },
    },
  })
  if (d && podeEnviarPeloCard(usuarioId, d, arquivo)) return null
  return NextResponse.json({ error: SEM_PERMISSAO_DE_ENVIO }, { status: 403 })
}
