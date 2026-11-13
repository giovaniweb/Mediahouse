// Quais alertas o sino de uma pessoa mostra.
//
// O sino lia "broadcast (usuarioId null) + os dirigidos a mim" da empresa ativa,
// sem olhar o papel. Quase todo alerta nasce broadcast e preso a um card
// (aprovado, ajuste pedido, nova demanda, prazo vencido…), então qualquer pessoa
// — uma videomaker parceira, um editor freela, um solicitante — via no sino a
// atividade da empresa inteira. Em 13/11/2026 o Giovani entrou como a Tatiane
// (videomaker externa) e viu tudo.
//
// A regra agora é a do quadro (`oQueAPessoaVe`): o alerta preso a um card só
// aparece para quem enxerga o card; o dirigido à pessoa e sem card, só para
// ela; o broadcast sem card (WhatsApp desconectado, ação do assistente…) é
// assunto da gestão. Gestão e admin continuam como antes.
import type { Prisma } from "@prisma/client"
import type { Session } from "next-auth"
import { ehGestor } from "@/lib/papel"
import { oQueAPessoaVe } from "@/lib/escopo-demanda"

export async function alertasDoSino(session: Session, organizacaoId: string): Promise<Prisma.AlertaIAWhereInput> {
  const eu = session.user.id
  if (ehGestor(session)) {
    return { organizacaoId, OR: [{ usuarioId: null }, { usuarioId: eu }] }
  }
  const card: Prisma.AlertaIAWhereInput = { demanda: { is: await oQueAPessoaVe(session, organizacaoId) } }
  return {
    organizacaoId,
    OR: [
      { usuarioId: eu, demandaId: null },
      { usuarioId: eu, ...card },
      { usuarioId: null, ...card },
    ],
  }
}
